"""Google Indexing API (D-68): what is queued, what is sent, and how failures are handled. Google is never
contacted: every answer comes from a recorded fake transport, and the service-account key is generated here."""

from __future__ import annotations

import base64
import json
import os
import stat
from datetime import timedelta
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from core.models import JobRun
from indexing import google, service
from indexing.eligibility import carries_job_posting
from indexing.models import Action, IndexingNotification, IndexingQuotaDay, Status
from opportunities import workflow
from opportunities.models import Opportunity
from tests.factories import World, published, varied

pytestmark = pytest.mark.django_db
BASE = "https://upnext.co.zw"


class FakeGoogle:
    """Records every request and answers from a script: (status, body) per publish call, in order."""

    def __init__(self, publish: list[int] | None = None, token_status: int = 200) -> None:
        self.publish_answers = list(publish or [])
        self.token_status = token_status
        self.calls: list[tuple[str, bytes, dict[str, str]]] = []

    def __call__(self, url: str, body: bytes, headers: dict[str, str], timeout: float) -> tuple[int, bytes]:
        self.calls.append((url, body, headers))
        if url == google.TOKEN_URL:
            if self.token_status != 200:
                return self.token_status, b'{"error":"invalid_grant"}'
            return 200, json.dumps({"access_token": "ya29.test-token", "expires_in": 3600}).encode()
        assert url == google.PUBLISH_URL
        answer = self.publish_answers.pop(0) if self.publish_answers else 200
        if answer == -1:
            raise OSError("connection reset")
        return answer, b"{}"

    @property
    def published(self) -> list[dict[str, str]]:
        return [json.loads(body) for url, body, _ in self.calls if url == google.PUBLISH_URL]

    @property
    def token_calls(self) -> int:
        return sum(1 for url, *_ in self.calls if url == google.TOKEN_URL)


@pytest.fixture
def key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def key_file(tmp_path: Path, key: rsa.RSAPrivateKey) -> Path:
    pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    path = tmp_path / "indexing-key.json"
    path.write_text(
        json.dumps(
            {
                "type": "service_account",
                "project_id": "upnext-test",
                "private_key_id": "kid-123",
                "private_key": pem,
                "client_email": "indexer@upnext-test.iam.gserviceaccount.com",
                "token_uri": google.TOKEN_URL,
            }
        )
    )
    os.chmod(path, 0o600)
    return path


@pytest.fixture
def live(settings: Any, key_file: Path) -> None:
    settings.UPNEXT_INDEXING_MODE = "live"
    settings.UPNEXT_INDEXING_CREDENTIALS_FILE = str(key_file)
    settings.UPNEXT_PUBLIC_BASE_URL = BASE
    settings.UPNEXT_INDEXING_DAILY_QUOTA = 200
    settings.UPNEXT_INDEXING_BATCH = 20


def job(
    world: World, people: dict[str, User], tag: str = "a", example: str = "jobs-1", **extra: Any
) -> Opportunity:
    return published(
        world, people["author"], people["editor"], example=example, **varied(world, example, tag, **extra)
    )


def rows() -> list[IndexingNotification]:
    return list(IndexingNotification.objects.order_by("created_at"))


def due_now() -> None:
    IndexingNotification.objects.filter(status__in=[Status.PENDING, Status.FAILED]).update(
        next_attempt_at=timezone.now() - timedelta(seconds=1)
    )


# --- what is queued -----------------------------------------------------------------------------------------
def test_off_by_default_nothing_is_recorded(world: World, people: dict[str, User], settings: Any) -> None:
    settings.UPNEXT_INDEXING_MODE = "off"
    job(world, people)
    assert rows() == []


def test_record_mode_queues_the_job_page_but_sends_nothing(
    world: World, people: dict[str, User], settings: Any
) -> None:
    settings.UPNEXT_INDEXING_MODE, settings.UPNEXT_PUBLIC_BASE_URL = "record", BASE
    opp = job(world, people)
    [row] = rows()
    assert (row.action, row.url, row.transition, row.status) == (
        Action.UPDATED,
        f"{BASE}/opportunities/{opp.slug}",
        "T07",
        Status.PENDING,
    )
    assert service.run().status == "record" and rows()[0].status == Status.PENDING


