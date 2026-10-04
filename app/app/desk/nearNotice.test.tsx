import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { NearNotice } from "./deskBrowse";

const base = { ask: false, error: "", loading: false, request: () => {} };

describe("NearNotice", () => {
  it("a link into Near me asks for a tap rather than a dead end", () => {
    const html = renderToString(<NearNotice near={{ ...base, ask: true }} noun="people" />);
    expect(html).toContain("Share your location to see people near you.");
    expect(html).toContain(">Use my location<");
    expect(html).not.toContain('disabled=""');
  });

  it("a denied answer says how to turn location on and offers Try again", () => {
    const error = "Location is off for this site. Turn it on in Settings → Safari → Location.";
    const html = renderToString(<NearNotice near={{ ...base, error }} noun="people" />);
    expect(html).toContain("Settings → Safari → Location");
    expect(html).toContain(">Try again<");
    expect(html).not.toContain("Use my location");
  });

  it("an unavailable answer also gets Try again", () => {
    const html = renderToString(<NearNotice near={{ ...base, error: "Couldn't get your location." }} noun="events" />);
    expect(html).toContain("Couldn&#x27;t get your location.");
    expect(html).toContain(">Try again<");
  });

  it("while locating, the button waits", () => {
    const html = renderToString(<NearNotice near={{ ...base, ask: true, loading: true }} noun="people" />);
    expect(html).toContain(">Locating…<");
    expect(html).toContain('disabled=""');
  });
});
