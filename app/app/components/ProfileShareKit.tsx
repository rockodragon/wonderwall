// "Share your profile" on your own profile (routes/profile.tsx, through
// ShareProfileButton): everything that points people at thecreative.exchange/
// @handle. Your link with where-from tags, a QR code for print, an Instagram
// story picture, and a badge and a card for your own website.
//
// Loaded only when the panel opens (ShareProfileButton), and the QR code
// library with it (lib/qrCode.ts). A native <dialog>: it takes focus, Escape
// closes it, and focus goes back to the button. A sheet from the bottom on a
// phone, a panel in the middle on a larger window.
//
// Each action is one PostHog event, `profile_share`, with its kind and ref
// (lib/profileShare.ts).

import { usePostHog } from "@posthog/react";
import { X } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { SITE_ORIGIN } from "../lib/eventCalendar";
import { downloadBlob } from "../lib/downloadBlob";
import {
  BADGE_ALT,
  BADGE_SIZE,
  EMBED_FRAME,
  badgePath,
  badgeSnippet,
  displayLink,
  embedPath,
  embedSnippet,
  profileLink,
  recentWorks,
  shownImageUrl,
  type BadgeTone,
  type PieceRow,
  type ProjectRow,
  type ShareKind,
  type ShareRef,
} from "../lib/profileShare";
import { qrMatrix, qrPng, qrSvg } from "../lib/qrCode";
import { drawStory } from "../lib/storyImage";
import { useCopyText } from "../lib/useCopyText";

/** What the kit reads of the profile page's data (profiles.publicProfilePage). */
export interface ShareKitProfile {
  name: string;
  handle?: string | null;
  imageUrl?: string | null;
  artifacts?: readonly PieceRow[];
}

const BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors hover:border-[var(--app-accent)] disabled:opacity-50 disabled:hover:border-[var(--app-hairline)]";
const BUTTON_STYLE = {
  backgroundColor: "var(--app-surface-raised)",
  color: "var(--app-text)",
  borderColor: "var(--app-hairline)",
} as const;

export function ProfileShareKit({
  profile,
  projects,
  onClose,
}: {
  profile: ShareKitProfile;
  /** garden/projectTeam:listAffiliations, as the profile page loads it;
   *  undefined while it loads. */
  projects: readonly ProjectRow[] | undefined;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      // A press on the dimmed page around the panel lands on the dialog itself.
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="m-0 mt-auto w-full max-w-full max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-2xl border p-0 backdrop:bg-black/70 sm:m-auto sm:w-[36rem] sm:max-w-[calc(100vw-2rem)] sm:max-h-[90vh] sm:rounded-2xl"
      style={{ backgroundColor: "var(--app-surface)", color: "var(--app-text)", borderColor: "var(--app-hairline-raised)" }}
    >
      <div
        className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-5 py-4"
        style={{ backgroundColor: "var(--app-surface)", borderColor: "var(--app-hairline)" }}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Share your profile
        </h2>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-[var(--app-hairline)]"
          style={{ color: "var(--app-text-dim)" }}
        >
          <X size={20} aria-hidden />
        </button>
      </div>
      {profile.handle ? (
        <ShareKitBody profile={profile} handle={profile.handle} projects={projects} />
      ) : (
        <p className="px-5 py-6 text-sm" style={{ color: "var(--app-text-muted)" }}>
          Sharing needs an address of your own, thecreative.exchange/@you.{" "}
          <Link to="/settings#address" className="font-medium hover:underline" style={{ color: "var(--app-accent-ink)" }}>
            Choose one in Settings
          </Link>
          .
        </p>
      )}
    </dialog>
  );
}

type Story = { state: "drawing" } | { state: "ready"; blob: Blob; url: string } | { state: "failed" };