def test_only_pages_that_carry_job_posting_are_queued(
    world: World, people: dict[str, User], live: None
) -> None:
    job(world, people, "tender", example="tenders-1")
    job(world, people, "grant", example="grants-1")
    job(world, people, "scholarship", example="scholarships-1")
    remote_without_country = job(
        world,
        people,
        "remote",
        work_mode="remote",
        locations=[{"location_id": world.locations["remote"], "is_primary": True}],
    )
    assert rows() == []
    assert remote_without_country.slug  # published, but its page has no JobPosting (no applicant country)
    countrywide_remote = job(
        world,
        people,
        "zw",
        work_mode="remote",
        locations=[{"location_id": world.locations["zimbabwe"], "is_primary": True}],
    )
    internship = job(world, people, "intern", example="internships-1")
    programme = job(world, people, "gp", example="graduate-programmes-1")
    assert {r.opportunity_id for r in rows()} == {countrywide_remote.pk, internship.pk, programme.pk}


def test_eligibility_mirrors_the_web_job_posting_rule(world: World, people: dict[str, User]) -> None:
    opp = job(world, people)
    now = timezone.now()
    assert carries_job_posting(opp, opp.live_version, now)
    assert opp.live_version is not None and opp.live_version.deadline_at is not None
    assert not carries_job_posting(opp, opp.live_version, opp.live_version.deadline_at + timedelta(seconds=1))
    opp.status = "withdrawn"
    assert not carries_job_posting(opp, opp.live_version, now)


def test_closing_a_job_sends_one_removal_and_supersedes_the_unsent_update(
    world: World, people: dict[str, User], live: None
) -> None:
    opp = job(world, people)
    opp.refresh_from_db()
    workflow.withdraw(
        people["editor"], opp.pk, expected_row_version=opp.row_version, reason="issuer withdrew"
    )
    opp.refresh_from_db()
    workflow.archive(people["editor"], opp.pk, expected_row_version=opp.row_version)
    first, second = rows()
    assert (first.action, first.status) == (Action.UPDATED, Status.SUPERSEDED)
    assert (second.action, second.status, second.transition) == (Action.DELETED, Status.PENDING, "T10")
    # archiving after the withdrawal did not queue a second removal


@pytest.mark.parametrize("close", ["expire", "takedown", "expire_due"])
def test_every_way_of_closing_a_job_is_a_removal(
    world: World, people: dict[str, User], live: None, close: str
) -> None:
    opp = job(world, people)
    opp.refresh_from_db()
    if close == "expire":
        workflow.expire(
            people["editor"], opp.pk, expected_row_version=opp.row_version, reason="closed early by issuer"
        )
    elif close == "takedown":
        workflow.takedown(
            people["editor"],
            opp.pk,
            expected_row_version=opp.row_version,
            reason_code="error",
            reason="Listed in error.",
        )
    else:
        assert opp.live_version is not None and opp.live_version.deadline_at is not None
        assert workflow.expire_due(opp.live_version.deadline_at + timedelta(minutes=1)) == 1
    assert rows()[-1].action == Action.DELETED


def test_closing_a_listing_that_is_not_a_job_sends_nothing(
    world: World, people: dict[str, User], live: None
) -> None:
    grant = job(world, people, "grant", example="grants-1")
    grant.refresh_from_db()
    workflow.withdraw(
        people["editor"], grant.pk, expected_row_version=grant.row_version, reason="issuer withdrew"
    )
    assert rows() == []


def test_one_row_per_event_even_if_the_signal_repeats(
    world: World, people: dict[str, User], live: None
) -> None:
    opp = job(world, people)
    [row] = rows()
    from opportunities.models import PublishingEvent

    event = PublishingEvent.objects.filter(opportunity=opp, transition="T07").latest("occurred_at")
    assert service.enqueue(event, opp, opp.live_version) == 0
    assert rows() == [row] and row.idempotency_key == f"event:{event.pk}"


