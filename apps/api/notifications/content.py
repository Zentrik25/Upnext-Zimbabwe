"""What each e-mail says. One builder per kind returns an `EmailContent` (see `emailkit`), which is then
rendered to HTML and plain text. Builders are pure: they read the context they are given (the outbox payload,
the link derived from the token at send time, the site origin) and touch neither the database nor a clock, so
the development preview can run them on synthetic data.

Rules every builder follows:

* nothing is claimed that the backend did not establish: an organisation or listing is never called verified,
  and expiry times come from the token policy (`accounts.tokens.TTL`) rather than being typed here;
* no password, token or secret is shown except inside the one link the person must follow, which is also the
  button's target and the visible fallback;
* no promise about response times, and no mailbox other than the official one.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from typing import Any

from accounts.models import TokenPurpose
from accounts.tokens import TTL

from .emailkit import Cta, EmailContent, Fact, Link, Listing, Notice, one_line
from .models import EmailKind

Context = dict[str, Any]


# --- shared pieces -------------------------------------------------------------------------------------
def humanise(span: timedelta) -> str:
    """60 minutes, 24 hours, 3 days: how long a link lives, spoken the way the policy states it (minutes up to
    two hours, hours up to two days, then days)."""
    minutes = int(span.total_seconds() // 60)
    if minutes < 120:
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    if minutes < 2 * 24 * 60 and minutes % 60 == 0:
        return f"{minutes // 60} hours"
    if minutes % (24 * 60) == 0:
        return f"{minutes // (24 * 60)} days"
    return f"{minutes // 60} hours"


def _hello(ctx: Context) -> str:
    name = one_line(str(ctx.get("display_name") or ""), 48)
    return f"Hello {name}," if name else "Hello,"


def _subject(ctx: Context, title: str, *, brand_suffix: bool = True) -> str:
    """A subject chosen by the sender of the event (a listing's title, a count) wins; otherwise the fixed
    `Title | Brand` form."""
    override = one_line(str(ctx.get("subject") or ""), 150)
    return override or (f"{title} | {ctx['brand_name']}" if brand_suffix else title)


def _never_asks(ctx: Context, *, share: bool = False) -> Notice:
    tail = " Do not share this link with anyone." if share else ""
    return Notice(
        "Your security is important", f"{ctx['brand_name']} never asks for your password by email.{tail}"
    )


def _link_ttl(purpose: TokenPurpose) -> str:
    return humanise(TTL[purpose])


def _url(ctx: Context, path: str) -> str:
    return f"{ctx['base_url']}{path}"


def _service_reason(ctx: Context) -> str:
    return f"You get this service message because you made this request on {ctx['brand_name']}."


def _member_reason(ctx: Context) -> str:
    org = one_line(str(ctx.get("organisation_name") or ""), 120)
    who = f"act for {org}" if org else "act for an organisation"
    return f"You get this service message because you {who} on {ctx['brand_name']}."


# --- account and security ------------------------------------------------------------------------------
def email_verification(ctx: Context) -> EmailContent:
    brand = ctx["brand_name"]
    return EmailContent(
        subject=_subject(ctx, "Verify your email address"),
        preheader=f"Confirm your email address to finish creating your {brand} account.",
        eyebrow="Verify your email",
        heading=_hello(ctx),
        paragraphs=(
            f"Welcome to {brand}. Verifying your email address is required to complete your registration and "
            "get started.",
        ),
        cta=Cta("Verify email address", ctx["link"]),
        fallback=True,
        notices=(
            Notice(
                f"This link works once and expires in {_link_ttl(TokenPurpose.EMAIL_VERIFICATION)}.",
                "If you did not create an account, you can safely ignore this message.",
            ),
            _never_asks(ctx, share=True),
        ),
        illustration=True,
    )


def password_reset(ctx: Context) -> EmailContent:
    return EmailContent(
        subject=_subject(ctx, "Reset your password"),
        preheader=f"Choose a new password for your {ctx['brand_name']} account.",
        eyebrow="Reset your password",
        heading=_hello(ctx),
        paragraphs=(
            f"We received a request to reset the password of your {ctx['brand_name']} account. "
            "Use the button below to choose a new one.",
        ),
        cta=Cta("Reset password", ctx["link"]),
        fallback=True,
        notices=(
            Notice(
                f"This link works once and expires in {_link_ttl(TokenPurpose.PASSWORD_RESET)}.",
                "If you did not ask for this, ignore this message: your password has not changed.",
            ),
            _never_asks(ctx, share=True),
        ),
    )


def account_exists(ctx: Context) -> EmailContent:
    brand = ctx["brand_name"]
    return EmailContent(
        subject=_subject(ctx, "You already have an account"),
        preheader=f"Someone tried to register this email address on {brand}.",
        eyebrow="Account already exists",
        heading="Hello,",
        paragraphs=(
            f"Someone asked to create a {brand} account with this email address, but an account already "
            f"exists.",
            "If it was you, sign in below. If you forgot your password, you can reset it from the sign-in "
            "page. "
            "If you never finished confirming this address, ask for the confirmation link again from the "
            "same page.",
        ),
        cta=Cta("Sign in", _url(ctx, "/sign-in")),
        notices=(Notice("Was it not you?", "No action is needed."), _never_asks(ctx)),
    )


def password_changed_notice(ctx: Context) -> EmailContent:
    return EmailContent(
        subject=_subject(ctx, "Your password was changed"),
        preheader="The password on your account was just changed.",
        eyebrow="Password changed",
        heading=_hello(ctx),
        paragraphs=(
            f"The password on your {ctx['brand_name']} account was just changed, and you were signed out "
            f"of your "
            "other sessions.",
            "If you did this, no action is needed.",
        ),
        notices=(
            Notice("Was it not you?", "Reset your password now so that only you can sign in."),
            _never_asks(ctx),
        ),
        links=(Link("Reset my password", _url(ctx, "/forgot-password")),),
    )


def account_deletion_notice(ctx: Context) -> EmailContent:
    return EmailContent(
        subject=_subject(ctx, "Account deletion requested"),
        preheader="Nothing has been deleted yet. You can still cancel.",
        eyebrow="Account deletion requested",
        heading=_hello(ctx),
        paragraphs=(
            f"We received a request to delete your {ctx['brand_name']} account. Nothing has been deleted "
            f"yet.",
            "Until then you can change your mind: sign in and cancel the request on your account page.",
        ),
        facts=(
            Fact("Deleted on or after", str(ctx.get("scheduled_date", ""))),
            Fact("Waiting period", f"{ctx.get('days', '')} days"),
        ),
        cta=Cta("Review my account", _url(ctx, "/account")),
        notices=(
            Notice("Did you not make this request?", "Cancel it and change your password now."),
            _never_asks(ctx),
        ),
        links=(Link("Change my password", _url(ctx, "/forgot-password")),),
    )


def account_deletion_completed(ctx: Context) -> EmailContent:
    return EmailContent(
        subject=_subject(ctx, "Your account has been deleted"),
        preheader="Your account and personal records were removed.",
        eyebrow="Account deleted",
        heading=_hello(ctx),
        paragraphs=(
            f"Your {ctx['brand_name']} account has been deleted. Your saved listings, sign-in records and "
            f"unused "
            "links were removed, and your name and email address were replaced on our side.",
            "This is the last message we will send to this address.",
        ),
        notices=(Notice("Did you not ask for this?", "Tell us through the contact page."),),
        links=(Link("Contact us", _url(ctx, "/contact")),),
    )


def account_deletion_cancelled(ctx: Context) -> EmailContent:
    return EmailContent(
        subject=_subject(ctx, "Account deletion cancelled"),
        preheader="Your account stays as it was.",
        eyebrow="Deletion cancelled",
        heading=_hello(ctx),
        paragraphs=(
            f"Your request to delete your {ctx['brand_name']} account has been cancelled. Your account "
            f"stays as it was.",
        ),
        notices=(
            Notice("Did you not cancel it?", "Change your password now."),
            _never_asks(ctx),
        ),
        links=(Link("Change my password", _url(ctx, "/forgot-password")),),
    )


def email_change_confirm(ctx: Context) -> EmailContent:
    return EmailContent(
        subject=_subject(ctx, "Confirm your new email address"),
        preheader="Confirm this address to finish changing your account email.",
        eyebrow="Confirm your new email",
        heading=_hello(ctx),
        paragraphs=(
            f"You asked to use this address for your {ctx['brand_name']} account. Confirm it to finish the "
            f"change. "
            "Until you do, your account keeps its current address.",
        ),
        cta=Cta("Confirm email address", ctx["link"]),
        fallback=True,
        notices=(
            Notice(
                f"This link works once and expires in {_link_ttl(TokenPurpose.EMAIL_CHANGE)}.",
                "If you did not ask for this, ignore this message and nothing will change.",
            ),
            _never_asks(ctx, share=True),
        ),
    )


def email_change_requested_notice(ctx: Context) -> EmailContent:
    return EmailContent(
        subject=_subject(ctx, "Email address change requested"),
        preheader="Nothing has changed yet: the new address must confirm first.",
        eyebrow="Email change requested",
        heading=_hello(ctx),
        paragraphs=(
            f"Someone asked to change the email address of your {ctx['brand_name']} account to a different "
            f"address. "
            "Nothing has changed yet: the new address must confirm first.",
            "If this was you, no action is needed.",
        ),
        notices=(
            Notice(
                "Was it not you?", "Sign in and change your password now: the request needed your password."
            ),
            _never_asks(ctx),
        ),
        links=(Link("Change my password", _url(ctx, "/forgot-password")),),
    )


def email_changed_notice(ctx: Context) -> EmailContent:
    brand = ctx["brand_name"]
    return EmailContent(
        subject=_subject(ctx, "Your email address was changed"),
        preheader="This address no longer receives messages for the account.",
        eyebrow="Email address changed",
        heading=_hello(ctx),
        paragraphs=(
            f"The email address of your {brand} account was changed. From now on, sign in with the new "
            f"address and "
            f"expect {brand} messages there. This address no longer receives them.",
        ),
        notices=(
            Notice(
                "Did you not make this change?",
                "Use the password reset on the sign-in page with your new address if you can, or contact us.",
            ),
            _never_asks(ctx),
        ),
        links=(Link("Contact us", _url(ctx, "/contact")),),
    )


def welcome(ctx: Context) -> EmailContent:
    """Ready but not sent: no workflow queues it yet (a new trigger needs the owner's approval)."""
    brand = ctx["brand_name"]
    return EmailContent(
        subject=_subject(ctx, f"Welcome to {brand}", brand_suffix=False),
        preheader=f"Your email is confirmed and your {brand} account is ready.",
        eyebrow="Welcome",
        heading=_hello(ctx),
        paragraphs=(
            f"Your email address is confirmed and your {brand} account is ready. {brand} brings jobs, "
            f"internships, "
            "scholarships and tenders in Zimbabwe together in one place, each with a link to its official "
            "source.",
        ),
        bullets=(
            "Browse current opportunities and filter them by category and place.",
            "Save opportunities and come back to them from your dashboard.",
            "Add a profile to see opportunities that match your interests, or switch on job alerts.",
        ),
        cta=Cta("Explore opportunities", _url(ctx, "/opportunities")),
        links=(Link("Complete your profile", _url(ctx, "/profile")),),
    )


# --- job alerts ----------------------------------------------------------------------------------------
def job_alert(ctx: Context) -> EmailContent:
    items = tuple(
        Listing(
            title=one_line(str(i.get("title", "")), 200),
            url=str(i["url"]),
            organisation=one_line(str(i.get("organisation", "")), 120),
            place=one_line(str(i.get("place", "")), 80),
            kind=one_line(str(i.get("kind", "")), 40),
            closes=one_line(str(i.get("closes", "")), 60),
        )
        for i in ctx.get("items", [])
    )
    more = int(ctx.get("more_count") or 0)
    return EmailContent(
        subject=_subject(ctx, "New opportunities matching your alert"),
        preheader=str(ctx.get("headline", "New opportunities match your alert.")),
        eyebrow="Job alert",
        heading=_hello(ctx),
        paragraphs=(str(ctx.get("headline", "")),) if ctx.get("headline") else (),
        listings=items,
        cta=Cta("See all opportunities", str(ctx["search_url"])) if more else None,
        closing=(
            f"Check each listing's source and apply on the official site: {ctx['brand_short']} does not "
            f"receive applications.",
        ),
        notices=(
            Notice(
                f"You get this {ctx.get('frequency', '')} email because you switched on job alerts.",
                "We list only opportunities published since the last one, and we send nothing when there "
                "are none.",
            ),
        ),
        links=(
            Link("Change what you receive", str(ctx["manage_url"])),
            Link("Stop these emails", str(ctx["unsubscribe_url"])),
        ),
    )


# --- employers -----------------------------------------------------------------------------------------
def _org_fact(ctx: Context) -> Fact:
    return Fact("Organisation", one_line(str(ctx.get("organisation_name") or ""), 120))


def _listing_facts(ctx: Context, *, deadline_label: str = "Deadline") -> tuple[Fact, ...]:
    facts = [Fact("Listing", one_line(str(ctx.get("title") or ""), 200)), _org_fact(ctx)]
    if ctx.get("deadline_text"):
        facts.append(Fact(deadline_label, str(ctx["deadline_text"])))
    return tuple(facts)


def employer_claim_received(ctx: Context) -> EmailContent:
    brand = ctx["brand_name"]
    return EmailContent(
        subject=_subject(ctx, "We received your organisation claim"),
        preheader="Our staff will review your request.",
        eyebrow="Organisation claim received",
        heading=_hello(ctx),
        paragraphs=(
            f"We received your request to act for your organisation on {brand}. Our staff review each "
            f"claim and may "
            "ask for more evidence. You do not need to do anything now.",
            "Until a claim is approved you cannot post listings.",
        ),
        facts=(_org_fact(ctx),),
        cta=Cta("Follow its progress", str(ctx["dashboard_url"])),
        reason=_service_reason(ctx),
    )


def employer_claim_approved(ctx: Context) -> EmailContent:
    return EmailContent(
        subject=_subject(ctx, "Your organisation claim was approved"),
        preheader="You can now draft and submit listings.",
        eyebrow="Organisation claim approved",
        heading=_hello(ctx),
        paragraphs=(
            f"Your request to act for your organisation on {ctx['brand_name']} was approved. You can now "
            f"draft and "
            "submit listings.",
            f"Every listing is still reviewed by {ctx['brand_short']} staff before it appears, and "
            f"applications "
            "always happen on your own channel.",
        ),
        facts=(_org_fact(ctx),),
        cta=Cta("Open my employer page", str(ctx["dashboard_url"])),
        reason=_service_reason(ctx),
    )


def employer_claim_rejected(ctx: Context) -> EmailContent:
    reason = str(ctx.get("reason") or "").strip()
    return EmailContent(
        subject=_subject(ctx, "Your organisation claim was not approved"),
        preheader="You can send a new claim with more evidence.",
        eyebrow="Organisation claim not approved",
        heading=_hello(ctx),
        paragraphs=(f"Your request to act for your organisation on {ctx['brand_name']} was not approved.",),
        facts=(_org_fact(ctx),),
        quote=("The reason our staff gave", reason) if reason else None,
        closing=("You can send a new claim with more evidence from your employer page.",),
        cta=Cta("Open my employer page", str(ctx["dashboard_url"])),
        reason=_service_reason(ctx),
    )


def employer_listing_submitted(ctx: Context) -> EmailContent:
    amendment = bool(ctx.get("amendment"))
    what = "amendment" if amendment else "listing"
    return EmailContent(
        subject=_subject(ctx, f"Your {what} was submitted for review"),
        preheader="You will get another email when there is a decision.",
        eyebrow="Submitted for review",
        heading=_hello(ctx),
        paragraphs=(
            f"Your {what} was submitted for review. Our staff check every submission, and someone other "
            f"than its "
            "author must approve it. You will get another email when there is a decision.",
        ),
        facts=_listing_facts(ctx),
        cta=Cta("See where it stands", str(ctx["listing_url"])),
        reason=_member_reason(ctx),
    )


def employer_listing_published(ctx: Context) -> EmailContent:
    amendment = bool(ctx.get("amendment"))
    public = str(ctx.get("public_url") or "")
    return EmailContent(
        subject=_subject(ctx, "Your listing is now published"),
        preheader="It is now visible to visitors.",
        eyebrow="Amendment published" if amendment else "Listing published",
        heading=_hello(ctx),
        paragraphs=(
            "Your amendment was approved and is now live."
            if amendment
            else "Your listing was approved and is now published.",
            f"Publishing does not mean {ctx['brand_short']} has verified the opportunity with you: the "
            f"page says "
            "what was checked. Applications happen on your own channel.",
        ),
        facts=_listing_facts(ctx),
        cta=Cta("See it as visitors do", public)
        if public
        else Cta("Manage the listing", str(ctx["listing_url"])),
        links=(Link("Manage the listing", str(ctx["listing_url"])),) if public else (),
        reason=_member_reason(ctx),
    )


def employer_listing_rejected(ctx: Context) -> EmailContent:
    amendment = bool(ctx.get("amendment"))
    what = "amendment" if amendment else "listing"
    reason = str(ctx.get("reason") or "").strip()
    return EmailContent(
        subject=_subject(ctx, f"Your {what} needs changes"),
        preheader="Make the changes and submit it again.",
        eyebrow="Changes requested",
        heading=_hello(ctx),
        paragraphs=(f"Your {what} was not approved and needs changes before it can be published.",),
        facts=_listing_facts(ctx),
        quote=("The reason our staff gave", reason) if reason else None,
        cta=Cta("Open and edit", str(ctx["listing_url"])),
        closing=(("Until then the version that is already published stays as it is.",) if amendment else ()),
        reason=_member_reason(ctx),
    )


def employer_listing_expiring(ctx: Context) -> EmailContent:
    days = int(ctx.get("days_left") or 0)
    return EmailContent(
        subject=_subject(ctx, "Your listing closes soon"),
        preheader=f"Closes in {days} day{'s' if days != 1 else ''}.",
        eyebrow="Closing soon",
        heading=_hello(ctx),
        paragraphs=(
            f"Your listing closes in {days} day{'s' if days != 1 else ''}. When the deadline passes "
            f"{ctx['brand_short']} marks it as closed.",
            "If the opportunity stays open and the deadline has changed, start an amendment so it can be "
            "reviewed in time.",
        ),
        facts=_listing_facts(ctx, deadline_label="Closes"),
        cta=Cta("Open the listing", str(ctx["listing_url"])),
        reason=_member_reason(ctx),
    )


def employer_listing_expired(ctx: Context) -> EmailContent:
    return EmailContent(
        subject=_subject(ctx, "Your listing has closed"),
        preheader="It stays visible as closed.",
        eyebrow="Listing closed",
        heading=_hello(ctx),
        paragraphs=("Your listing has closed. It stays visible as closed and no longer counts as open.",),
        facts=_listing_facts(ctx, deadline_label="Deadline was"),
        cta=Cta("See the listing", str(ctx["listing_url"])),
        reason=_member_reason(ctx),
    )


BUILDERS: dict[str, Callable[[Context], EmailContent]] = {
    EmailKind.EMAIL_VERIFICATION: email_verification,
    EmailKind.ACCOUNT_EXISTS: account_exists,
    EmailKind.PASSWORD_RESET: password_reset,
    EmailKind.PASSWORD_CHANGED_NOTICE: password_changed_notice,
    EmailKind.ACCOUNT_DELETION_NOTICE: account_deletion_notice,
    EmailKind.ACCOUNT_DELETION_COMPLETED: account_deletion_completed,
    EmailKind.ACCOUNT_DELETION_CANCELLED: account_deletion_cancelled,
    EmailKind.EMAIL_CHANGE_CONFIRM: email_change_confirm,
    EmailKind.EMAIL_CHANGE_REQUESTED_NOTICE: email_change_requested_notice,
    EmailKind.EMAIL_CHANGED_NOTICE: email_changed_notice,
    EmailKind.WELCOME: welcome,
    EmailKind.JOB_ALERT: job_alert,
    EmailKind.EMPLOYER_CLAIM_RECEIVED: employer_claim_received,
    EmailKind.EMPLOYER_CLAIM_APPROVED: employer_claim_approved,
    EmailKind.EMPLOYER_CLAIM_REJECTED: employer_claim_rejected,
    EmailKind.EMPLOYER_LISTING_SUBMITTED: employer_listing_submitted,
    EmailKind.EMPLOYER_LISTING_PUBLISHED: employer_listing_published,
    EmailKind.EMPLOYER_LISTING_REJECTED: employer_listing_rejected,
    EmailKind.EMPLOYER_LISTING_EXPIRING: employer_listing_expiring,
    EmailKind.EMPLOYER_LISTING_EXPIRED: employer_listing_expired,
}


def build(kind: str, ctx: Context) -> EmailContent:
    return BUILDERS[EmailKind(kind)](ctx)
