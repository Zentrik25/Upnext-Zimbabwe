"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, TextInput } from "@/components/ui";
import { Row } from "@/components/workspace/job-editor-parts";
import { apiFetch, describeFailure } from "@/lib/client-api";
import type { StaffArticle } from "@/lib/insights-types";

/** Starts an article with its headline; everything else is written in the editor it opens. */
export function NewArticleForm() {
  const router = useRouter();
  const [headline, setHeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      className="grid max-w-[640px] gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setProblem(null);
        const result = await apiFetch<StaffArticle>("POST", "staff/insights/articles", { headline });
        setBusy(false);
        if (!result.ok) return setProblem(result.fields.headline?.join(" ") ?? describeFailure(result));
        router.push(`/workspace/insights/${result.data.id}/edit`);
      }}
    >
      <Row
        id="new-headline"
        title="Headline"
        hint="10 to 160 characters. You can change it later."
        error={problem ?? undefined}
      >
        <TextInput
          id="new-headline"
          required
          minLength={10}
          maxLength={160}
          value={headline}
          invalid={!!problem}
          onChange={(e) => setHeadline(e.target.value)}
        />
      </Row>
      <Button type="submit" disabled={busy} aria-busy={busy} className="justify-self-start">
        {busy ? "Creating…" : "Create draft"}
      </Button>
    </form>
  );
}
