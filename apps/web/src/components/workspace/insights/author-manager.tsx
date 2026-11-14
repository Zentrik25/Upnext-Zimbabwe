"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Checkbox, Textarea, TextInput } from "@/components/ui";
import { MediaDialog } from "@/components/workspace/media-dialog";
import { Row } from "@/components/workspace/job-editor-parts";
import { apiFetch, describeFailure } from "@/lib/client-api";

export type StaffAuthor = {
  user_id: string;
  display_name: string;
  slug: string | null;
  bio: string;
  image: string | null;
  image_url: string | null;
  expertise: string[];
  is_public: boolean;
  exists: boolean;
};

/**
 * Author profiles (D-78). Writers edit their own; Administrators edit everyone's. Only what the author states is
 * shown: no credential, qualification or title is filled in for them. A public archive page exists only once the
 * author has enough published articles.
 */
export function AuthorManager({ authors }: { authors: StaffAuthor[] }) {
  return (
    <div className="grid gap-6">
      {authors.map((a) => (
        <AuthorForm key={a.user_id} initial={a} />
      ))}
    </div>
  );
}

function AuthorForm({ initial }: { initial: StaffAuthor }) {
  const router = useRouter();
  const [value, setValue] = useState({
    ...initial,
    expertiseText: initial.expertise.join(", "),
  });
  const [busy, setBusy] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const key = initial.user_id;
  const err = (k: string) => fields[k]?.join(" ");

  return (
    <form
      aria-label={`Author profile of ${initial.display_name}`}
      className="grid gap-3 rounded-card border border-line p-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        const result = await apiFetch<StaffAuthor>("PUT", `staff/insights/authors/${initial.user_id}`, {
          display_name: value.display_name,
          bio: value.bio,
          expertise: value.expertiseText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          image: value.image ?? "",
          is_public: value.is_public,
        });
        setBusy(false);
        if (!result.ok) {
          setFields(result.fields);
          return setMessage(describeFailure(result));
        }
        setFields({});
        setMessage("Saved.");
        router.refresh();
      }}
    >
      <Row id={`${key}-name`} title="Name shown on articles" error={err("display_name")}>
        <TextInput
          id={`${key}-name`}
          required
          maxLength={120}
          value={value.display_name}
          invalid={!!err("display_name")}
          onChange={(e) => setValue((s) => ({ ...s, display_name: e.target.value }))}
        />
      </Row>
      <Row
        id={`${key}-expertise`}
        title="Writes about"
        hint="Up to 8 areas, separated by commas. Only areas the author actually covers."
        optional
        error={err("expertise")}
      >
        <TextInput
          id={`${key}-expertise`}
          value={value.expertiseText}
          onChange={(e) => setValue((s) => ({ ...s, expertiseText: e.target.value }))}
        />
      </Row>
      <Row
        id={`${key}-bio`}
        title={`Biography (${value.bio.length}/1500)`}
        hint="Plain text, written or approved by the author. Do not add credentials they have not confirmed."
        optional
        error={err("bio")}
        className="sm:col-span-2"
      >
        <Textarea
          id={`${key}-bio`}
          rows={3}
          maxLength={1500}
          value={value.bio}
          onChange={(e) => setValue((s) => ({ ...s, bio: e.target.value }))}
        />
      </Row>
      <div className="grid gap-2">
        <span className="text-small font-strong">Picture</span>
        {value.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a Media Library thumbnail.
          <img
            src={value.image_url}
            alt=""
            width={96}
            height={96}
            className="h-24 w-24 rounded-card object-cover"
          />
        ) : (
          <p className="m-0 text-small text-muted">No picture.</p>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => setMediaOpen(true)}>
            Choose from Media Library
          </Button>
          {value.image ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setValue((s) => ({ ...s, image: null, image_url: null }))}
            >
              Remove
            </Button>
          ) : null}
        </div>
        <MediaDialog
          open={mediaOpen}
          onClose={() => setMediaOpen(false)}
          onUse={(item) => {
            setMediaOpen(false);
            setValue((s) => ({ ...s, image: item.name, image_url: item.thumb_url ?? item.url ?? null }));
          }}
        />
      </div>
      <div className="grid content-start gap-2">
        <Checkbox
          id={`${key}-public`}
          label="Show this profile on articles"
          checked={value.is_public}
          onChange={(e) => setValue((s) => ({ ...s, is_public: e.target.checked }))}
        />
        {initial.slug ? (
          <p className="m-0 text-small text-muted">
            Archive address: /insights/author/{initial.slug} (public once three or more articles are
            published)
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : "Save profile"}
        </Button>
        {message ? (
          <p role="status" className="m-0 text-small text-muted">
            {message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
