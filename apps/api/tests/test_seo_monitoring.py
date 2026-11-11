"""SEO monitoring for Administrators and Indexing API deduplication.

Google is never contacted: sending uses the recorded fake transport of `test_indexing`. The monitoring page
reports what UPNEXT asked Google and how Google answered, never that a page is indexed."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditEvent
from indexing import monitoring, service
from indexing.models import Action, IndexingNotification, Status
from opportunities import workflow
from opportunities.models import Opportunity, PublishingEvent
from tests.factories import CHECKLIST, World

from . import test_indexing as ix
from .test_indexing import BASE, FakeGoogle, due_now, job, rows
from .test_staff_api import S, send, signed_in

pytestmark = pytest.mark.django_db
SEO = f"{S}/seo"
# The Indexing API fixtures (a generated service-account key, live mode) are shared with test_indexing.
key, key_file, live = ix.key, ix.key_file, ix.live


def amend_and_publish(people: dict[str, User], opp: Opportunity, **changes: Any) -> Opportunity:
    def fresh() -> Opportunity:
        opp.refresh_from_db()
        return opp

    workflow.amend(people["author"], opp.pk, expected_row_version=fresh().row_version)
    if changes:
        workflow.save_draft(
            people["author"], opp.pk, expected_row_version=fresh().row_version, content=changes
        )
    workflow.submit(people["author"], opp.pk, expected_row_version=fresh().row_version)
    workflow.approve(people["editor"], opp.pk, expected_row_version=fresh().row_version, checklist=CHECKLIST)
    workflow.publish(people["editor"], opp.pk, expected_row_version=fresh().row_version)
    return fresh()


# --- permissions --------------------------------------------------------------------------------------------
def test_only_administrators_see_seo_monitoring(people: dict[str, User], live: None) -> None:
    row = IndexingNotification.objects.create(
        idempotency_key="event:x",
        url=f"{BASE}/opportunities/x",
        action=Action.UPDATED,
        transition="T07",
        status=Status.DEAD,
    )
    assert APIClient().get(SEO).status_code in (401, 403)
    for who in ("editor", "author", "author_editor", "seeker"):
        client = signed_in(people[who])
        assert client.get(SEO).status_code == 403, who
        assert client.get(f"{SEO}/notifications").status_code == 403, who
        assert send(client, "post", f"{SEO}/notifications/{row.pk}/retry").status_code == 403, who
        assert send(client, "post", f"{SEO}/notifications/retry-dead").status_code == 403, who
    row.refresh_from_db()
    assert row.status == Status.DEAD  # nothing was changed by a refused request
    admin = signed_in(people["admin"])
    assert admin.get(SEO).status_code == 200
    assert admin.get(f"{SEO}/notifications").status_code == 200


def test_the_overview_never_exposes_credentials(people: dict[str, User], live: None, key_file: Any) -> None:
    answer = signed_in(people["admin"]).get(SEO)
    body = answer.content.decode()
    assert "PRIVATE KEY" not in body and str(key_file) not in body and "iam.gserviceaccount" not in body
    assert answer.json()["search_console"] == {"connected": False}


# --- figures ------------------------------------------------------------------------------------------------
def test_overview_counts_eligible_jobs_sitemap_and_queue(
    world: World, people: dict[str, User], live: None
) -> None:
    on_site = job(world, people, "a")
    job(world, people, "tender", example="tenders-1")  # not a job: in the sitemap, never in the job figures
    no_country = job(
        world,
        people,
        "remote",
        work_mode="remote",
        locations=[{"location_id": world.locations["remote"], "is_primary": True}],
    )
    data = signed_in(people["admin"]).get(SEO).json()
    assert data["mode"] == "live"
    assert data["listings"]["open_jobs"] == 2
    assert data["listings"]["eligible_for_job_posting"] == 1
    assert data["listings"]["jobs_in_sitemap"] == 2
    assert data["listings"]["listings_in_sitemap"] == 3
    assert data["notifications"]["pending"] == 1 and data["notifications"]["waiting"] == 1
    assert data["notifications"]["last_sent_at"] is None
    assert data["search_console"] == {"connected": False}
    problem = next(r for r in data["structured_data"]["listings"] if r["slug"] == no_country.slug)
    assert {"level": "error", "code": "remote_without_country"} in problem["issues"]
    assert data["structured_data"]["listings"][0]["slug"] == no_country.slug  # errors come first
    assert all(
        i["level"] == "warning"
        for r in data["structured_data"]["listings"]
        if r["slug"] == on_site.slug
        for i in r["issues"]
    )


def test_closed_jobs_leave_the_figures(world: World, people: dict[str, User], live: None) -> None:
    opp = job(world, people)
    opp.refresh_from_db()
    workflow.withdraw(
        people["editor"], opp.pk, expected_row_version=opp.row_version, reason="issuer withdrew"
    )
    data = monitoring.overview()
    assert data["listings"]["open_jobs"] == 0 and data["listings"]["jobs_in_sitemap"] == 0
    assert data["notifications"]["pending"] == 1  # the URL_DELETED; the update was superseded
    assert data["notifications"]["superseded"] == 1


def test_sent_notifications_show_the_last_submission(
    world: World, people: dict[str, User], live: None
) -> None:
    job(world, people)
    due_now()
    service.run(transport=FakeGoogle([200]))
    data = monitoring.overview()
    assert data["notifications"]["sent"] == 1 and data["notifications"]["last_sent_at"] is not None
    assert data["last_run"]["status"] == "ok"
    listed = signed_in(people["admin"]).get(f"{SEO}/notifications", {"status": "sent"}).json()["data"]
    assert [r["action"] for r in listed] == [Action.UPDATED]
    assert listed[0]["url"].startswith(f"{BASE}/opportunities/")


# --- retry --------------------------------------------------------------------------------------------------
def test_an_administrator_retries_a_dead_notification(
    world: World, people: dict[str, User], live: None
) -> None:
    job(world, people)
    due_now()
    service.run(transport=FakeGoogle([403]))  # the service account is not an owner yet
    [row] = rows()
    assert row.status == Status.DEAD and row.last_error == "http_403"
    admin = signed_in(people["admin"])
    answer = send(admin, "post", f"{SEO}/notifications/{row.pk}/retry")
    assert answer.status_code == 200 and answer.json()["status"] == Status.PENDING
    row.refresh_from_db()
    assert (row.status, row.attempts, row.last_error) == (Status.PENDING, 0, "")
    assert AuditEvent.objects.filter(action="indexing.retry", object_id=row.pk).exists()
    fake = FakeGoogle([200])
    service.run(transport=fake)
    row.refresh_from_db()
    assert row.status == Status.SENT and len(fake.published) == 1


def test_retry_refuses_sent_unknown_and_superseded_rows(
    world: World, people: dict[str, User], live: None
) -> None:
    opp = job(world, people)
    due_now()
    service.run(transport=FakeGoogle([200]))
    [sent] = rows()
    admin = signed_in(people["admin"])
    refused = send(admin, "post", f"{SEO}/notifications/{sent.pk}/retry")
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "not_retryable"
    assert send(admin, "post", f"{SEO}/notifications/{uuid.uuid4()}/retry").status_code == 404
    # a dead update made obsolete by a later withdrawal is not revived
    IndexingNotification.objects.filter(pk=sent.pk).update(status=Status.DEAD)
    opp.refresh_from_db()
    workflow.withdraw(
        people["editor"], opp.pk, expected_row_version=opp.row_version, reason="issuer withdrew"
    )
    refused = send(admin, "post", f"{SEO}/notifications/{sent.pk}/retry")
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "superseded"


def test_retry_all_dead_requeues_only_the_latest_per_address(
    world: World, people: dict[str, User], live: None
) -> None:
    job(world, people, "a")
    job(world, people, "b")
    due_now()
    service.run(transport=FakeGoogle([400, 400]))
    assert {r.status for r in rows()} == {Status.DEAD}
    answer = send(signed_in(people["admin"]), "post", f"{SEO}/notifications/retry-dead")
    assert answer.status_code == 200 and answer.json() == {"requeued": 2}
    assert {r.status for r in rows()} == {Status.PENDING}
    assert AuditEvent.objects.filter(action="indexing.retry_all").count() == 1


# --- deduplication of unchanged republication ----------------------------------------------------------------
def test_republishing_unchanged_content_sends_no_second_update(
    world: World, people: dict[str, User], live: None
) -> None:
    opp = job(world, people)
    due_now()
    service.run(transport=FakeGoogle([200]))
    amend_and_publish(people, opp)  # an amendment that changes nothing on the page
    assert len(rows()) == 1
    assert PublishingEvent.objects.filter(opportunity=opp, transition="T07").count() == 2


def test_a_material_change_sends_a_new_update(world: World, people: dict[str, User], live: None) -> None:
    opp = job(world, people)
    due_now()
    service.run(transport=FakeGoogle([200]))
    amend_and_publish(
        people, opp, summary="The closing arrangements and duties were updated by the employer."
    )
    first, second = rows()
    assert (first.status, second.status, second.action) == (Status.SENT, Status.PENDING, Action.UPDATED)
    assert first.content_hash and second.content_hash and first.content_hash != second.content_hash
