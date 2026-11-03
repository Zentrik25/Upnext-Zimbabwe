"""Google Indexing API notifications (ADR-0027): what is queued, what is never queued, how sending behaves.

No test touches the network: the HTTP layer of `seo.google` is replaced by a fake transport.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.core.management import call_command
from django.utils import timezone

from accounts.models import User
from opportunities import workflow
from opportunities.models import Opportunity
from seo import google, indexing
from seo.models import IndexingNotification
from tests.factories import CHECKLIST, World, new_draft, published, varied

pytestmark = pytest.mark.django_db


def _loc(world: World, *slugs: str) -> dict[str, Any]:
    return {
        "locations": [{"location_id": world.locations[s], "is_primary": i == 0} for i, s in enumerate(slugs)]
    }


def live(world: World, people: dict[str, User], example: str, tag: str, **extra: Any) -> Opportunity:
    return published(
        world, people["author"], people["editor"], example=example, **varied(world, example, tag, **extra)
    )


def rows() -> list[IndexingNotification]:
    return list(IndexingNotification.objects.order_by("created_at"))


# --- what is queued -----------------------------------------------------------------------------------------
def test_publishing_a_job_with_a_place_queues_url_updated(
    world: World, people: dict[str, User], settings: Any
) -> None:
    settings.UPNEXT_PUBLIC_BASE_URL = "https://upnext.co.zw"
    opp = live(world, people, "jobs-1", "a")
    (row,) = rows()
    assert (row.kind, row.trigger, row.status) == ("URL_UPDATED", "T07", "pending")
    assert row.url == f"https://upnext.co.zw/opportunities/{opp.slug}"
    assert row.opportunity_id == opp.pk


@pytest.mark.parametrize("example", ["scholarships-1", "grants-1", "tenders-1"])
def test_non_job_categories_are_never_submitted(world: World, people: dict[str, User], example: str) -> None:
    live(world, people, example, "x")
    assert rows() == []


def test_a_job_without_a_stated_place_is_not_submitted(world: World, people: dict[str, User]) -> None:
    # Mirrors the web rule: no place means no JobPosting markup, so Google must not be told about the page.
    live(world, people, "jobs-1", "noplace", locations=[])
    assert rows() == []


def test_countrywide_and_remote_rules_match_the_web_markup(world: World, people: dict[str, User]) -> None:
    live(world, people, "jobs-1", "countrywide", **_loc(world, "zimbabwe"))
    live(world, people, "jobs-2", "remoteok", work_mode="remote", **_loc(world, "remote", "zimbabwe"))
    live(world, people, "jobs-1", "remotebad", work_mode="remote", **_loc(world, "harare"))
    assert len(rows()) == 2  # a remote listing needs a stated Zimbabwe, as in jobPostingFor


def test_drafts_and_unpublished_work_queue_nothing(world: World, people: dict[str, User]) -> None:
    new_draft(world, people["author"], "jobs-1", **varied(world, "jobs-1", "d"))
    assert rows() == []


def test_a_material_update_while_a_notification_waits_does_not_add_a_second_row(
    world: World, people: dict[str, User]
) -> None:
    opp = live(world, people, "jobs-1", "dup")
    opp.refresh_from_db()
    workflow.amend(people["author_editor"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    workflow.save_draft(
        people["author_editor"],
        opp.pk,
        expected_row_version=opp.row_version,
        content={"summary": "A materially different summary of the post."},
    )
    opp.refresh_from_db()
    workflow.submit(people["author_editor"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    workflow.approve(people["editor2"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    opp.refresh_from_db()
    workflow.publish(people["author_editor"], opp.pk, expected_row_version=opp.row_version)
    assert len(rows()) == 1  # the open row absorbed the second publication


def test_the_database_allows_one_open_notification_per_address() -> None:
    from django.db import IntegrityError, transaction

    IndexingNotification.objects.create(
        url="https://upnext.co.zw/opportunities/a", kind="URL_UPDATED", trigger="T07"
    )
    with pytest.raises(IntegrityError), transaction.atomic():
        IndexingNotification.objects.create(
            url="https://upnext.co.zw/opportunities/a", kind="URL_DELETED", trigger="T10"
        )


@pytest.mark.parametrize("how", ["withdraw", "takedown", "expire"])
def test_closing_a_listing_switches_the_open_row_to_url_deleted(
    world: World, people: dict[str, User], how: str
) -> None:
    opp = live(world, people, "jobs-1", how)
    opp.refresh_from_db()
    if how == "withdraw":
        workflow.withdraw(
            people["editor"], opp.pk, expected_row_version=opp.row_version, reason="issuer withdrew"
        )
    elif how == "takedown":
        workflow.takedown(
            people["editor"],
            opp.pk,
            expected_row_version=opp.row_version,
            reason_code="error",
            reason="Listed in error.",
        )
    else:
        workflow.expire(
            people["editor"], opp.pk, expected_row_version=opp.row_version, reason="deadline passed"
        )
    (row,) = rows()
    assert row.kind == "URL_DELETED" and row.status == "pending"


def test_a_listing_closed_after_google_was_told_gets_a_removal_once(
    world: World, people: dict[str, User], settings: Any
) -> None:
    opp = live(world, people, "jobs-1", "closed")
    IndexingNotification.objects.update(status="sent", sent_at=timezone.now())
    opp.refresh_from_db()
    workflow.expire(people["editor"], opp.pk, expected_row_version=opp.row_version, reason="deadline passed")
    assert [r.kind for r in rows()] == ["URL_UPDATED", "URL_DELETED"]
    IndexingNotification.objects.filter(kind="URL_DELETED").update(status="sent", sent_at=timezone.now())
    opp.refresh_from_db()
    workflow.archive(people["editor"], opp.pk, expected_row_version=opp.row_version)
    assert len(rows()) == 2  # archiving an already removed page queues nothing more


def test_the_expiry_job_queues_a_removal(world: World, people: dict[str, User]) -> None:
    opp = live(world, people, "jobs-1", "auto")
    opp.refresh_from_db()
    assert opp.live_version is not None and opp.live_version.deadline_at is not None
    workflow.expire_due(now=opp.live_version.deadline_at + timedelta(minutes=1))
    assert rows()[-1].kind == "URL_DELETED"


def test_a_failing_receiver_cannot_block_publication(
    world: World, people: dict[str, User], monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(*args: Any, **kwargs: Any) -> None:
        raise RuntimeError("queue broken")

    monkeypatch.setattr(indexing, "queue_for", boom)
    opp = live(world, people, "jobs-1", "safe")
    opp.refresh_from_db()
    assert opp.status == "published"


# --- credentials and the Google client --------------------------------------------------------------------
def make_key() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()


@pytest.fixture
def account(settings: Any) -> str:
    key = make_key()
    settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_JSON = json.dumps(
        {
            "type": "service_account",
            "client_email": "indexer@proj.iam.gserviceaccount.com",
            "private_key": key,
        }
    )
    settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_FILE = ""
    return key


class FakeGoogle:
    """A transport that answers the token endpoint and the publish endpoint from a script."""

    def __init__(self, script: list[Any] | None = None) -> None:
        self.script = list(script or [])
        self.published: list[dict[str, str]] = []
        self.tokens = 0

    def __call__(self, method: str, url: str, headers: dict[str, str], body: bytes | None, timeout: float):  # type: ignore[no-untyped-def]
        if url == google.TOKEN_URI:
            self.tokens += 1
            return 200, json.dumps({"access_token": "tok", "expires_in": 3600}).encode()
        assert headers["Authorization"] == "Bearer tok"
        payload = json.loads(body or b"{}")
        step = self.script.pop(0) if self.script else 200
        if isinstance(step, Exception):
            raise step
        if step == 200:
            self.published.append(payload)
            return 200, json.dumps(
                {
                    "urlNotificationMetadata": {
                        "url": payload["url"],
                        "latestUpdate": {"notifyTime": "2026-11-03T10:00:00Z"},
                    }
                }
            ).encode()
        return step, json.dumps({"error": {"status": "STATUS", "message": "no"}}).encode()


def factory_for(fake: FakeGoogle) -> Callable[[google.Credentials], google.IndexingClient]:
    return lambda creds: google.IndexingClient(google.TokenSource(creds, fake), fake)


def queue_one(world: World, people: dict[str, User], tag: str = "q") -> IndexingNotification:
    live(world, people, "jobs-1", tag)
    return rows()[-1]


def test_nothing_is_sent_while_submissions_are_disabled(
    world: World, people: dict[str, User], account: str, settings: Any
) -> None:
    queue_one(world, people)
    settings.UPNEXT_INDEXING_ENABLED = False
    fake = FakeGoogle()
    assert indexing.run(client_factory=factory_for(fake)).status == "disabled"
    assert fake.published == [] and fake.tokens == 0
    assert rows()[0].status == "pending"


def test_enabled_without_a_key_reports_not_configured_and_sends_nothing(
    world: World, people: dict[str, User], settings: Any
) -> None:
    queue_one(world, people)
    settings.UPNEXT_INDEXING_ENABLED = True
    settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_JSON = ""
    settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_FILE = ""
    assert indexing.run().status == "not_configured"
    assert rows()[0].status == "pending"


def test_a_successful_send_is_recorded_without_claiming_indexing(
    world: World, people: dict[str, User], account: str, settings: Any
) -> None:
    queue_one(world, people)
    settings.UPNEXT_INDEXING_ENABLED = True
    fake = FakeGoogle()
    result = indexing.run(client_factory=factory_for(fake))
    assert (result.status, result.sent) == ("ran", 1)
    assert fake.published[0]["type"] == "URL_UPDATED"
    row = rows()[0]
    assert (row.status, row.http_status, row.attempts) == ("sent", 200, 1)
    assert row.google_notify_time is not None and row.sent_at is not None


def test_the_jwt_assertion_is_signed_with_the_service_account_key(account: str) -> None:
    import base64

    sent: list[bytes] = []

    def transport(method: str, url: str, headers: dict[str, str], body: bytes | None, timeout: float):  # type: ignore[no-untyped-def]
        sent.append(body or b"")
        return 200, json.dumps({"access_token": "t", "expires_in": 3600}).encode()

    tokens = google.TokenSource(google.load_credentials(), transport)
    assert tokens.token(google.SCOPE_INDEXING) == "t"
    assert tokens.token(google.SCOPE_INDEXING) == "t" and len(sent) == 1  # cached
    from urllib.parse import parse_qs

    assertion = parse_qs(sent[0].decode())["assertion"][0]
    header, claims, signature = assertion.split(".")

    def pad(value: str) -> str:
        return value + "=" * (-len(value) % 4)

    body = json.loads(base64.urlsafe_b64decode(pad(claims)))
    assert body["iss"] == "indexer@proj.iam.gserviceaccount.com"
    assert body["scope"] == google.SCOPE_INDEXING and body["aud"] == google.TOKEN_URI
    key = serialization.load_pem_private_key(account.encode(), password=None)
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    public_key = key.public_key()
    assert isinstance(public_key, rsa.RSAPublicKey)
    public_key.verify(
        base64.urlsafe_b64decode(pad(signature)),
        f"{header}.{claims}".encode(),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )


def test_credentials_errors_never_contain_the_key(settings: Any) -> None:
    secret = "-----BEGIN " + "PRIVATE KEY-----\nTOPSECRET\n-----END " + "PRIVATE KEY-----\n"
    settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_FILE = ""
    settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_JSON = json.dumps(
        {"type": "service_account", "client_email": "a@b.c", "private_key": secret}
    )
    with pytest.raises(google.CredentialsError) as caught:
        google.load_credentials()
    assert "TOPSECRET" not in str(caught.value)
    assert "TOPSECRET" not in repr(google.Credentials("a@b.c", secret))
    settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_JSON = "not json"
    with pytest.raises(google.CredentialsError):
        google.load_credentials()
    settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_FILE = "/nonexistent/key.json"
    with pytest.raises(google.CredentialsError):
        google.load_credentials()


# --- retries, backoff, quota ------------------------------------------------------------------------------
def test_transient_errors_back_off_exponentially_then_succeed(
    world: World, people: dict[str, User], account: str, settings: Any
) -> None:
    queue_one(world, people)
    settings.UPNEXT_INDEXING_ENABLED = True
    fake = FakeGoogle([503, 500, OSError("reset"), 200])
    now = timezone.now()
    waits = []
    for _ in range(3):
        indexing.run(now=now, client_factory=factory_for(fake))
        row = rows()[0]
        assert row.status == "retry"
        waits.append(row.next_attempt_at - now)
        now = row.next_attempt_at + timedelta(seconds=1)
    assert waits == [timedelta(minutes=2), timedelta(minutes=4), timedelta(minutes=8)]
    indexing.run(now=now, client_factory=factory_for(fake))
    assert rows()[0].status == "sent" and rows()[0].attempts == 4


def test_a_row_is_not_retried_before_it_is_due(
    world: World, people: dict[str, User], account: str, settings: Any
) -> None:
    queue_one(world, people)
    settings.UPNEXT_INDEXING_ENABLED = True
    fake = FakeGoogle([503])
    now = timezone.now()
    indexing.run(now=now, client_factory=factory_for(fake))
    indexing.run(now=now + timedelta(seconds=30), client_factory=factory_for(fake))
    assert rows()[0].attempts == 1 and fake.published == []


def test_the_backoff_is_capped_and_a_row_dies_after_the_attempt_limit(
    world: World, people: dict[str, User], account: str, settings: Any
) -> None:
    assert indexing.backoff(1) == timedelta(minutes=2) and indexing.backoff(20) == timedelta(hours=6)
    queue_one(world, people)
    settings.UPNEXT_INDEXING_ENABLED = True
    settings.UPNEXT_INDEXING_MAX_ATTEMPTS = 2
    fake = FakeGoogle([500, 500])
    now = timezone.now()
    indexing.run(now=now, client_factory=factory_for(fake))
    indexing.run(now=rows()[0].next_attempt_at, client_factory=factory_for(fake))
    assert rows()[0].status == "dead"


def test_a_quota_error_stops_the_batch_and_keeps_every_row(
    world: World, people: dict[str, User], account: str, settings: Any
) -> None:
    for tag in "abc":
        live(world, people, "jobs-1", tag)
    settings.UPNEXT_INDEXING_ENABLED = True
    fake = FakeGoogle([429])
    result = indexing.run(client_factory=factory_for(fake))
    assert result.held == "quota" and result.sent == 0
    statuses = sorted(r.status for r in rows())
    assert statuses == ["pending", "pending", "retry"]
    assert rows()[0].attempts == 0  # quota does not use up the row's attempts
    assert all(r.status != "dead" for r in rows())


def test_the_daily_allowance_is_respected(
    world: World, people: dict[str, User], account: str, settings: Any
) -> None:
    for tag in "ab":
        live(world, people, "jobs-1", tag)
    settings.UPNEXT_INDEXING_ENABLED = True
    settings.UPNEXT_INDEXING_DAILY_LIMIT = 1
    fake = FakeGoogle()
    assert indexing.run(client_factory=factory_for(fake)).sent == 1
    again = indexing.run(client_factory=factory_for(fake))
    assert again.sent == 0 and again.held == "daily_limit" and len(fake.published) == 1


def test_a_permission_error_is_a_configuration_problem_not_a_failed_page(
    world: World, people: dict[str, User], account: str, settings: Any
) -> None:
    from core.models import JobRun

    queue_one(world, people)
    settings.UPNEXT_INDEXING_ENABLED = True
    result = indexing.run(client_factory=factory_for(FakeGoogle([403])))
    assert result.held == "configuration"
    row = rows()[0]
    assert row.status == "retry" and row.attempts == 0 and row.http_status == 403
    assert JobRun.objects.get(name="indexing").last_status == "failed"


def test_a_bad_request_is_permanent(
    world: World, people: dict[str, User], account: str, settings: Any
) -> None:
    queue_one(world, people)
    settings.UPNEXT_INDEXING_ENABLED = True
    indexing.run(client_factory=factory_for(FakeGoogle([400])))
    assert rows()[0].status == "dead"


# --- the decision is taken again at send time ------------------------------------------------------------
def test_a_row_for_a_listing_that_closed_while_waiting_sends_the_removal_not_the_update(
    world: World, people: dict[str, User], account: str, settings: Any
) -> None:
    opp = live(world, people, "jobs-1", "late")
    IndexingNotification.objects.update(kind="URL_UPDATED")
    Opportunity.objects.filter(pk=opp.pk).update(status="expired")
    settings.UPNEXT_INDEXING_ENABLED = True
    fake = FakeGoogle()
    indexing.run(client_factory=factory_for(fake))
    assert [p["type"] for p in fake.published] == ["URL_DELETED"]


def test_stale_rows_are_dropped_not_sent(
    world: World, people: dict[str, User], account: str, settings: Any
) -> None:
    queue_one(world, people)
    IndexingNotification.objects.update(created_at=timezone.now() - timedelta(days=30))
    settings.UPNEXT_INDEXING_ENABLED = True
    fake = FakeGoogle()
    result = indexing.run(client_factory=factory_for(fake))
    assert result.dropped == 1 and fake.published == []
    assert rows()[0].status == "skipped" and rows()[0].detail == "stale"


def test_removals_are_sent_before_updates(
    world: World, people: dict[str, User], account: str, settings: Any
) -> None:
    a, b = live(world, people, "jobs-1", "a"), live(world, people, "jobs-1", "b")
    b.refresh_from_db()
    workflow.withdraw(people["editor"], b.pk, expected_row_version=b.row_version, reason="issuer withdrew")
    settings.UPNEXT_INDEXING_ENABLED = True
    fake = FakeGoogle()
    indexing.run(client_factory=factory_for(fake))
    assert [p["type"] for p in fake.published] == ["URL_DELETED", "URL_UPDATED"]
    assert str(a.slug) in fake.published[1]["url"]


# --- commands --------------------------------------------------------------------------------------------
def test_backfill_queues_open_supported_listings_once(world: World, people: dict[str, User]) -> None:
    live(world, people, "jobs-1", "a")
    live(world, people, "grants-1", "g")
    IndexingNotification.objects.all().delete()
    assert indexing.backfill(dry_run=True) == {"queued": 1, "already_notified": 0}
    assert rows() == []
    call_command("indexing_backfill")
    call_command("indexing_backfill")
    assert len(rows()) == 1 and rows()[0].trigger == "backfill"


def test_status_and_check_commands_print_no_secret(
    world: World, people: dict[str, User], account: str, settings: Any, capsys: Any
) -> None:
    queue_one(world, people)
    call_command("indexing_status")
    out = capsys.readouterr().out
    assert "indexer@proj.iam.gserviceaccount.com" in out and "PRIVATE KEY" not in out and "indexed" in out
    settings.UPNEXT_INDEXING_ENABLED = True
    settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_JSON = ""
    from django.core.management.base import CommandError

    with pytest.raises(CommandError):
        call_command("indexing_status", "--check")


def test_indexing_check_proves_the_key_without_sending_anything(
    account: str, monkeypatch: pytest.MonkeyPatch, capsys: Any
) -> None:
    fake = FakeGoogle()
    real = google.TokenSource
    monkeypatch.setattr(google, "TokenSource", lambda creds: real(creds, fake))
    call_command("indexing_check", "--search-console")
    out = capsys.readouterr().out
    assert "indexer@proj.iam.gserviceaccount.com" in out and "Nothing was sent" in out
    assert fake.tokens == 2 and fake.published == []  # one token per scope, no notification
    assert "PRIVATE KEY" not in out


def test_indexing_check_reports_a_refused_key_and_a_missing_one(
    account: str, settings: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from django.core.management.base import CommandError

    def refuse(method: str, url: str, headers: dict[str, str], body: bytes | None, timeout: float):  # type: ignore[no-untyped-def]
        return 400, b'{"error":"invalid_grant"}'

    real = google.TokenSource
    monkeypatch.setattr(google, "TokenSource", lambda creds: real(creds, refuse))
    with pytest.raises(CommandError, match="did not issue a token"):
        call_command("indexing_check")
    settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_JSON = ""
    with pytest.raises(CommandError, match="No service-account key"):
        call_command("indexing_check")


def test_google_endpoints_must_be_https() -> None:
    with pytest.raises(ValueError, match="https"):
        google.default_transport("GET", "http://example.org/x", {}, None, 1.0)
