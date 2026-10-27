import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SubmittedApplication } from "./ApplicationEvidence";
import type { Id } from "../../../convex/_generated/dataModel";

describe("an applicant inspecting their own submission", () => {
  it("shows their submitted evidence and a way to ask the lead before a decision", () => {
    const html = renderToStaticMarkup(<SubmittedApplication role="Editor" evidence={{ availability: "Weekends in November", rateProposal: { amount: 1200, currency: "USD", unit: "fixed" }, workSamples: [{ artifactId: "sample" as Id<"artifacts">, type: "text", title: "Selected scene", content: "My scene", mediaUrl: null, linkUrl: null, ogImageUrl: null }] }} messageButton={<button data-application="mine">Message lead</button>} />);
    expect(html).toContain('aria-label="Your application"');
    expect(html).toContain("Your application · Editor");
    expect(html).toContain("Weekends in November");
    expect(html).toContain("USD $1,200 total");
    expect(html).toContain("Selected scene");
    expect(html).toContain("My scene");
    expect(html).toContain('data-application="mine"');
    expect(html).toContain("ask a question before they decide");
    expect(html).not.toContain("Private review");
  });
  it("keeps older note-only applications understandable", () => {
    const html = renderToStaticMarkup(<SubmittedApplication role="Editor" evidence={{}} messageButton={<button>Message lead</button>} />);
    expect(html).toContain("No work samples, availability or rate proposal were included");
    expect(html).toContain("Waiting for the lead");
  });
});
