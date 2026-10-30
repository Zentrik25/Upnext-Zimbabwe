"""Routes under /api/v1/ (paths match docs/engineering/openapi/openapi.yaml)."""

from django.conf import settings
from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView

from api import account_views, employer_views, profile_views, public_views, report_views, views

urlpatterns = [
    path("", views.ApiRootView.as_view(), name="api-root"),
    path("auth/csrf", views.CsrfView.as_view(), name="auth-csrf"),
    path("auth/login", views.LoginView.as_view(), name="auth-login"),
    path("auth/logout", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/providers", views.ProvidersView.as_view(), name="auth-providers"),
    path("auth/google/start", views.GoogleStartView.as_view(), name="auth-google-start"),
    path("auth/google/callback", views.GoogleCallbackView.as_view(), name="auth-google-callback"),
    path("auth/register", account_views.RegisterView.as_view(), name="auth-register"),
    path("auth/email/verify", account_views.VerifyEmailView.as_view(), name="auth-email-verify"),
    path("auth/email/resend", account_views.ResendVerificationView.as_view(), name="auth-email-resend"),
    path(
        "auth/password-reset/request",
        account_views.PasswordResetRequestView.as_view(),
        name="auth-password-reset-request",
    ),
    path(
        "auth/password-reset/confirm",
        account_views.PasswordResetConfirmView.as_view(),
        name="auth-password-reset-confirm",
    ),
    path("auth/password/change", account_views.ChangePasswordView.as_view(), name="auth-password-change"),
    path("me", account_views.MeView.as_view(), name="me"),
    path("hooks/email/resend", account_views.ResendEmailEventsView.as_view(), name="hooks-email-resend"),
    path("hooks/email", account_views.EmailEventsView.as_view(), name="hooks-email"),
    path("me/email-change", account_views.EmailChangeView.as_view(), name="me-email-change"),
    path("me/deletion-request", account_views.DeletionRequestView.as_view(), name="me-deletion"),
    path("me/sessions", account_views.SessionListView.as_view(), name="me-sessions"),
    path("me/sessions/<uuid:session_id>", account_views.SessionDetailView.as_view(), name="me-session"),
    path("me/profile", profile_views.ProfileView.as_view(), name="me-profile"),
    path(
        "me/profile/reset-preferences",
        profile_views.ProfileResetView.as_view(),
        name="me-profile-reset-preferences",
    ),
    path("me/alerts", profile_views.AlertView.as_view(), name="me-alerts"),
    path("alerts/unsubscribe", profile_views.UnsubscribeView.as_view(), name="alerts-unsubscribe"),
    path("discovery/for-you", profile_views.ForYouView.as_view(), name="discovery-for-you"),
    path("me/saved", account_views.SavedListView.as_view(), name="me-saved"),
    path("me/saved/<uuid:opportunity_id>", account_views.SavedDetailView.as_view(), name="me-saved-item"),
    path("opportunities", public_views.OpportunityListView.as_view(), name="opportunity-list"),
    path("employer/overview", employer_views.OverviewView.as_view(), name="employer-overview"),
    path(
        "employer/organisations/search",
        employer_views.OrganisationSearchView.as_view(),
        name="employer-organisation-search",
    ),
    path("employer/claims", employer_views.ClaimListView.as_view(), name="employer-claims"),
    path("employer/claims/<uuid:claim_id>", employer_views.ClaimDetailView.as_view(), name="employer-claim"),
    path(
        "employer/organisations/<uuid:organisation_id>/profile",
        employer_views.ProfileView.as_view(),
        name="employer-profile",
    ),
    path(
        "employer/organisations/<uuid:organisation_id>/profile/revisions/<uuid:revision_id>",
        employer_views.ProfileRevisionView.as_view(),
        name="employer-profile-revision",
    ),
    path(
        "employer/organisations/<uuid:organisation_id>/listings",
        employer_views.OrganisationListingsView.as_view(),
        name="employer-listings",
    ),
    path(
        "employer/organisations/<uuid:organisation_id>/analytics",
        employer_views.AnalyticsView.as_view(),
        name="employer-analytics",
    ),
    path(
        "employer/listings/<uuid:opportunity_id>",
        employer_views.ListingView.as_view(),
        name="employer-listing",
    ),
    path(
        "employer/listings/<uuid:opportunity_id>/submit",
        employer_views.SubmitListingView.as_view(),
        name="employer-listing-submit",
    ),
    path(
        "employer/listings/<uuid:opportunity_id>/discard",
        employer_views.DiscardListingView.as_view(),
        name="employer-listing-discard",
    ),
    path(
        "employer/listings/<uuid:opportunity_id>/close",
        employer_views.CloseListingView.as_view(),
        name="employer-listing-close",
    ),
    path(
        "employer/listings/<uuid:opportunity_id>/reopen",
        employer_views.ReopenListingView.as_view(),
        name="employer-listing-reopen",
    ),
    path(
        "employer/listings/<uuid:opportunity_id>/amend",
        employer_views.AmendListingView.as_view(),
        name="employer-listing-amend",
    ),
    path("employers/<slug:slug>", employer_views.PublicProfileView.as_view(), name="employer-public-profile"),
    re_path(
        r"^opportunities/(?P<slug>[^/]{1,200})/events$",
        employer_views.ListingEventView.as_view(),
        name="listing-event",
    ),
    re_path(
        r"^opportunities/(?P<slug>[^/]{1,200})/reports$",
        report_views.CreateListingReportView.as_view(),
        name="listing-report",
    ),
    re_path(
        r"^opportunities/(?P<slug>[^/]{1,200})$",
        public_views.OpportunityDetailView.as_view(),
        name="opportunity-detail",
    ),
    path("staff/", include("staffapi.urls")),
    path("sitemap", public_views.SitemapView.as_view(), name="sitemap"),
    path("categories", public_views.CategoryListView.as_view(), name="category-list"),
    path("locations", public_views.LocationListView.as_view(), name="location-list"),
    path("sectors", public_views.SectorListView.as_view(), name="sector-list"),
    path("skills", public_views.SkillSearchView.as_view(), name="skill-search"),
]
if getattr(settings, "EXPOSE_OPENAPI_SCHEMA", False):
    urlpatterns.append(path("schema", SpectacularAPIView.as_view(), name="schema"))
urlpatterns.append(re_path(r"^.*$", views.api_not_found, name="api-not-found"))
