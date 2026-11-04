import "server-only";

/** The error code of a failed fetch (undici puts it on `cause`), or a short description. */
function describe(error: unknown): string {
  const cause = (error as { cause?: { code?: string } } | null)?.cause;
  return cause?.code ?? (error instanceof Error ? error.name : "unknown");
}

/**
 * A server-side READ of the internal API. It retries once, on a fresh connection, when the request fails at the network
 * level, and logs it when both attempts fail.
 *
 * Why: the API (gunicorn) closes an idle keep-alive connection after 2 s and sends no hint, while Node's fetch keeps idle
 * connections for up to 4 s. A request sent just as the server closes a pooled connection fails with UND_ERR_SOCKET
 * ("other side closed") and the API never sees it. Reproduced against gunicorn: 2 of 160 reads failed that way, none
 * with a retry. Without the retry such a failure silently became an empty list (for example no place checkboxes on the
 * profile page) or an error page. Only for idempotent reads (GET): never use it for a write.
 *
 * A request that has timed out is not retried: its time is spent.
 */
export async function fetchRead(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (first) {
    if (init.signal?.aborted) throw first;
    try {
      return await fetch(url, init);
    } catch (second) {
      // Path only (no query string): nothing personal in the log.
      console.error(
        `API read failed twice: ${new URL(url).pathname} (${describe(first)}, ${describe(second)})`,
      );
      throw second;
    }
  }
}
