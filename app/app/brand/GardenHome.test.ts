import { describe, expect, it } from "vitest";
import { cutAtWord, forShelf } from "./GardenHome";
import type { DeskCard } from "../desk/deskCards";

const card = (kind: DeskCard["kind"], kicker: string, title: string): DeskCard =>
  ({
    id: `${kind}:1`,
    kind,
    sections: ["all"],
    note: kind === "fund",
    tone: "#222",
    image: null,
    face: { kicker, title, foot: "Fallbrook" },
    detail: { meta: "", title, host: null, description: "", aside: null, action: null },
    href: "/x",
  }) as DeskCard;

describe("forShelf", () => {
  it("puts an event's date on its chip, not the face", () => {
    const { card: c, stamp } = forShelf(card("event", "NOV 7", "The Art of Creating You"));
    expect(stamp).toBe("NOV 7");
    expect(c.face.kicker).toBe("");
    expect(c.face.title).toBe("The Art of Creating You");
  });

  it("drops a project's stage and keeps the fund's name", () => {
    expect(forShelf(card("project", "PLANNING", "Bloom")).card.face.kicker).toBe("");
    expect(forShelf(card("project", "PLANNING", "Bloom")).stamp).toBeUndefined();
    const fund = forShelf({ ...card("fund", "THE SOPHIA GRANT FUND", "$10,075"), detail: { ...card("fund", "", "").detail, title: "The Sophia Grant Fund" } });
    expect(fund.card.face.kicker).toBe("");
    expect(fund.label).toBe("The Sophia Grant Fund");
  });

  it("ends a long title at a whole word", () => {
    const { card: c } = forShelf(card("project", "PLANNING", "Short film exploring connectedness in unlikely mission fields"));
    expect(c.face.title).toBe("Short film exploring…");
  });

  it("keeps a title that fits its three lines", () => {
    expect(forShelf(card("event", "OCT 30", "Chuck Butler & Friends in Concert")).card.face.title).toBe("Chuck Butler & Friends in Concert");
    expect(forShelf(card("event", "NOV 6", "A Creative Renaissance is Beginning")).card.face.title).toBe("A Creative Renaissance is Beginning");
  });
});

describe("cutAtWord", () => {
  it("keeps whole words and drops trailing punctuation", () => {
    expect(cutAtWord("Help design, build and plant The Garden together", 20)).toBe("Help design, build…");
    expect(cutAtWord("Supercalifragilisticexpialidocious", 10)).toBe("Supercalif…");
  });
});
