import { socialUrl, type SocialKind } from "../../convex/organizationRules";

// Website + Instagram / X / LinkedIn for an organization page. The website
// reads as its own host name (what Instagram does under a bio); the
// networks are round icon buttons. Stored values are already normalized
// (convex/organizationRules.ts), so this only builds links.

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const GLYPHS: Record<SocialKind, { label: string; icon: React.ReactNode }> = {
  instagram: {
    label: "Instagram",
    icon: (
      <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  x: {
    label: "X",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
      </svg>
    ),
  },
  linkedin: {
    label: "LinkedIn",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.85 1.637-1.75 3.37-1.75 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
};

export function SocialLinks({
  websiteUrl,
  instagram,
  x,
  linkedin,
}: {
  websiteUrl?: string | null;
  instagram?: string | null;
  x?: string | null;
  linkedin?: string | null;
}) {
  const networks = (
    [
      ["instagram", instagram],
      ["x", x],
      ["linkedin", linkedin],
    ] as const
  ).filter(([, value]) => !!value) as [SocialKind, string][];
  if (!websiteUrl && networks.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {websiteUrl && (
        <a
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-sm font-medium transition-colors hover:border-[var(--app-accent)]"
          style={{ borderColor: "var(--app-hairline)", color: "var(--app-text)" }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
          </svg>
          {hostOf(websiteUrl)}
        </a>
      )}
      {networks.map(([kind, value]) => (
        <a
          key={kind}
          href={socialUrl(kind, value)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={GLYPHS[kind].label}
          title={GLYPHS[kind].label}
          className="inline-flex items-center justify-center w-9 h-9 rounded-full border transition-colors hover:border-[var(--app-accent)]"
          style={{ borderColor: "var(--app-hairline)", color: "var(--app-text)" }}
        >
          {GLYPHS[kind].icon}
        </a>
      ))}
    </div>
  );
}
