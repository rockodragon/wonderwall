import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import ConversationView from "./messages.$conversationId";

const scene = vi.hoisted(() => ({ contexts: true }));
const contexts = [
  { projectMemberId: "projectMembers:first", projectId: "projects:first", projectTitle: "First film", role: "Editor" },
  { projectMemberId: "projectMembers:second", projectId: "projects:second", projectTitle: "Second film", role: "Colorist" },
];

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: () => async () => {},
    useQuery: (fn: Parameters<typeof getFunctionName>[0]) => {
      switch (getFunctionName(fn)) {
        case "messaging:getConversation":
          return {
            _id: "conversations:one", participant: { userId: "users:creative", profileId: "profiles:creative", name: "Creative" },
            projectContexts: scene.contexts ? contexts : [],
          };
        case "messaging:getMessages":
          return {
            messages: scene.contexts ? [
              { _id: "messages:first", createdAt: 1, content: "Edit question", isOwnMessage: true, projectContext: contexts[0] },
              { _id: "messages:second", createdAt: 2, content: "Color question", isOwnMessage: false, projectContext: contexts[1] },
            ] : [],
            nextCursor: null,
          };
      }
    },
  };
});

function page(query = "") {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/messages/conversations:one${query}`]}>
      <Routes><Route path="/messages/:conversationId" element={<ConversationView />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { scene.contexts = true; });

describe("project context in the conversation", () => {
  it("opens the precise role from the review entry point and keeps other film contexts available", () => {
    const html = page("?application=projectMembers%3Afirst");
    expect(html).toContain('aria-label="Conversation project and role"');
    expect(html).toMatch(/<option value="projectMembers:first" selected="">Editor on First film<\/option>/);
    expect(html).toContain('href="/projects/projects:first?tab=team"');
    expect(html).toContain("Colorist on Second film");
  });

  it("recovers the latest remembered context when reopening without a query string", () => {
    expect(page()).toMatch(/<option value="projectMembers:second" selected="">Colorist on Second film<\/option>/);
  });

  it("can explicitly use General while each historical message retains its own film attribution", () => {
    const html = page("?application=general");
    expect(html).toContain('<option value="general" selected="">General conversation</option>');
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toContain("About Editor on First filmEdit question");
    expect(text).toContain("About Colorist on Second filmColor question");
  });

  it("requires an explicit choice when the requested project context is no longer available", () => {
    scene.contexts = false;
    const html = page("?application=projectMembers%3Afirst");
    expect(html).toContain('aria-label="Conversation project and role"');
    expect(html).toContain('<option value="unavailable" disabled="" selected="">Project context unavailable</option>');
    expect(html).toContain("Choose another context or General conversation to send a message.");
    expect(html).toMatch(/<button disabled=""[^>]*aria-label="Send message"/);
    expect(html).not.toContain("First film");
    expect(html).toContain("No messages yet");
  });

  it("does not silently switch an unknown requested context to another film or General", () => {
    const html = page("?application=projectMembers%3Aunknown");
    expect(html).toContain('<option value="unavailable" disabled="" selected="">Project context unavailable</option>');
    expect(html).not.toContain('<option value="general" selected="">');
    expect(html).not.toContain("View project");
    expect(html).toContain('role="status"');
  });

  it("keeps an ordinary pair conversation ordinary when no project context was requested", () => {
    scene.contexts = false;
    const html = page();
    expect(html).not.toContain('aria-label="Conversation project and role"');
    expect(html).not.toContain("no longer available");
  });
});
