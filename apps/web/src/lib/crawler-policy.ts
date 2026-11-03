/**
 * The crawler-access policy (ADR-0027, PROPOSED until the owner approves it). One list feeds robots.txt, llms.txt and
 * the tests, so what the policy says is what robots.txt does.
 *
 * Search and answer crawlers are allowed: public pages are meant to be found, and a search or assistant product can
 * only cite UPNEXT if it may fetch the page. Nothing in robots.txt guarantees ranking, indexing or citation.
 * Training-only crawlers are the owner's content-rights decision. The default keeps them out (easy to reverse; a crawl
 * cannot be undone); `UPNEXT_AI_TRAINING_CRAWLERS=allow` lets them in.
 * Private areas are disallowed for everyone (`PRIVATE_PATHS`); robots.txt is a request, not access control: those pages
 * are protected by sign-in and the ones that can be opened also say `noindex`.
 */
export const PRIVATE_PATHS = [
  "/workspace",
  "/api/",
  "/health/",
  "/django-admin/",
  "/account",
  "/saved",
  "/dashboard",
  "/for-you",
  "/profile",
  "/alerts",
  "/sign-in",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/employer/", // employer tools; the public /employers pages stay open
];

/** Crawlers that fetch pages to build a search index or to answer a person's question: allowed. */
export const SEARCH_AND_ANSWER_CRAWLERS = [
  "Googlebot",
  "Bingbot",
  "DuckDuckBot",
  "Applebot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
] as const;

/** Crawlers whose stated purpose is collecting content to train models: kept out unless the owner allows them. */
export const TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Bytespider",
  "meta-externalagent",
] as const;

export const trainingCrawlersAllowed = (): boolean =>
  (process.env.UPNEXT_AI_TRAINING_CRAWLERS ?? "disallow").toLowerCase() === "allow";
