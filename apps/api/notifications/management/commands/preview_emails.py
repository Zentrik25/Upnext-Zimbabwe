"""Development-only preview of every e-mail the application can send, on synthetic data.

    python manage.py preview_emails [--out DIR]

Writes, for each kind and for three variants (normal, long names and titles, missing optional fields), the
HTML and plain-text alternatives, copies the e-mail images next to them, and builds `index.html` (a list) and
`viewer.html` (any message in a desktop or phone frame). No database row is read or written, no message is
sent, and every link and "token" is an obvious placeholder (see `notifications/samples.py`). The command
refuses to run against production settings.

Dark mode is previewed with the browser's own emulation (DevTools: Rendering > prefers-color-scheme), or by
`tools/email_preview_screenshots.mjs`, which captures desktop and phone, light and dark.
"""

from __future__ import annotations

import shutil
from html import escape
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser

from notifications import content, emailkit, samples
from notifications.emailkit import ILLUSTRATION_FILE, LOGO_FILE

VARIANTS: tuple[samples.Variant, ...] = ("normal", "long", "minimal")
TEMPLATES = Path(__file__).resolve().parents[2] / "preview_templates"
ASSET_SOURCE = Path(settings.BASE_DIR).parent / "web" / "public" / "brand" / "email"


class Command(BaseCommand):
    help = "Write a static preview of every e-mail template, on synthetic data (development only)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--out",
            default="/tmp/upnext-email-preview",  # noqa: S108
            help="Directory to write into.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        if settings.UPNEXT_ENVIRONMENT == "production":
            raise CommandError("preview_emails is a development tool and refuses to run in production.")
        out = Path(options["out"])
        (out / "assets").mkdir(parents=True, exist_ok=True)
        for name in (LOGO_FILE, ILLUSTRATION_FILE):
            shutil.copyfile(ASSET_SOURCE / name, out / "assets" / name)
        brand = emailkit.brand_context(asset_base="assets")
        rows: list[str] = []
        for kind in samples.SAMPLE_KINDS:
            cells = []
            for variant in VARIANTS:
                message = content.build(kind, samples.sample_context(kind, variant))
                stem = f"{kind}.{variant}"
                (out / f"{stem}.html").write_text(emailkit.render_html(message, brand), encoding="utf-8")
                (out / f"{stem}.txt").write_text(emailkit.render_text(message, brand), encoding="utf-8")
                cells.append(
                    f'<a href="viewer.html?m={stem}">{variant}</a> · <a href="{stem}.html">html</a> · '
                    f'<a href="{stem}.txt">text</a>'
                )
                subject = message.subject
            name, subj, row = escape(str(kind)), escape(subject), "</td><td>".join(cells)
            rows.append(f"<tr><th scope='row'>{name}</th><td>{subj}</td><td>{row}</td></tr>")
        (out / "index.html").write_text(
            (TEMPLATES / "index.html").read_text(encoding="utf-8").replace("{rows}", "\n".join(rows)),
            encoding="utf-8",
        )
        shutil.copyfile(TEMPLATES / "viewer.html", out / "viewer.html")
        self.stdout.write(f"Wrote {len(samples.SAMPLE_KINDS) * len(VARIANTS)} messages to {out}/index.html")
