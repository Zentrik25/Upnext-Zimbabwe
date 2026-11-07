"""Root URL configuration. The staff interface is the Next.js workspace (`/workspace`) on the staff API
(`/api/v1/staff/`, D-49); there is no Django Admin."""

from django.conf import settings
from django.urls import include, path, re_path
from django.views.static import serve

from core import views as core_views

urlpatterns = [
    path("health/live", core_views.live, name="health-live"),
    path("health/ready", core_views.ready, name="health-ready"),
    path("api/v1/", include("api.v1.urls")),
]

if settings.UPNEXT_SERVE_MEDIA:
    # Development and tests only; production nginx serves the media volume directly (compose.production.yaml).
    urlpatterns.append(
        re_path(
            # A picture and its thumbnail (the Media Library grid shows the thumbnails).
            r"^media/(?P<path>listings/(?:thumbs/)?[0-9a-f]{32}\.jpg)$",
            serve,
            {"document_root": settings.MEDIA_ROOT},
        )
    )