def test_a_rolled_back_decision_queues_nothing(world: World, people: dict[str, User], live: None) -> None:
    opp = job(world, people)
    opp.refresh_from_db()

    def decide_then_fail() -> None:
        with transaction.atomic():
            workflow.withdraw(
                people["editor"], opp.pk, expected_row_version=opp.row_version, reason="issuer withdrew"
            )
            raise RuntimeError("the caller's transaction fails after the decision")

    with pytest.raises(RuntimeError):
        decide_then_fail()
    assert [r.action for r in rows()] == [Action.UPDATED]


def test_a_queue_failure_never_blocks_an_editorial_decision(
    world: World, people: dict[str, User], live: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    def broken(*a: Any, **k: Any) -> int:
        raise RuntimeError("database hiccup")

    monkeypatch.setattr(service, "enqueue", broken)
    opp = job(world, people)
    opp.refresh_from_db()
    workflow.withdraw(
        people["editor"], opp.pk, expected_row_version=opp.row_version, reason="issuer withdrew"
    )
    opp.refresh_from_db()
    assert opp.status == "withdrawn" and rows() == []


# --- sending ------------------------------------------------------------------------------------------------
def test_sends_with_a_signed_service_account_token(
    world: World, people: dict[str, User], live: None, key: rsa.RSAPrivateKey
) -> None:
    opp = job(world, people)
    fake = FakeGoogle([200])
    result = service.run(transport=fake)
    assert result.status == "ran" and result.counts == {"sent": 1}
    assert fake.published == [{"url": f"{BASE}/opportunities/{opp.slug}", "type": "URL_UPDATED"}]
    publish_headers = next(h for u, _, h in fake.calls if u == google.PUBLISH_URL)
    assert publish_headers["Authorization"] == "Bearer ya29.test-token"
    # The token request is a JWT-bearer grant whose assertion verifies with the service account's public key.
    token_body = next(b for u, b, _ in fake.calls if u == google.TOKEN_URL)
    form = parse_qs(token_body.decode())
    assert form["grant_type"] == ["urn:ietf:params:oauth:grant-type:jwt-bearer"]
    header_b64, claims_b64, sig_b64 = form["assertion"][0].split(".")

    def pad(part: str) -> str:
        return part + "=" * (-len(part) % 4)

    header = json.loads(base64.urlsafe_b64decode(pad(header_b64)))
    claims = json.loads(base64.urlsafe_b64decode(pad(claims_b64)))
    assert header == {"alg": "RS256", "typ": "JWT", "kid": "kid-123"}
    assert claims["iss"] == "indexer@upnext-test.iam.gserviceaccount.com"
    assert claims["scope"] == "https://www.googleapis.com/auth/indexing"  # nothing broader
    assert claims["aud"] == google.TOKEN_URL and claims["exp"] - claims["iat"] == 3600
    key.public_key().verify(
        base64.urlsafe_b64decode(pad(sig_b64)),
        f"{header_b64}.{claims_b64}".encode(),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    [row] = rows()
    assert (row.status, row.response_status, row.attempts) == (Status.SENT, 200, 1)
    assert IndexingQuotaDay.objects.get().used == 1
    assert JobRun.objects.get(name="indexing").last_status == "ok"


def test_one_token_serves_a_batch(world: World, people: dict[str, User], live: None) -> None:
    for tag in ("a", "b", "c"):
        job(world, people, tag)
    fake = FakeGoogle([200, 200, 200])
    assert service.run(transport=fake).counts == {"sent": 3}
    assert fake.token_calls == 1


def test_server_errors_and_network_errors_retry_with_backoff(
    world: World, people: dict[str, User], live: None
) -> None:
    job(world, people, "a")
    job(world, people, "b")
    before = timezone.now()
    assert service.run(transport=FakeGoogle([503, -1])).counts == {"failed": 2}
    for row in rows():
        assert row.status == Status.FAILED and row.attempts == 1
        wait = (row.next_attempt_at - before).total_seconds()
        assert 45 <= wait <= 75, wait  # first back-off step: 60 s with jitter
    assert {r.last_error for r in rows()} == {"http_503", "network_error"}
    assert service.run(transport=FakeGoogle()).counts == {}  # not due yet: nothing sent
    due_now()
    assert service.run(transport=FakeGoogle([200, 200])).counts == {"sent": 2}


def test_backoff_grows_and_ends_dead_after_the_last_attempt(
    world: World, people: dict[str, User], live: None
) -> None:
    job(world, people)
    waits = []
    for _ in range(service.MAX_ATTEMPTS):
        due_now()
        start = timezone.now()
        service.run(transport=FakeGoogle([500]))
        row = rows()[0]
        if row.status == Status.FAILED:
            waits.append((row.next_attempt_at - start).total_seconds())
    assert rows()[0].status == Status.DEAD and "out of attempts" in rows()[0].last_error
    # Each step is at least 3x the previous, so the order survives the +-20% jitter until the 24 h cap.
    steps = len(service.BACKOFF_SECONDS)
    assert waits[:steps] == sorted(waits[:steps])
    assert all(0.8 * 86400 <= w <= 1.2 * 86400 for w in waits[steps - 1 :])


def test_a_permanent_rejection_is_dead_and_raises_an_alert(
    world: World, people: dict[str, User], live: None
) -> None:
    from core.alerts import evaluate

    job(world, people)
    assert service.run(transport=FakeGoogle([403])).counts == {"dead": 1}
    assert rows()[0].last_error == "http_403"
    assert "indexing.dead" in {a.code for a in evaluate()}


def test_googles_429_ends_the_day_and_defers_the_rest_without_spending_attempts(
    world: World, people: dict[str, User], live: None
) -> None:
    for tag in ("a", "b", "c"):
        job(world, people, tag)
    fake = FakeGoogle([200, 429])
    result = service.run(transport=fake)
    assert result.counts == {"sent": 1, "deferred": 1}
    assert len(fake.published) == 2  # the third was never attempted
    waiting = [r for r in rows() if r.status == Status.FAILED]
    assert len(waiting) == 2 and all(r.attempts == 0 for r in waiting)
    tomorrow = service.next_quota_day(timezone.now())
    assert all(abs((r.next_attempt_at - tomorrow).total_seconds()) < 2 for r in waiting)
    assert service.quota_used(timezone.now()) == 200  # our count now matches Google's


def test_never_more_requests_than_the_daily_quota(
    world: World, people: dict[str, User], live: None, settings: Any
) -> None:
    settings.UPNEXT_INDEXING_DAILY_QUOTA = 2
    for tag in ("a", "b", "c"):
        job(world, people, tag)
    fake = FakeGoogle()
    assert service.run(transport=fake).counts == {"sent": 2, "deferred": 1}
    assert len(fake.published) == 2
    due_now()
    assert service.run(transport=fake).counts == {"deferred": 1}  # still the same quota day
    assert len(fake.published) == 2


def test_the_quota_day_follows_pacific_midnight() -> None:
    from datetime import UTC, datetime

    late_utc = datetime(2026, 11, 5, 7, 30, tzinfo=UTC)  # 23:30 on 4 November in Los Angeles
    assert str(service.quota_day(late_utc)) == "2026-11-04"
    assert service.next_quota_day(late_utc) == datetime(2026, 11, 5, 8, 5, tzinfo=UTC)


def test_a_401_drops_the_token_and_retries(world: World, people: dict[str, User], live: None) -> None:
    job(world, people)
    assert service.run(transport=FakeGoogle([401])).counts == {"failed": 1}
    assert rows()[0].last_error == "http_401"


def test_the_current_state_wins_over_the_queue(
    world: World, people: dict[str, User], live: None, settings: Any
) -> None:
    opp = job(world, people)
    settings.UPNEXT_INDEXING_MODE = "off"  # the withdrawal is not queued, so only the stale update is waiting
    opp.refresh_from_db()
    workflow.withdraw(
        people["editor"], opp.pk, expected_row_version=opp.row_version, reason="issuer withdrew"
    )
    settings.UPNEXT_INDEXING_MODE = "live"
    fake = FakeGoogle()
    assert service.run(transport=fake).counts == {"superseded": 1}
    assert fake.published == [] and rows()[0].last_error == "state_changed"


def test_a_claim_left_by_a_crashed_worker_is_picked_up_again(
    world: World, people: dict[str, User], live: None
) -> None:
    job(world, people)
    IndexingNotification.objects.update(
        status=Status.SENDING, locked_at=timezone.now() - timedelta(hours=1), locked_by="worker-gone"
    )
    assert service.run(transport=FakeGoogle([200])).counts == {"sent": 1}


# --- credentials and tokens ---------------------------------------------------------------------------------
def test_missing_or_tampered_credentials_stop_sending_but_keep_the_queue(
    world: World, people: dict[str, User], live: None, settings: Any, key_file: Path
) -> None:
    job(world, people)
    settings.UPNEXT_INDEXING_CREDENTIALS_FILE = str(key_file.with_name("absent.json"))
    fake = FakeGoogle()
    result = service.run(transport=fake)
    assert (result.status, result.detail) == ("credentials_error", "credentials_file_missing")
    assert fake.calls == [] and rows()[0].status == Status.PENDING
    assert JobRun.objects.get(name="indexing").last_status == "failed"
    data = json.loads(key_file.read_text())
    data["token_uri"] = "https://attacker.example/token"
    key_file.write_text(json.dumps(data))
    settings.UPNEXT_INDEXING_CREDENTIALS_FILE = str(key_file)
    assert service.run(transport=fake).detail == "credentials_unexpected_token_uri"
    assert fake.calls == []  # the signed assertion never left the process


def test_a_refused_token_spends_no_quota_and_no_attempt(
    world: World, people: dict[str, User], live: None
) -> None:
    job(world, people)
    result = service.run(transport=FakeGoogle(token_status=400))
    assert (result.status, result.detail) == ("token_error", "token_http_400")
    assert rows()[0].status == Status.PENDING and rows()[0].attempts == 0
    assert service.quota_used(timezone.now()) == 0


def test_the_key_never_appears_in_a_representation(key_file: Path) -> None:
    creds = google.load_credentials(str(key_file))
    assert "PRIVATE" not in repr(creds) and "BEGIN" not in str(creds)


def test_the_credentials_are_not_exposed_through_any_api(client: Any, live: None) -> None:
    for path in ("/api/v1/sitemap", "/api/v1/opportunities", "/api/v1/"):
        body = client.get(path).content.decode()
        assert "indexer@" not in body and "kid-123" not in body


# --- configuration checks -----------------------------------------------------------------------------------
def test_preflight_requires_a_private_key_file_outside_the_app(settings: Any, key_file: Path) -> None:
    from core.preflight import PASS, settings_findings

    def passes(name: str) -> bool:
        return next(f for f in settings_findings(settings, {}) if f.name.startswith(name)).status == PASS

    settings.UPNEXT_INDEXING_MODE = "live"
    settings.UPNEXT_INDEXING_CREDENTIALS_FILE = str(key_file)
    assert passes("Indexing API key file is mounted")
    os.chmod(key_file, 0o644)
    assert not passes("Indexing API key file is mounted")  # readable by others
    os.chmod(key_file, stat.S_IRUSR | stat.S_IWUSR)
    settings.UPNEXT_INDEXING_CREDENTIALS_FILE = str(key_file.with_name("absent.json"))
    assert not passes("Indexing API key file is mounted")
    settings.UPNEXT_INDEXING_CREDENTIALS_FILE = ""  # the api container: queues only, a warning not a failure
    names = {f.name: f.status for f in settings_findings(settings, {})}
    assert names["Indexing API key file is given to this process"] == "warn"
    assert "Indexing API key file is mounted, private and outside the application" not in names
    settings.UPNEXT_INDEXING_MODE = "sometimes"
    assert not passes("Indexing API mode is known")


def test_the_worker_cycle_runs_indexing_without_failing_when_off(settings: Any) -> None:
    from django.core.management import call_command

    settings.UPNEXT_INDEXING_MODE = "off"
    call_command("run_worker", "--once")
    call_command("indexing_status")
