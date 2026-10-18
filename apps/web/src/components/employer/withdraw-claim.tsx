"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, describeFailure } from "@/lib/client-api";

export function WithdrawClaim({ id }: { id: string }) {
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-[44px] items-center text-accent underline"
        onClick={async () => {
          const outcome = await apiFetch("DELETE", `employer/claims/${id}`);
          if (outcome.ok) router.refresh();
          else setFailure(describeFailure(outcome));
        }}
      >
        Withdraw this claim
      </button>
      {failure ? <span role="alert"> Error: {failure}</span> : null}
    </>
  );
}
