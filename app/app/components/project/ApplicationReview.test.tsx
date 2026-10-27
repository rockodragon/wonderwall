import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ApplicationReview, candidateRoleGroups, type ApplicationCandidate } from "./ApplicationReview";
import type { Id } from "../../../convex/_generated/dataModel";

const candidates: ApplicationCandidate[] = [
  { memberId: "ana", name: "Ana", profileId: "p-ana", roleId: "editor", role: "Editor", message: "I edited the sequence", availability: "Oct 29–31, UTC+8", rateProposal: { amount: 500, currency: "USD", unit: "day" }, reviewStage: "considering", workSamples: [{ artifactId: "edit" as Id<"artifacts">, type: "video", title: "Selected edit", mediaUrl: "https://files.example/edit.mp4", linkUrl: null, ogImageUrl: null, content: null }] },
  { memberId: "ben", name: "Ben", roleId: "sound", role: "Sound mixer" },
  { memberId: "cam", name: "Cam", roleId: "editor", role: "Editor" },
];
function html(search = "?tab=team") {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[`/projects/film${search}`]}><ApplicationReview candidates={candidates} busyId={null} notes={{}} onNote={() => {}} onStage={() => {}} onDecision={() => {}} messageButton={(candidate) => <button data-application={candidate.memberId}>Message {candidate.name}</button>} /></MemoryRouter>);
}

describe("the lead's candidate review", () => {
  it("groups candidates by the actual opening and filters without collapsing distinct role ids", () => {
    expect(candidateRoleGroups(candidates).map((group) => [group.title, group.candidates.length])).toEqual([["Editor", 2], ["Sound mixer", 1]]);
    expect(candidateRoleGroups(candidates, "editor")[0].candidates.map((candidate) => candidate.name)).toEqual(["Ana", "Cam"]);
    expect(candidateRoleGroups([{ ...candidates[0], roleId: "editor-a" }, { ...candidates[2], roleId: "editor-b" }])).toHaveLength(2);
    const filtered = html("?tab=team&reviewRole=editor");
    expect(filtered).toContain('id="candidate-ana"');
    expect(filtered).toContain('id="candidate-cam"');
    expect(filtered).not.toContain('id="candidate-ben"');
  });

  it("reviews evidence, availability and a clearly labelled proposal before deciding", () => {
    const markup = html("?tab=team&candidate=ana");
    expect(markup).toContain("Oct 29–31, UTC+8");
    expect(markup).toContain("Proposed rate");
    expect(markup).toContain("USD $500/day");
    expect(markup).toContain('<video controls=""');
    expect(markup).toContain("Selected edit");
    expect(markup).toContain('href="/profile/p-ana"');
    expect(markup.indexOf("Message Ana")).toBeLessThan(markup.indexOf(">Accept<"));
  });

  it("keeps consideration separate from accepting someone onto the team", () => {
    const markup = html();
    expect(markup).toContain("Private review");
    expect(markup).toContain('<option value="considering" selected="">Considering</option>');
    expect(markup).toContain(">Accept<");
    expect(markup).toContain(">Decline<");
  });
});
