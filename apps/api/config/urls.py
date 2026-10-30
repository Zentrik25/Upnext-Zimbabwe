"""Root URL configuration. The staff interface is the Next.js workspace (`/workspace`) on the staff API
(`/api/v1/staff/`, D-49); there is no Django Admin."""

from django.urls import include, path

from core import views as core_views

urlpatterns = [
    path("health/live", core_views.live, name="health-live"),
    path("health/ready", core_views.ready, name="health-ready"),
    path("api/v1/", include("api.v1.urls")),
]
