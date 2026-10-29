"""Django Admin (app label `admin`) using the UPNEXT staff site for the dashboard and the page shell.

Kept out of `core/apps.py`: Django treats every AppConfig class found there as a candidate default for `core`.
"""

from django.contrib.admin.apps import AdminConfig


class StaffAdminConfig(AdminConfig):
    default_site = "core.staff_site.StaffAdminSite"
