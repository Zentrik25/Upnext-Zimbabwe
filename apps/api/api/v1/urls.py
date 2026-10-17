"""Routes under /api/v1/ (paths match docs/engineering/openapi/openapi.yaml)."""

from django.conf import settings
from django.urls import path, re_path
from drf_spectacular.views import SpectacularAPIView

from api import views

urlpatterns = [
    path("", views.ApiRootView.as_view(), name="api-root"),
    path("auth/csrf", views.CsrfView.as_view(), name="auth-csrf"),
    path("auth/login", views.LoginView.as_view(), name="auth-login"),
    path("auth/logout", views.LogoutView.as_view(), name="auth-logout"),
    path("me", views.MeView.as_view(), name="me"),
]
if getattr(settings, "EXPOSE_OPENAPI_SCHEMA", False):
    urlpatterns.append(path("schema", SpectacularAPIView.as_view(), name="schema"))
urlpatterns.append(re_path(r"^.*$", views.api_not_found, name="api-not-found"))
