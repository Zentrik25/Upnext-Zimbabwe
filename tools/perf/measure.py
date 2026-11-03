"""Timing and query-count check of the public and saved-listing endpoints on a scratch database.

    docker compose exec -T -e POSTGRES_DB=upnext_perf api python manage.py shell < tools/perf/measure.py

Uses the Django test client (no network), three runs per request, reports the best time and query count.
"""

import time

from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext

from accounts.models import User
from opportunities.models import Opportunity, SavedOpportunity

anon = Client(HTTP_HOST="localhost")
top = max(
    (u for u in User.objects.filter(email__startswith="perf-user-")[:200]),
    key=lambda u: SavedOpportunity.objects.filter(user=u).count(),
)
signed = Client(HTTP_HOST="localhost")
signed.force_login(top)
slug = Opportunity.objects.filter(status="published", slug__contains="-p1").values_list("slug", flat=True).first()
some_ids = ",".join(str(i) for i in Opportunity.objects.filter(status="published").values_list("id", flat=True)[:20])

CASES = [
    ("anon", "/api/v1/opportunities"),
    ("anon", "/api/v1/opportunities?limit=50"),
    ("anon", "/api/v1/opportunities?category=jobs"),
    ("anon", "/api/v1/opportunities?category=jobs,tenders&work_mode=on_site"),
    ("anon", "/api/v1/opportunities?location=harare&employment_type=permanent"),
    ("anon", "/api/v1/opportunities?q=engineer"),
    ("anon", "/api/v1/opportunities?q=engineer&sort=relevance"),
    ("anon", "/api/v1/opportunities?sort=closing_soon"),
    ("anon", "/api/v1/opportunities?deadline_state=closing_soon"),
    ("anon", f"/api/v1/opportunities/{slug}"),
    ("anon", "/api/v1/sitemap"),
    ("signed", "/api/v1/me/saved"),
    ("signed", "/api/v1/me/saved?limit=50"),
    ("signed", f"/api/v1/me/saved?ids={some_ids}"),
    ("signed", "/api/v1/me"),
]
print(f"saved rows for the heaviest sampled user: {SavedOpportunity.objects.filter(user=top).count()}")
# deep page: follow the cursor four times
page = anon.get("/api/v1/opportunities?limit=20").json()
for _ in range(4):
    page = anon.get(f"/api/v1/opportunities?limit=20&cursor={page['page']['next_cursor']}").json()
deep = f"/api/v1/opportunities?limit=20&cursor={page['page']['next_cursor']}"
CASES.append(("anon", deep))

for who, path in CASES:
    client = signed if who == "signed" else anon
    best, queries, status, size = None, 0, 0, 0
    for _ in range(3):
        with CaptureQueriesContext(connection) as ctx:
            started = time.perf_counter()
            response = client.get(path)
            elapsed = (time.perf_counter() - started) * 1000
        best = elapsed if best is None else min(best, elapsed)
        queries, status, size = len(ctx.captured_queries), response.status_code, len(response.content)
    label = path if len(path) < 70 else path[:67] + "..."
    print(f"{status} {best:8.1f} ms  q={queries:2d}  {size / 1024:7.1f} KiB  [{who}] {label}")
