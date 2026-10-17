"""Root URL configuration."""

from django.contrib import admin
from django.urls import include, path

from core import staff_mfa
from core import views as core_views
from core.admin_login import ThrottledAdminAuthenticationForm

admin.site.site_header = "UPNEXT staff"
admin.site.index_title = "Editorial workspace"
admin.site.login_form = ThrottledAdminAuthenticationForm

urlpatterns = [
    path("health/live", core_views.live, name="health-live"),
    path("health/ready", core_views.ready, name="health-ready"),
    path("staff/mfa/", staff_mfa.mfa_view, name="staff-mfa"),
    path("staff/", admin.site.urls),
    path("api/v1/", include("api.v1.urls")),
]
