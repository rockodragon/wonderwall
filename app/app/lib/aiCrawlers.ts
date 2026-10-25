// Members' work is never AI training data (routes/legal.terms.tsx: "we do
// NOT use Your Content to train artificial intelligence"). The promise covers
// what others take too: these crawlers gather pages to train AI models.
// public/robots.txt tells each of them no, and functions/_middleware.ts turns
// away the ones that ignore robots.txt but still say who they are.
//
// Search and answer tools stay welcome (Googlebot, Bingbot, OAI-SearchBot,
// ChatGPT-User, PerplexityBot, Claude-SearchBot, Claude-User), so someone
// asking an AI where to find a pottery class can still be sent to our public
// pages. So do link previews (facebookexternalhit, Slackbot, iMessage): a
// shared event still shows its picture.

/** Crawlers that collect pages to train AI models, by the name each sends. */
export const AI_TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
  "meta-externalagent",
  "FacebookBot",
  "Bytespider",
  "Amazonbot",
  "cohere-ai",
  "cohere-training-data-crawler",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "PanguBot",
  "Timpibot",
  "AI2Bot",
  "img2dataset",
] as const;

/** Names that exist only in robots.txt: Google and Apple crawl with their
 *  search bots and read these to decide whether pages may train their models. */
export const AI_TRAINING_ROBOTS_TOKENS = ["Google-Extended", "Applebot-Extended"] as const;

const TRAINING_CRAWLER = new RegExp(`\\b(?:${AI_TRAINING_CRAWLERS.join("|")})\\b`, "i");

export function isAiTrainingCrawler(userAgent: string | null): boolean {
  return !!userAgent && TRAINING_CRAWLER.test(userAgent);
}
