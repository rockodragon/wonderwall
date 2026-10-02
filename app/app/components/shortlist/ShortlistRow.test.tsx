import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { formatMoney } from "../../garden/ui";
import { NOW, event, on, project, role, amount } from "../../lib/shortlist/fixtures";
import { rowModel } from "./rowModel";
import { ShortlistRow } from "./ShortlistRow";

const invite = rowModel(
  { type: "project", row: project("invited", "Hollow Creek", { role: role("Sound Mixer"), pay: amount(1200), since: on(9, 30) }) },
  { hot: true, withArea: false, now: NOW, money: formatMoney },
);
const quiet = rowModel({ type: "event", event: event("going", "Potluck", on(9, 19), { cancelled: true }) }, { hot: false, withArea: false, past: true, now: NOW, money: formatMoney });

const html = (node: React.ReactNode) => renderToString(<MemoryRouter>{node}</MemoryRouter>);

describe("ShortlistRow", () => {
  it("is the desk's button, opening a card, unless told it's the phone's", () => {
    const out = html(<ShortlistRow row={invite} onOpen={vi.fn()} />);
    expect(out).toMatch(/^<button type="button" data-desk-card="role:sound-mixer" aria-haspopup="dialog"/);
    // Status before meta: what to do, then the muted detail.
    expect(out).toContain("grid-template-columns:44px minmax(0,1fr) 200px 128px 88px");
    expect(out).toContain("#FFE066");
    expect(out).not.toContain("var(--app-");
  });

  it("is the phone's link to the item's page, on the app's tokens", () => {
    const out = html(<ShortlistRow variant="phone" row={invite} href="/projects/hollow-creek?tab=team" />);
    expect(out).toMatch(/^<a [^>]*href="\/projects\/hollow-creek\?tab=team"/);
    expect(out).not.toContain("<button");
    expect(out).not.toContain("data-desk-card");
    expect(out).not.toContain("aria-haspopup");
    expect(out).toContain("var(--app-text)");
    expect(out).toContain("var(--app-accent-ink)");
    expect(out).not.toMatch(/#FFE066|#F4F4F2|#ACACA4/i);
  });

  it("keeps the same words in both: title, second line, pay, status and action", () => {
    const text = (s: string) => s.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
    const desk = text(html(<ShortlistRow row={invite} onOpen={vi.fn()} />));
    const phone = text(html(<ShortlistRow variant="phone" row={invite} href="/x" />));
    for (const word of ["Sound Mixer", "Dana invited you · Hollow Creek", "$1,200", "Reply to invite", "Reply"]) {
      expect(desk).toContain(word);
      expect(phone).toContain(word);
    }
  });

  it("puts the need before the muted meta, on the phone as on the desk", () => {
    const text = (s: string) => s.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
    expect(text(html(<ShortlistRow row={invite} onOpen={vi.fn()} />))).toMatch(/Reply to invite\|\$1,200\|Reply/);
    expect(text(html(<ShortlistRow variant="phone" row={invite} href="/x" />))).toMatch(/Reply to invite\|\$1,200\|Reply/);
  });

  it("yellow is the need alone: the meta is quiet, and the date block stays neutral", () => {
    const hosting = rowModel({ type: "event", event: event("hosting", "Zine", on(10, 2, 19), { goingCount: 12 }) }, { hot: true, withArea: false, now: NOW, money: formatMoney });
    const out = html(<ShortlistRow row={hosting} onOpen={vi.fn()} />);
    // The status in the accent, the meta not, and nothing else in it.
    expect(out).toMatch(/color:#FFE066[^>]*>Today · 7PM</);
    expect(out).not.toMatch(/color:#FFE066[^>]*>12 going</);
    expect(out).not.toContain("rgba(255,224,102");
  });

  it("lets a Needs you row's second line wrap to two lines, and any other's stay on one", () => {
    expect(html(<ShortlistRow variant="phone" row={invite} href="/x" />)).toContain("-webkit-line-clamp:2");
    expect(html(<ShortlistRow variant="phone" row={quiet} href="/x" />)).not.toContain("-webkit-line-clamp");
  });

  it("marks a Needs you row with the rule in the accent, and a quiet one without", () => {
    expect(html(<ShortlistRow variant="phone" row={invite} href="/x" />)).toContain("width:3px");
    expect(html(<ShortlistRow variant="phone" row={quiet} href="/x" />)).not.toContain("width:3px");
  });

  it("quiets a folded row's title on the phone with the dim token", () => {
    const out = html(<ShortlistRow variant="phone" row={quiet} href="/x" />);
    expect(out).toMatch(/font-weight:500;color:var\(--app-text-dim\)/);
  });

  it("leaves out an empty pay or status line rather than a blank one, on the phone", () => {
    const bare = { ...invite, meta: null, status: null, action: null, hot: false };
    const out = html(<ShortlistRow variant="phone" row={bare} href="/x" />);
    expect(out).not.toContain("letter-spacing:0.12em");
    expect(out).not.toContain("letter-spacing:0.14em");
    expect(out).not.toContain("border-radius:8px");
  });

  it("draws a face and a date block in the phone's colors too", () => {
    const person = rowModel({ type: "person", person: { profileId: "k", name: "Kofi Mensah", imageUrl: null, interests: [], since: NOW } }, { hot: false, withArea: false, now: NOW, money: formatMoney });
    const face = html(<ShortlistRow variant="phone" row={person} href="/profile/k" />);
    expect(face).toContain("KM");
    expect(face).toContain("background:var(--app-hairline-raised)");
    const date = html(<ShortlistRow variant="phone" row={quiet} href="/x" />);
    expect(date).toContain("background:var(--app-surface-raised)");
  });
});
