// Guards the canonical money claims (constants/claims.ts, twin of
// docs/marketing/claims.md): the claims themselves stay clean, and the
// phrases we dropped never reappear anywhere in the site's source.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNED_PHRASES, CLAIMS } from "./claims";

const APP_DIR = join(__dirname, "..");
const SCAN_DIRS = ["routes", "components", "garden", "lib", "legal"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

describe("the claims themselves", () => {
  it("never use a phrase we dropped", () => {
    for (const [name, sentence] of Object.entries(CLAIMS)) {
      for (const banned of BANNED_PHRASES) {
        expect(banned.test(sentence), `${name} matches ${banned}`).toBe(false);
      }
    }
  });

  it("make no payout-speed promise", () => {
    for (const sentence of Object.values(CLAIMS)) {
      expect(sentence).not.toMatch(/immediately|instant|right away|same day/i);
    }
  });

  it("state the backing split the code pays out (10% out of the backing)", () => {
    expect(CLAIMS.backing).toContain("you get $90");
    expect(CLAIMS.backingShort).toContain("90%");
    expect(CLAIMS.largeGift).toContain("5%");
  });
});

describe("the site", () => {
  it("never brings back a phrase we dropped — copy or comment", () => {
    const hits: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of sourceFiles(join(APP_DIR, dir))) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          for (const banned of BANNED_PHRASES) {
            if (banned.test(line)) hits.push(`${relative(APP_DIR, file)}:${i + 1} matches ${banned}`);
          }
        });
      }
    }
    expect(hits).toEqual([]);
  });
});
