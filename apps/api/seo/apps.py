from django.apps import AppConfig


class SeoConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "seo"

    def ready(self) -> None:
        from . import receivers  # noqa: F401  (queues Indexing API notifications on editorial transitions)
