from django.apps import AppConfig


class IndexingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "indexing"

    def ready(self) -> None:
        from . import receivers  # noqa: F401  (connects the receiver for editorial transitions)
