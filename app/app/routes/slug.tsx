// /:slug — the one top-level dynamic address (app/routes.ts). "/@handle" is
// a person's public page: the profile is the portfolio, and this is its
// door, open to a visitor with no account and to search engines. Anything
// else is a community's front door (community.landing.tsx), which renders
// the 404 for a slug that isn't one. React Router can't match a partial
// segment like "/@:handle", and two dynamic siblings would tie, so one route
// tells them apart.
//
// The person's page sits in the app shell (routes/_app.tsx), as /profile/:id
// does, so a member sees the shell they know and a visitor sees Sign in;
// _app.tsx lists /@… as public. The shell is a layout route, and this route
// can't be inside it for people and outside it for communities at once, so
// it renders the shell itself (AppShell, not the layout's default export:
// see _app.tsx) with the page as its child.
//
// The edge (functions/[handle].ts) serves /@handle with real link-preview
// tags and sends an old address on; this does the same in the app.

import { useQuery } from "convex/react";
import { Navigate, useParams } from "react-router";
import { api } from "../../convex/_generated/api";
import { cleanHandle, handleProblem, profilePath } from "../../convex/handleRules";
import NotFound from "./404";
import { AppShell } from "./_app";
import CommunityLanding from "./community.landing";
import { ProfilePage } from "./profile";

export function meta() {
  return [{ title: "TheCreative.exchange" }];
}

export default function TopLevelSlug() {
  const { slug = "" } = useParams();
  if (!slug.startsWith("@")) return <CommunityLanding />;
  return (
    <AppShell>
      <PublicProfile typed={slug.slice(1)} />
    </AppShell>
  );
}

/** A person's page by their address. */
function PublicProfile({ typed }: { typed: string }) {
  const handle = cleanHandle(typed);
  // An address that breaks the rules is nobody's: the 404, without asking.
  const impossible = !!handleProblem(handle);
  const profile = useQuery(api.profiles.getProfileByHandle, impossible ? "skip" : { handle });
  if (impossible || profile === null) return <NotFound />;
  // An old address (handles.ts forwards it for 90 days), or one typed with
  // capitals: on to the current, lowercase one.
  if (profile?.handle && profile.handle !== typed) return <Navigate to={profilePath(profile.handle)} replace />;
  return <ProfilePage profile={profile} />;
}
