"""The proxy answers 503 with Retry-After for public pages whose content could not be loaded (D-68, SEO-10)."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

CONFIGS = ("nginx.production.conf.template", "nginx.conf", "nginx.tls.conf")
PUBLIC = r"location ~ ^/($|opportunities(/|$)|jobs(/|$)|employers(/|$)|guides/|sitemap\.xml$) {"


def _block(text: str, start: str) -> str:
    i = text.index(start)
    return text[i : text.index("\n    }\n", i)]


@pytest.mark.docs
@pytest.mark.parametrize("name", CONFIGS)
def test_public_pages_turn_server_errors_into_503_with_retry_after(repo_root: Path, name: str) -> None:
    conf = (repo_root / "infrastructure/compose" / name).read_text()
    public = _block(conf, PUBLIC)
    assert "proxy_pass http://web:3000;" in public
    assert "proxy_intercept_errors on;" in public
    assert "error_page 500 502 503 504 = @temporarily_unavailable;" in public
    assert "404" not in public  # a genuine 404 from the web app passes through
    fallback = _block(conf, "location @temporarily_unavailable {")
    assert "add_header Retry-After 120 always;" in fallback
    assert 'add_header Cache-Control "no-store" always;' in fallback
    assert "return 503 '" in fallback and "<h1>" in fallback and "noindex" not in fallback
    # The rule sits after the API location (regex locations match in order) and before the catch-all.
    assert (
        conf.index("location ~ ^/(api|health|django-admin|static)/")
        < conf.index(PUBLIC)
        < conf.index("    location / {")
    )


@pytest.mark.docs
def test_only_public_crawlable_addresses_are_covered() -> None:
    pattern = re.compile(r"^/($|opportunities(/|$)|jobs(/|$)|employers(/|$)|guides/|sitemap\.xml$)")
    for path in ("/", "/opportunities", "/opportunities/x-1", "/jobs/harare", "/employers/acme", "/sitemap.xml",
                 "/guides/how-to-find-jobs-in-zimbabwe", "/employers"):  # fmt: skip
        assert pattern.match(path), path
    for path in ("/workspace", "/account", "/employer", "/employer/listings", "/api/v1/opportunities", "/sign-in",
                 "/_next/static/x.js", "/saved", "/opportunitiesx", "/sitemap.xml.bak"):  # fmt: skip
        assert not pattern.match(path), path
