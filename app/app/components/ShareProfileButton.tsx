// "Share your profile", on your own profile (routes/profile.tsx). Opens the
// share kit (ProfileShareKit), which is fetched on the first press: it
// carries the QR code library, which the page itself never needs.

import { QrCode } from "@phosphor-icons/react";
import { lazy, Suspense, useState, type ComponentProps } from "react";
import type { ProfileShareKit as Kit, ShareKitProfile } from "./ProfileShareKit";
import type { ProjectRow } from "../lib/profileShare";
import { OwnPageFace } from "./OwnPageFace";
import { OWN_PAGE_BUTTON_STYLE, OWN_PAGE_LABELS, OWN_PAGE_LOOK, type OwnPageLook } from "./ownPageButton";

const ProfileShareKit = lazy(() =>
  import("./ProfileShareKit")
    .then((m) => ({ default: m.ProfileShareKit }))
    // A page left open across a deploy asks for a file that's gone.
    .catch(() => ({ default: ShareKitUnavailable })),
);

export function ShareProfileButton({
  profile,
  projects,
  onOpen,
  look = "pill",
}: {
  profile: ShareKitProfile;
  projects: readonly ProjectRow[] | undefined;
  /** The panel opened: the one-time hint has done its job (ShareHint). */
  onOpen?: () => void;
  /** The profile page's pill, or Settings' tile (ownPageButton.ts). */
  look?: OwnPageLook;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          onOpen?.();
        }}
        aria-haspopup="dialog"
        className={OWN_PAGE_LOOK[look]}
        style={OWN_PAGE_BUTTON_STYLE}
      >
        <OwnPageFace look={look} icon={QrCode} label={OWN_PAGE_LABELS.share} />
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
