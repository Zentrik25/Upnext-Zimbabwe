"""Create session cookies for synthetic users so the load test can exercise signed-in requests.

    docker compose exec -T -e POSTGRES_DB=... worker python manage.py shell < tools/perf/make_sessions.py > sessions.txt

Prints one session key per line. Uses the application's own login path (signals, session tracking), so the
sessions are indistinguishable from real ones. Synthetic users only; never run against a real database.
"""

from django.test import Client

from accounts.models import User

for user in User.objects.filter(email__startswith="perf-user-").order_by("email")[:200]:
    client = Client(HTTP_HOST="localhost")
    client.force_login(user)
    print(client.session.session_key)