function ShareKitBody({
  profile,
  handle,
  projects,
}: {
  profile: ShareKitProfile;
  handle: string;
  projects: readonly ProjectRow[] | undefined;
}) {
  const posthog = usePostHog();
  const { copied, copy } = useCopyText();
  const [tone, setTone] = useState<BadgeTone>("dark");
  const [story, setStory] = useState<Story>({ state: "drawing" });
  const [problem, setProblem] = useState<string | null>(null);

  const link = profileLink(handle);
  const qr = useMemo(() => qrMatrix(profileLink(handle, "qr")), [handle]);
  const qrPreview = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(qr))}`, [qr]);
  const file = `${handle}-thecreative-exchange`;

  function track(kind: ShareKind, ref: ShareRef | null, extra: Record<string, string> = {}) {
    posthog?.capture("profile_share", { kind, ref, ...extra });
  }

  async function copyLink(ref: ShareRef | null) {
    const ok = await copy(profileLink(handle, ref ?? undefined), `link:${ref ?? ""}`);
    if (ok) track("copy_link", ref);
    setProblem(ok ? null : "Your browser didn't let us copy. Select the text and copy it yourself.");
  }

  async function copySnippet(kind: "badge" | "embed", code: string) {
    const ok = await copy(code, kind);
    if (ok) track(kind, kind, kind === "badge" ? { tone } : {});
    setProblem(ok ? null : "Your browser didn't let us copy. Select the code and copy it yourself.");
  }

  async function downloadQrPng() {
    try {
      downloadBlob(await qrPng(qr), `${file}-qr.png`);
      track("qr_png", "qr");
    } catch {
      setProblem("Couldn't draw the QR code. Try the SVG.");
    }
  }

  function downloadQrSvg() {
    downloadBlob(new Blob([qrSvg(qr)], { type: "image/svg+xml" }), `${file}-qr.svg`);
    track("qr_svg", "qr");
  }

  function downloadStory() {
    if (story.state !== "ready") return;
    downloadBlob(story.blob, `${file}-story.png`);
    track("story", "story");
  }

  // The story picture is drawn once the works have loaded, and again if they
  // change. Its code carries ?ref=story, so a scan of it counts as the story.
  const photoUrl = shownImageUrl(profile.imageUrl);
  const works = projects === undefined ? null : recentWorks(projects, profile.artifacts, 3);
  const worksKey = works?.map((w) => w.imageUrl).join(" ") ?? null;
  useEffect(() => {
    if (worksKey === null) return;
    let cancelled = false;
    let url: string | null = null;
    setStory({ state: "drawing" });
    drawStory({
      name: profile.name,
      handle,
      photoUrl,
      works: works ?? [],
      qr: qrMatrix(profileLink(handle, "story")),
      address: displayLink(link),
    })
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setStory({ state: "ready", blob, url });
      })
      .catch(() => {
        if (!cancelled) setStory({ state: "failed" });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // `works` is read through worksKey, which changes when it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worksKey, handle, profile.name, photoUrl, link]);

  const badgeCode = badgeSnippet(handle, tone);
  const embedCode = embedSnippet(handle, profile.name);

  return (
    <div className="space-y-7 px-5 pb-8 pt-5">
      {problem && (
        <p role="alert" className="text-[13.5px] text-red-600 dark:text-red-400">
          {problem}
        </p>
      )}

      <Section title="Your link">
        <p className="break-all text-base font-medium">{displayLink(link)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              [null, "Copy link"],
              ["ig", "For Instagram bio"],
              ["linktree", "For Linktree"],
              ["site", "For your website"],
            ] as const
          ).map(([ref, label]) => (
            <button key={label} type="button" onClick={() => copyLink(ref)} className={BUTTON} style={BUTTON_STYLE}>
              {copied === `link:${ref ?? ""}` ? "Copied" : label}
            </button>
          ))}
        </div>
        <Note>The tagged links end in ?ref=ig and the like, so we can see where visits come from.</Note>
      </Section>

      <Section title="QR code">
        <div className="flex flex-wrap items-start gap-4">
          <img
            src={qrPreview}
            alt={`QR code for ${displayLink(link)}`}
            width={128}
            height={128}
            className="h-32 w-32 shrink-0 rounded-lg"
          />
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>
              Opens your profile. Print it for your table, a flyer or a card.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={downloadQrPng} className={BUTTON} style={BUTTON_STYLE}>
                Download PNG
              </button>
              <button type="button" onClick={downloadQrSvg} className={BUTTON} style={BUTTON_STYLE}>
                Download SVG
              </button>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Instagram story">
        <div className="flex flex-wrap items-start gap-4">
          <div
            className="h-[160px] w-[90px] shrink-0 overflow-hidden rounded-lg border"
            style={{ borderColor: "var(--app-hairline)", backgroundColor: "var(--app-hairline)" }}
          >
            {story.state === "ready" && (
              <img src={story.url} alt="Your story picture" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>
              Your photo, recent work and a QR code, 1080 × 1920. Post it as a story and add a link sticker
              with your address.
            </p>
            <div className="mt-3">
              <button
                type="button"
                onClick={downloadStory}
                disabled={story.state !== "ready"}
                className={BUTTON}
                style={BUTTON_STYLE}
              >
                {story.state === "drawing" ? "Drawing…" : "Download picture"}
              </button>
            </div>
            {story.state === "failed" && <Note>Couldn't draw the picture here. Try another browser.</Note>}
          </div>
        </div>
      </Section>

      <Section title="For your website">
        <h4 className="text-sm font-semibold">Badge</h4>
        <div role="group" aria-label="Badge color" className="mt-2 flex flex-wrap gap-2">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tone === t}
              onClick={() => setTone(t)}
              className="rounded-full border px-3 py-1 text-[13.5px] font-medium transition-colors"
              style={
                tone === t
                  ? { backgroundColor: "var(--app-accent-wash)", color: "var(--app-accent-ink)", borderColor: "var(--app-accent)" }
                  : { color: "var(--app-text-muted)", borderColor: "var(--app-hairline)" }
              }
            >
              {t === "dark" ? "Dark, for a light page" : "Light, for a dark page"}
            </button>
          ))}
        </div>
        <div
          className="mt-3 flex items-center justify-center rounded-xl p-6"
          style={{ backgroundColor: tone === "dark" ? "#f7f7f4" : "#121212" }}
        >
          <a href={profileLink(handle, "badge")} target="_blank" rel="noopener">
            <img src={badgePath(tone)} alt={BADGE_ALT} width={BADGE_SIZE.width} height={BADGE_SIZE.height} />
          </a>
        </div>
        <Snippet
          label="Badge code"
          code={badgeCode}
          copied={copied === "badge"}
          onCopy={() => copySnippet("badge", badgeCode)}
        />

        <h4 className="mt-6 text-sm font-semibold">Card</h4>
        <p className="mt-1 text-sm" style={{ color: "var(--app-text-muted)" }}>
          Your photo, name and recent work, with a link to your portfolio.
        </p>
        <div className="mt-3 flex justify-center">
          <iframe
            src={`${SITE_ORIGIN}${embedPath(handle)}`}
            width={EMBED_FRAME.width}
            height={EMBED_FRAME.height}
            loading="lazy"
            title={`${profile.name} on TheCreative.exchange`}
            className="max-w-full rounded-xl"
            style={{ border: 0 }}
          />
        </div>
        <Snippet
          label="Card code"
          code={embedCode}
          copied={copied === "embed"}
          onCopy={() => copySnippet("embed", embedCode)}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--app-text-dim)" }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 text-xs" style={{ color: "var(--app-text-dim)" }}>
      {children}
    </p>
  );
}

/** Code to paste, selected on focus, with its copy button. */
function Snippet({ label, code, copied, onCopy }: { label: string; code: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="mt-3">
      <textarea
        readOnly
        value={code}
        aria-label={label}
        rows={3}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full resize-none rounded-xl border p-3 font-mono text-xs"
        style={{ backgroundColor: "var(--app-surface-raised)", color: "var(--app-text)", borderColor: "var(--app-hairline)" }}
      />
      <button type="button" onClick={onCopy} className={`mt-2 ${BUTTON}`} style={BUTTON_STYLE}>
        {copied ? "Copied" : "Copy code"}
      </button>
    </div>
  );
}
