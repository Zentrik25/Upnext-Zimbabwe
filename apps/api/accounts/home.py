"""Where a signed-in person lands: the one, server-side answer (D-70).

The browser never works this out from a role it holds itself. `dashboard_path` reads the account's *current*
authority from the database on every call and returns a fixed path, which the sign-in screens, the Google
callback and the dashboards' own guards all use. It grants nothing: each destination still checks its own
permission on every request.

Precedence for an account that holds several kinds of authority (documented in
`docs/engineering/ROLE_BASED_LANDING.md`):

1. an active staff role                      -> the staff workspace, `/workspace`;
2. an active employer membership             -> the employer dashboard, `/employer`;
3. anyone else with an active account        -> the jobseeker dashboard, `/dashboard`.

A person with both staff and employer authority lands in the workspace and reaches the other dashboard from
the account menu. Accounts that are not active never get a dashboard (they cannot sign in at all).
"""

from __future__ import annotations

from .models import User

STAFF_HOME = "/workspace"
EMPLOYER_HOME = "/employer"
SEEKER_HOME = "/dashboard"


def dashboard_path(user: User) -> str:
    # Imported here: `employers` depends on `accounts`, never the other way round at import time.
    from employers.capability import is_employer

    if user.is_staff:  # active account with at least one unrevoked staff role
        return STAFF_HOME
    if is_employer(user):  # active account with at least one unrevoked employer membership
        return EMPLOYER_HOME
    return SEEKER_HOME
