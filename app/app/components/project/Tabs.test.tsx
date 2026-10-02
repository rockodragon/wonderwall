import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { TabPanel, Tabs, nextTabIndex, tabButtonId, tabPanelId } from "./Tabs";

const tabs = [
  { id: "about", label: "About" },
  { id: "team", label: "Team · 2 requests" },
  { id: "updates", label: "Updates" },
] as const;

describe("nextTabIndex", () => {
  it("moves with the arrows and wraps at both ends", () => {
    expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 1, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
  });
  it("jumps to the first and last with Home and End", () => {
    expect(nextTabIndex("Home", 2, 3)).toBe(0);
    expect(nextTabIndex("End", 0, 3)).toBe(2);
  });
  it("leaves every other key alone", () => {
    expect(nextTabIndex("Enter", 0, 3)).toBeNull();
    expect(nextTabIndex("ArrowDown", 0, 3)).toBeNull();
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("Tabs", () => {
  const html = renderToString(
    <>
      <Tabs tabs={tabs} selected="team" onSelect={() => {}} label="Project sections" base="p" id="row" />
      <TabPanel base="p" id="about" selected={false}>
        about
      </TabPanel>
      <TabPanel base="p" id="team" selected>
        team
      </TabPanel>
    </>,
  );

  it("is a labelled tablist of tabs", () => {
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Project sections"');
    expect(html.match(/role="tab"/g)).toHaveLength(3);
  });
  it("marks the chosen tab, and only it is in the tab order", () => {
    expect(html).toMatch(/aria-selected="true"[^>]*tabindex="0"[^>]*>Team/);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
  });
  it("ties each tab to its panel both ways", () => {
    expect(html).toContain(`id="${tabButtonId("p", "team")}"`);
    expect(html).toContain(`aria-controls="${tabPanelId("p", "team")}"`);
    expect(html).toContain(`id="${tabPanelId("p", "team")}"`);
    expect(html).toContain(`aria-labelledby="${tabButtonId("p", "team")}"`);
  });
  it("keeps a panel that isn't chosen in the page, hidden", () => {
    expect(html).toMatch(/role="tabpanel"[^>]*id="p-panel-about"[^>]*hidden=""[^>]*>about</);
    expect(html).not.toMatch(/id="p-panel-team"[^>]*hidden/);
  });
});
