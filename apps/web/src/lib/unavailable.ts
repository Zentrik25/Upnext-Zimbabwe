/**
 * A public page whose content could not be loaded (the API was unreachable, rate-limited or answered unexpectedly).
 *
 * Such a page must not be answered with `200` and `noindex`: a search engine that crawls it at that moment is told
 * to drop a page that is in fact live, and a temporary fault becomes a lasting loss of an indexed listing. Throwing
 * instead makes Next.js answer with a server error (5xx) before anything is sent, which crawlers treat as
 * temporary: they keep the page they already have and come back later. Visitors see the shared error view with a
 * retry (`app/error.tsx`). A listing that does not exist is still a real `404` (`notFound()`), never this.
 */
export class ContentUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`content unavailable: ${reason}`);
    this.name = "ContentUnavailableError";
  }
}

export function unavailable(reason: string): never {
  throw new ContentUnavailableError(reason);
}
