"""Small dependency-free HTTP load generator (P5-08). Threads, a weighted scenario mix, percentiles, error rate.

    python tools/perf/load.py --base https://localhost:8443 --ca .certs/ca.crt --users 100 --seconds 60 \\
        --cookie-name __Host-upnext_sid --sessions sessions.txt --json out.json

Scenario mix (proposed in the Phase 5 plan): anonymous browse and search 80%, detail pages 10%, signed-in
saved actions 5%, sitemap and static pages 5%. It measures the whole stack the client sees (proxy, web, API,
database); it does not claim to predict the shared VPS (capacity unknown, OQ-10).
"""

from __future__ import annotations

import argparse
import json
import random
import ssl
import statistics
import threading
import time
import urllib.error
import urllib.request
from collections import defaultdict

CATEGORIES = ["jobs", "internships", "graduate-programmes", "scholarships", "tenders", "grants"]
TERMS = ["engineer", "nurse", "teacher", "tender", "bursary", "driver", "analyst", "harare", "bulawayo"]


def build_opener(ca: str | None) -> urllib.request.OpenerDirector:
    ctx = ssl.create_default_context(cafile=ca) if ca else None
    handlers = [urllib.request.HTTPSHandler(context=ctx)] if ctx else []
    return urllib.request.build_opener(*handlers)


class Worker(threading.Thread):
    def __init__(self, args: argparse.Namespace, stop: threading.Event, slugs: list[str], cookie: str | None, out: list) -> None:
        super().__init__(daemon=True)
        self.args, self.stop_event, self.slugs, self.cookie, self.out = args, stop, slugs, cookie, out
        self.opener = build_opener(args.ca)
        self.rng = random.Random()

    def pick(self) -> tuple[str, str, dict[str, str]]:
        r = self.rng.random()
        headers: dict[str, str] = {}
        if r < 0.80:
            kind = self.rng.choice(["list", "category", "search", "page2", "web-list"])
            if kind == "list":
                return "list", "/api/v1/opportunities", headers
            if kind == "category":
                return "category", f"/api/v1/opportunities?category={self.rng.choice(CATEGORIES)}", headers
            if kind == "search":
                return "search", f"/api/v1/opportunities?q={self.rng.choice(TERMS)}", headers
            if kind == "page2":
                return "closing-soon", "/api/v1/opportunities?sort=closing_soon&limit=50", headers
            return "web-list", "/opportunities", headers
        if r < 0.90:
            return "detail", f"/api/v1/opportunities/{self.rng.choice(self.slugs)}", headers
        if r < 0.95 and self.cookie:
            headers["Cookie"] = f"{self.args.cookie_name}={self.cookie}"
            return "saved", "/api/v1/me/saved?limit=20", headers
        return "static", self.rng.choice(["/sitemap.xml", "/about", "/", "/api/v1/sitemap"]), headers

    def run(self) -> None:
        while not self.stop_event.is_set():
            label, path, headers = self.pick()
            start = time.perf_counter()
            status, size = 0, 0
            try:
                req = urllib.request.Request(self.args.base + path, headers={**headers, "Accept-Encoding": "identity"})
                with self.opener.open(req, timeout=30) as r:
                    size = len(r.read())
                    status = r.status
            except urllib.error.HTTPError as e:
                status = e.code
            except OSError:
                status = 0
            self.out.append((label, status, (time.perf_counter() - start) * 1000, size))
            time.sleep(self.rng.uniform(0, self.args.think))


def pct(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    values = sorted(values)
    return values[min(len(values) - 1, int(round(p / 100 * (len(values) - 1))))]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--ca")
    ap.add_argument("--users", type=int, default=50)
    ap.add_argument("--seconds", type=int, default=30)
    ap.add_argument("--ramp", type=int, default=5, help="seconds over which users are added")
    ap.add_argument("--think", type=float, default=0.5, help="max think time between requests per user")
    ap.add_argument("--sessions", help="file of session keys for signed-in requests")
    ap.add_argument("--cookie-name", default="upnext_sid")
    ap.add_argument("--json")
    args = ap.parse_args()
    opener = build_opener(args.ca)
    with opener.open(args.base + "/api/v1/opportunities?limit=50", timeout=30) as r:
        slugs = [x["slug"] for x in json.load(r)["data"]]
    cookies = [c.strip() for c in open(args.sessions)] if args.sessions else []
    out: list = []
    stop = threading.Event()
    workers: list[Worker] = []
    start = time.time()
    for i in range(args.users):
        w = Worker(args, stop, slugs, cookies[i % len(cookies)] if cookies else None, out)
        w.start()
        workers.append(w)
        time.sleep(args.ramp / max(1, args.users))
    time.sleep(max(0, args.seconds - (time.time() - start)))
    stop.set()
    for w in workers:
        w.join(timeout=35)
    elapsed = time.time() - start
    by: dict[str, list[tuple[int, float, int]]] = defaultdict(list)
    for label, status, ms, size in out:
        by[label].append((status, ms, size))
    statuses: dict[int, int] = defaultdict(int)
    for _, status, _, _ in out:
        statuses[status] += 1
    print("status codes:", dict(sorted(statuses.items())))
    total_err = sum(1 for _, status, _, _ in out if status == 0 or status >= 500)
    unexpected_4xx = sum(1 for _, status, _, _ in out if 400 <= status < 500)
    rows = {}
    print(f"{'scenario':<14}{'n':>7}{'p50':>8}{'p95':>8}{'p99':>8}{'max':>8}{'KiB':>7}{'err%':>7}")
    for label, rs in sorted(by.items()):
        t = [ms for _, ms, _ in rs]
        e = sum(1 for s, _, _ in rs if s == 0 or s >= 500)
        row = {"n": len(rs), "p50": pct(t, 50), "p95": pct(t, 95), "p99": pct(t, 99), "max": max(t),
               "kib": statistics.mean(sz for _, _, sz in rs) / 1024, "err_pct": 100 * e / len(rs)}
        rows[label] = row
        print(f"{label:<14}{row['n']:>7}{row['p50']:>8.0f}{row['p95']:>8.0f}{row['p99']:>8.0f}{row['max']:>8.0f}{row['kib']:>7.1f}{row['err_pct']:>7.2f}")
    api = [ms for label, _, ms, _ in out if label not in ("web-list", "static")]
    summary = {"users": args.users, "seconds": round(elapsed), "requests": len(out), "rps": round(len(out) / elapsed, 1),
               "error_pct": 100 * total_err / max(1, len(out)), "client_errors_4xx": unexpected_4xx, "status_codes": dict(statuses),
               "api_p95_ms": pct(api, 95), "scenarios": rows}
    print(json.dumps({k: v for k, v in summary.items() if k != "scenarios"}))
    if args.json:
        json.dump(summary, open(args.json, "w"), indent=2)


if __name__ == "__main__":
    main()
