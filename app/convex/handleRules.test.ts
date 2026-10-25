// The address rules (handleRules.ts): Instagram's, so a name from there works
// here. Pure, no Convex.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cleanHandle,
  HANDLE_MAX_LENGTH,
  HANDLE_PROBLEM_REASON,
  handleProblem,
  profilePath,
  RESERVED_HANDLES,
} from "./handleRules";

describe("cleanHandle", () => {
  it("drops the @, the space around it and the capitals", () => {
    expect(cleanHandle("  @Rick.Moy ")).toBe("rick.moy");
    expect(cleanHandle("@@ana")).toBe("ana");
    expect(cleanHandle("ANA_R")).toBe("ana_r");
  });

  it("is empty for nothing", () => {
    expect(cleanHandle("")).toBe("");
    expect(cleanHandle(" @ ")).toBe("");
  });
});

describe("handleProblem", () => {
  it("allows Instagram's shapes", () => {
    for (const ok of ["rick", "rick.moy", "rick_moy", "r", "a1", "1a", "_rick_", "a.b.c", "a".repeat(HANDLE_MAX_LENGTH)]) {
      expect(handleProblem(ok), ok).toBeNull();
    }
  });

  it("needs something", () => {
    expect(handleProblem("")).toBe("empty");
  });

  it("stops at 30 characters", () => {
    expect(handleProblem("a".repeat(HANDLE_MAX_LENGTH + 1))).toBe("too_long");
  });

  it("takes letters, numbers, periods and underscores only", () => {
    for (const bad of ["rick moy", "rick-moy", "rick!", "rick@x", "rick/moy", "rïck", "Rick"]) {
      expect(handleProblem(bad), bad).toBe("characters");
    }
    expect(HANDLE_PROBLEM_REASON.characters).toBe("Use letters, numbers, periods and underscores.");
  });

  it("keeps periods off the ends and apart", () => {
    for (const bad of [".rick", "rick.", "ri..ck", "."]) {
      expect(handleProblem(bad), bad).toBe("periods");
    }
  });

  it("reserves the site's own names", () => {
    for (const name of ["admin", "api", "settings", "help", "support", "garden", "exchange", "about", "login", "signup"]) {
      expect(handleProblem(name), name).toBe("reserved");
    }
    expect(HANDLE_PROBLEM_REASON.reserved).toBe("That address is reserved.");
  });
});

describe("RESERVED_HANDLES", () => {
  it("has every static route's first segment from app/routes.ts", () => {
    const routes = readFileSync(join(__dirname, "..", "app", "routes.ts"), "utf8");
    const segments = new Set(
      [...routes.matchAll(/\broute\(\s*"([^":*][^"]*)"/g)]
        .map((m) => m[1].split("/")[0])
        .filter((s) => s && !s.startsWith(":")),
    );
    expect(segments.size).toBeGreaterThan(20);
    for (const segment of segments) {
      expect(RESERVED_HANDLES.has(segment), `/${segment} is a page; reserve "${segment}" in handleRules.ts`).toBe(true);
    }
  });

  it("is all valid handles otherwise, so the reserved line is the one shown", () => {
    for (const name of RESERVED_HANDLES) {
      expect(/^[a-z0-9._-]+$/.test(name), name).toBe(true);
    }
  });
});

describe("profilePath", () => {
  it("is /@handle", () => {
    expect(profilePath("rick")).toBe("/@rick");
  });
});
