"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, Field, Textarea } from "@/components/ui";
import { Icon } from "@/components/workspace/icons";
import { Menu, menuLink } from "@/components/workspace/menu";
import { apiFetch, describeFailure } from "@/lib/client-api";
import type { EmployerListingRow } from "@/lib/employer-types";

const item = `${menuLink} w-full cursor-pointer border-0 bg-transparent text-left`;

/**
 * The actions menu of one row. It offers only what the API says this member may attempt for this listing in
 * its current state (`next_actions`, `can_duplicate`); the server checks every action again, so a hidden item
 * is a convenience and never the safeguard. Employers have no approve, verify or publish action at all.
 */
export function RowActions({ row }: { row: EmployerListingRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const can = (action: string) => (row.next_actions as string[]).includes(action);
  const isDraft = row.status === "draft";

  async function run(path: string, body?: unknown, then?: (data: { id?: string }) => void) {
    setBusy(true);
    setFailure(null);
    const outcome = await apiFetch<{ id?: string }>("POST", path, body);
    setBusy(false);
    if (!outcome.ok) {
      // Nothing is hidden: an unready draft is sent to its page, where the points to fix are listed.
      if (outcome.code === "validation_failed" || outcome.code === "duplicate_detected")
        return router.push(`/employer/listings/${row.id}`);
      return setFailure(describeFailure(outcome));
    }
    if (then) then(outcome.data ?? {});
    router.refresh();
  }

  async function withdraw() {
    setBusy(true);
    setFailure(null);
    const outcome = await apiFetch("POST", `employer/listings/${row.id}/close`, {
      row_version: row.row_version,
      reason: reason.trim(),
    });
    setBusy(false);
    if (!outcome.ok)
      return setFailure(
        outcome.code === "validation_failed"
          ? "Say why, in 10 to 1,000 characters."
          : describeFailure(outcome),
      );
    dialog.current?.close();
    setReason("");
    router.refresh();
  }

  return (
    <>
      <Menu label={`Actions for ${row.title}`} button={<Icon name="more" />} panelClassName="min-w-[230px]">
        {(close) => (
          <ul className="m-0 list-none p-0">
            <li>
              <Link href={`/employer/listings/${row.id}`} onClick={close} className={menuLink}>
                View
              </Link>
            </li>
            {can("edit") ? (
              <li>
                <Link href={`/employer/listings/${row.id}`} onClick={close} className={menuLink}>
                  Edit
                </Link>
              </li>
            ) : null}
            {can("amend") ? (
              <li>
                <button
                  type="button"
                  className={item}
                  disabled={busy}
                  onClick={() => {
                    close();
                    void run(`employer/listings/${row.id}/amend`, { row_version: row.row_version }, () =>
                      router.push(`/employer/listings/${row.id}`),
                    );
                  }}
                >
                  Edit (start an amendment)
                </button>
              </li>
            ) : null}
            {can("reopen") ? (
              <li>
                <button
                  type="button"
                  className={item}
                  disabled={busy}
                  onClick={() => {
                    close();
                    void run(`employer/listings/${row.id}/reopen`, { row_version: row.row_version }, () =>
                      router.push(`/employer/listings/${row.id}`),
                    );
                  }}
                >
                  Respond to the changes asked for
                </button>
              </li>
            ) : null}
            <li>
              <Link href={`/employer/listings/${row.id}/preview`} onClick={close} className={menuLink}>
                Preview
              </Link>
            </li>
            {row.can_duplicate ? (
              <li>
                <button
                  type="button"
                  className={item}
                  disabled={busy}
                  onClick={() => {
                    close();
                    void run(`employer/listings/${row.id}/duplicate`, undefined, (copy) =>
                      router.push(`/employer/listings/${copy.id ?? ""}`),
                    );
                  }}
                >
                  Duplicate
                </button>
              </li>
            ) : null}
            {can("submit") ? (
              <li>
                <button
                  type="button"
                  className={item}
                  disabled={busy}
                  onClick={() => {
                    close();
                    void run(`employer/listings/${row.id}/submit`, { row_version: row.row_version });
                  }}
                >
                  Submit for review
                </button>
              </li>
            ) : null}
            {can("close") ? (
              <li>
                <button
                  type="button"
                  className={item}
                  onClick={() => {
                    close();
                    dialog.current?.showModal();
                  }}
                >
                  Withdraw
                </button>
              </li>
            ) : null}
            {can("discard") ? (
              <li>
                <button
                  type="button"
                  className={`${item} text-danger`}
                  disabled={busy}
                  onClick={() => {
                    close();
                    if (
                      !window.confirm(
                        `${isDraft ? "Delete this draft" : "Discard this version"}? This cannot be undone.`,
                      )
                    )
                      return;
                    void run(`employer/listings/${row.id}/discard`, { row_version: row.row_version });
                  }}
                >
                  {isDraft ? "Delete draft" : "Discard this version"}
                </button>
              </li>
            ) : null}
          </ul>
        )}
      </Menu>
      {failure ? (
        <span role="alert" className="sr-only">
          {failure}
        </span>
      ) : null}
      <dialog
        ref={dialog}
        aria-labelledby={`withdraw-${row.id}`}
        className="m-auto w-[min(440px,calc(100vw-32px))] rounded-card border border-border-panel bg-surface p-4 text-ink backdrop:bg-overlay"
      >
        <h2 id={`withdraw-${row.id}`} className="m-0 text-title font-strong">
          Withdraw this listing?
        </h2>
        <p className="mt-2 text-ctl text-muted">
          It comes off the site and stays readable, marked as withdrawn by the issuer. To publish it again you
          would start an amendment and have it reviewed.
        </p>
        <div className="mt-3">
          <Field id={`reason-${row.id}`} label="Why are you withdrawing it?" hint="10 to 1,000 characters.">
            <Textarea
              id={`reason-${row.id}`}
              rows={3}
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        </div>
        {failure ? (
          <p className="m-0 mt-2 text-ctl text-danger" role="alert">
            {failure}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void withdraw()}>
            Yes, withdraw it
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => dialog.current?.close()}>
            Cancel
          </Button>
        </div>
      </dialog>
    </>
  );
}
