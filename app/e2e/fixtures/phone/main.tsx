// The phone preview: the real app shell (routes/_app.tsx, with its bottom
// bar) around the real phone screens, on sample data (data.ts). Open it at a
// phone width. See README.md.

import { createRoot } from "react-dom/client";
import { createBrowserRouter, Link, Navigate, RouterProvider, useParams } from "react-router";
import AppLayout from "../../../app/routes/_app";
import Today from "../../../app/routes/today";
import Events from "../../../app/routes/events";
import Projects from "../../../app/routes/projects";
import Favorites from "../../../app/routes/favorites";
import Messages from "../../../app/routes/messages._index";
import People from "../../../app/routes/search";
// A named export, never a route's default (see routes/slug.tsx).
import { ProfilePage, type ProfileData } from "../../../app/routes/profile";
import { myPage } from "./data";
import "./fixture.css";

function Elsewhere({ what }: { what: string }) {
  const params = useParams();
  const id = Object.values(params)[0] ?? "";
  return (
    <main className="mx-auto max-w-3xl p-6" style={{ color: "var(--app-text)" }}>
      <p className="text-xs uppercase tracking-[0.16em]" style={{ fontFamily: "var(--garden-font-mono)", color: "var(--app-text-dim)" }}>
        Preview · {what}
      </p>
      <h1 className="mt-2 text-2xl font-semibold" style={{ fontFamily: "var(--garden-font-display)" }}>
        {id || what}
      </h1>
      <p className="mt-2 text-sm" style={{ color: "var(--app-text-muted)" }}>
        This page isn't part of the phone preview. Use the bar below to go on.
      </p>
      <Link to="/today" className="mt-4 inline-block text-sm underline">
        Back to Today
      </Link>
    </main>
  );
}

const router = createBrowserRouter([
  {
    Component: AppLayout,
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: "today", Component: Today },
      { path: "events", Component: Events },
      { path: "projects", Component: Projects },
      { path: "favorites", Component: Favorites },
      { path: "messages", Component: Messages },
      { path: "people", Component: People },
      { path: "search", Component: People },
      { path: "projects/:id", element: <Elsewhere what="a project" /> },
      { path: "events/:eventId", element: <Elsewhere what="an event" /> },
      // Your own page with an address, and its "Share your profile".
      { path: "profile/me", element: <ProfilePage profile={myPage as unknown as ProfileData} /> },
      { path: "profile/:profileId", element: <Elsewhere what="a profile" /> },
      { path: "orgs/:slug", element: <Elsewhere what="an organization" /> },
      { path: "messages/:conversationId", element: <Elsewhere what="a conversation" /> },
      { path: "settings", element: <Elsewhere what="your profile" /> },
      { path: "*", element: <Elsewhere what="somewhere else" /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
