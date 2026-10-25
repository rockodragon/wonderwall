// "Share your profile", on your own profile (routes/profile.tsx). Opens the
// share kit (ProfileShareKit), which is fetched on the first press: it
// carries the QR code library, which the page itself never needs.

import { QrCode } from "@phosphor-icons/react";
import { lazy, Suspense, useState, type ComponentProps } from "react";
import type { ProfileShareKit as Kit, ShareKitProfile } from "./ProfileShareKit";
import type { ProjectRow } from "../lib/profileShare";

const ProfileShareKit = lazy(() =>
  import("./ProfileShareKit")
    .then((m) => ({ default: m.ProfileShareKit }))
    // A page left open across a deploy asks for a file that's gone.
    .catch(() => ({ default: ShareKitUnavailable })),
);

export function ShareProfileButton({
  profile,
  projects,
}: {
  profile: ShareKitProfile;
  projects: readonly ProjectRow[] | undefined;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--app-accent)]"
        style={{
          backgroundColor: "var(--app-surface-raised)",
          color: "var(--app-text)",
          borderColor: "var(--app-hairline)",
        }}
      >
        <QrCode size={16} aria-hidden />
        Share your profile
      </button>
      {open && (
        <Suspense fallback={null}>
          <ProfileShareKit profile={profile} projects={projects} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

function ShareKitUnavailable({ onClose }: ComponentProps<typeof Kit>) {
  return (
    <p role="alert" className="text-[13.5px] text-red-600 dark:text-red-400">
      This page is out of date. Reload it to share your profile.{" "}
      <button type="button" onClick={onClose} className="underline">
        Close
      </button>
    </p>
  );
}
