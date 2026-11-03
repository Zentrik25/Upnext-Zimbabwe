from django.apps import AppConfig


class EmployersConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "employers"

    def ready(self) -> None:
        from . import notifications  # noqa: F401  (connects the receiver for editorial transitions)
