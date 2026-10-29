"""Root URL configuration."""

from django.conf import settings
from django.contrib import admin
from django.urls import include, path

from core import staff_mfa, staff_views
from core import views as core_views
from core.admin_login import ThrottledAdminAuthenticationForm

admin.site.site_header = f"{settings.UPNEXT_BRAND_NAME} staff"
admin.site.site_title = f"{settings.UPNEXT_BRAND_NAME} staff"
admin.site.index_title = "Editorial workspace"
admin.site.login_form = ThrottledAdminAuthenticationForm

urlpatterns = [
    path("health/live", core_views.live, name="health-live"),
    path("health/ready", core_views.ready, name="health-ready"),
    path("staff/mfa/", staff_mfa.mfa_view, name="staff-mfa"),
    path(
        "staff/content-health/",
        admin.site.admin_view(staff_views.content_health),
        name="staff-content-health",
    ),
    path("staff/search/", admin.site.admin_view(staff_views.search), name="staff-search"),
    path("staff/", admin.site.urls),
    path("api/v1/", include("api.v1.urls")),
]
