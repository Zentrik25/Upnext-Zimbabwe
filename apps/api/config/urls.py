"""Root URL configuration."""

from django.contrib import admin
from django.urls import include, path

from core import views as core_views

admin.site.site_header = "UPNEXT staff"
admin.site.index_title = "Staff administration (read-only in Phase 1)"

urlpatterns = [
    path("health/live", core_views.live, name="health-live"),
    path("health/ready", core_views.ready, name="health-ready"),
    path("staff/", admin.site.urls),
    path("api/v1/", include("api.v1.urls")),
]
