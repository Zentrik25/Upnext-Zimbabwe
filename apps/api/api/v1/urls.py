"""Routes under /api/v1/ (paths match docs/engineering/openapi/openapi.yaml)."""

from django.conf import settings
from django.urls import path, re_path
from drf_spectacular.views import SpectacularAPIView

from api import account_views, public_views, views

urlpatterns = [
    path("", views.ApiRootView.as_view(), name="api-root"),
    path("auth/csrf", views.CsrfView.as_view(), name="auth-csrf"),
    path("auth/login", views.LoginView.as_view(), name="auth-login"),
    path("auth/logout", views.LogoutView.as_view(), name="auth-logout"),
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
    path("me/email-change", account_views.EmailChangeView.as_view(), name="me-email-change"),
    path("me/deletion-request", account_views.DeletionRequestView.as_view(), name="me-deletion"),
    path("me/sessions", account_views.SessionListView.as_view(), name="me-sessions"),
    path("me/sessions/<uuid:session_id>", account_views.SessionDetailView.as_view(), name="me-session"),
    path("me/saved", account_views.SavedListView.as_view(), name="me-saved"),
    path("me/saved/<uuid:opportunity_id>", account_views.SavedDetailView.as_view(), name="me-saved-item"),
    path("opportunities", public_views.OpportunityListView.as_view(), name="opportunity-list"),
    re_path(
        r"^opportunities/(?P<slug>[^/]{1,200})$",
        public_views.OpportunityDetailView.as_view(),
        name="opportunity-detail",
    ),
    path("sitemap", public_views.SitemapView.as_view(), name="sitemap"),
    path("categories", public_views.CategoryListView.as_view(), name="category-list"),
    path("locations", public_views.LocationListView.as_view(), name="location-list"),
    path("sectors", public_views.SectorListView.as_view(), name="sector-list"),
    path("skills", public_views.SkillSearchView.as_view(), name="skill-search"),
]
if getattr(settings, "EXPOSE_OPENAPI_SCHEMA", False):
    urlpatterns.append(path("schema", SpectacularAPIView.as_view(), name="schema"))
urlpatterns.append(re_path(r"^.*$", views.api_not_found, name="api-not-found"))
