import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_TRAINING_CRAWLERS, AI_TRAINING_ROBOTS_TOKENS, isAiTrainingCrawler } from "./aiCrawlers";

// User agents as each company documents them.
const TRAINING = {
  GPTBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  ClaudeBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  CCBot: "CCBot/2.0 (https://commoncrawl.org/faq/)",
  Meta: "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
  Bytespider:
    "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
};

const WELCOME = {
  Chrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  Googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "OAI-SearchBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
  "ChatGPT-User": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
  PerplexityBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  "Claude-SearchBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)",
  "Claude-User": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)",
  "Facebook link preview": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
};

describe("isAiTrainingCrawler", () => {
  for (const [name, ua] of Object.entries(TRAINING)) {
    it(`turns away ${name}`, () => expect(isAiTrainingCrawler(ua)).toBe(true));
  }
  for (const [name, ua] of Object.entries(WELCOME)) {
    it(`lets ${name} in`, () => expect(isAiTrainingCrawler(ua)).toBe(false));
  }
  it("lets a request with no user agent in", () => expect(isAiTrainingCrawler(null)).toBe(false));
});

describe("robots.txt", () => {
  const robots = readFileSync(join(__dirname, "../../public/robots.txt"), "utf8");

  it("disallows every training crawler in one group", () => {
    const groups = robots.split(/\n\s*\n/);
    const training = groups.find((g) => g.includes("User-agent: GPTBot")) ?? "";
    const agents = [...training.matchAll(/^User-agent: (.+)$/gm)].map((m) => m[1].trim());

    expect(agents.sort()).toEqual([...AI_TRAINING_CRAWLERS, ...AI_TRAINING_ROBOTS_TOKENS].sort());
    expect(training).toMatch(/^Disallow: \/$/m);
  });
});
