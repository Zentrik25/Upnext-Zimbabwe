"""Routes under /api/v1/staff/ (the staff console; see docs/engineering/STAFF_API.md)."""

from django.urls import path

from . import listings, management, session

urlpatterns = [
    path("session", session.SessionView.as_view(), name="staff-session"),
    path("mfa/enrolment", session.MfaEnrolmentView.as_view(), name="staff-mfa-enrolment"),
    path("mfa/verify", session.MfaVerifyView.as_view(), name="staff-mfa-verify"),
    path("reference", session.ReferenceView.as_view(), name="staff-reference"),
    path("overview", session.OverviewView.as_view(), name="staff-overview"),
    path("settings", session.SettingsView.as_view(), name="staff-settings"),
    path(
        "categories/<slug:code>/schema", listings.CategorySchemaView.as_view(), name="staff-category-schema"
    ),
    path("preview", listings.PreviewView.as_view(), name="staff-preview"),
    path("opportunities", listings.OpportunityListView.as_view(), name="staff-opportunities"),
    path("opportunities/new", listings.OpportunityCollectionView.as_view(), name="staff-opportunity-create"),
    path(
        "opportunities/<uuid:opportunity_id>",
        listings.OpportunityDetailView.as_view(),
        name="staff-opportunity",
    ),
    path(
        "opportunities/<uuid:opportunity_id>/<slug:action>",
        listings.OpportunityActionView.as_view(),
        name="staff-opportunity-action",
    ),
    path("organisations", management.OrganisationListView.as_view(), name="staff-organisations"),
    path(
        "organisations/<uuid:organisation_id>",
        management.OrganisationDetailView.as_view(),
        name="staff-organisation",
    ),
    path("claims", management.ClaimListView.as_view(), name="staff-claims"),
    path(
        "claims/<uuid:claim_id>/decision", management.ClaimDecisionView.as_view(), name="staff-claim-decision"
    ),
    path("reports", management.ReportListView.as_view(), name="staff-reports"),
    path("reports/<uuid:report_id>", management.ReportDetailView.as_view(), name="staff-report"),
    path(
        "reports/<uuid:report_id>/<slug:action>",
        management.ReportActionView.as_view(),
        name="staff-report-action",
    ),
    path("users", management.UserListView.as_view(), name="staff-users"),
    path("users/<uuid:user_id>/<slug:action>", management.UserActionView.as_view(), name="staff-user-action"),
    path("audit", management.AuditListView.as_view(), name="staff-audit"),
]
