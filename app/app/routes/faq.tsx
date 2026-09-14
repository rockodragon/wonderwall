import { useState } from "react";

export function meta() {
  return [
    { title: "FAQ - creatives.exchange" },
    {
      name: "description",
      content:
        "Frequently asked questions about The Exchange - invites, profiles, events, and account management.",
    },
    { property: "og:title", content: "FAQ - creatives.exchange" },
    {
      property: "og:description",
      content:
        "Frequently asked questions about The Exchange - invites, profiles, events, and account management.",
    },
    { property: "og:type", content: "website" },
    {
      property: "og:image",
      content: "https://creatives.exchange/og-image.png",
    },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    {
      name: "twitter:image",
      content: "https://creatives.exchange/og-image.png",
    },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: "FAQ - creatives.exchange" },
    {
      name: "twitter:description",
      content:
        "Frequently asked questions about The Exchange - invites, profiles, events, and account management.",
    },
  ];
}

const FAQ_SECTIONS = [
  {
    title: "Invites",
    questions: [
      {
        q: "How do invites work?",
        a: "Each invite code can only be used once. When someone signs up using your invite code, it gets marked as used and cannot be reused. This helps maintain a trusted community of creatives.",
      },
      {
        q: "How many invites can I create?",
        a: "You can create up to 3 invite codes at a time. Once an invite is used by someone, you can create a new one to share with others.",
      },
      {
        q: "Can I see who used my invite?",
        a: "Yes! On your profile page, you can see how many people you've invited and who they've invited (your downstream network).",
      },
    ],
  },
  {
    title: "Profiles",
    questions: [
      {
        q: "How do I add a profile photo?",
        a: "Go to Settings and click 'Upload Photo' to upload an image from your device. We support JPG, PNG, and GIF formats up to 5MB.",
      },
      {
        q: "What are job functions?",
        a: "Job functions describe what you do creatively - Designer, Writer, Musician, Filmmaker, Developer, etc. You can select multiple to show the full range of your creative work.",
      },
      {
        q: "What are Wonderings?",
        a: "Wonderings are thoughtful questions you're pondering that others can respond to. They help spark meaningful conversations and connections with fellow creatives.",
      },
      {
        q: "How long do Wonderings last?",
        a: "Free accounts have Wonderings that expire after 2 weeks. You can archive your wondering early and create a new one anytime.",
      },
    ],
  },
  {
    title: "Events",
    questions: [
      {
        q: "Who can create events?",
        a: "Any member can create events for the community. Events are a great way to bring creatives together for workshops, meetups, or collaborative projects.",
      },
      {
        q: "What does 'Apply to Join' mean?",
        a: "Event organizers can require approval before someone can attend. This helps manage capacity and ensure the right fit for the event.",
      },
      {
        q: "How do I RSVP to an event?",
        a: "Click the 'Join' or 'Apply' button on the event page. For open events, you're immediately added. For approval-required events, the organizer will review your application.",
      },
    ],
  },
  {
    title: "Account",
    questions: [
      {
        q: "How do I reset my password?",
        a: "You can reset your password from the login page by clicking 'Forgot password'. We'll send a reset link to your email.",
      },
      {
        q: "Can I change my email?",
        a: "Email changes are not currently supported. Contact us if you need to update your email address.",
      },
      {
        q: "How do I delete my account?",
        a: "Please contact us to request account deletion. We'll process your request and remove your data.",
      },
    ],
  },
];

export default function FAQ() {
  const [openSection, setOpenSection] = useState<string | null>(
    FAQ_SECTIONS[0].title,
  );
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--app-text)" }}>
        Frequently Asked Questions
      </h1>
      <p className="mb-8" style={{ color: "var(--app-text-dim)" }}>
        Everything you need to know about using The Exchange
      </p>

      <div className="space-y-6">
        {FAQ_SECTIONS.map((section) => (
          <div
            key={section.title}
            className="border rounded-xl overflow-hidden"
            style={{ borderColor: "var(--app-hairline)" }}
          >
            {/* Section header */}
            <button
              onClick={() =>
                setOpenSection(
                  openSection === section.title ? null : section.title,
                )
              }
              className="w-full flex items-center justify-between p-4 transition-colors hover:bg-[var(--app-hairline-raised)]"
              style={{ backgroundColor: "var(--app-surface-raised)" }}
            >
              <h2 className="text-lg font-semibold" style={{ color: "var(--app-text)" }}>
                {section.title}
              </h2>
              <svg
                className={`w-5 h-5 transition-transform ${
                  openSection === section.title ? "rotate-180" : ""
                }`}
                style={{ color: "var(--app-text-dim)" }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* Questions */}
            {openSection === section.title && (
              <div className="divide-y divide-[var(--app-hairline)]">
                {section.questions.map((qa) => (
                  <div key={qa.q}>
                    <button
                      onClick={() =>
                        setOpenQuestion(openQuestion === qa.q ? null : qa.q)
                      }
                      className="w-full flex items-center justify-between p-4 text-left transition-colors hover:bg-[var(--app-hairline-raised)]"
                    >
                      <span className="font-medium pr-4" style={{ color: "var(--app-text)" }}>
                        {qa.q}
                      </span>
                      <svg
                        className={`w-4 h-4 shrink-0 transition-transform ${
                          openQuestion === qa.q ? "rotate-180" : ""
                        }`}
                        style={{ color: "var(--app-text-dim)" }}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                    {openQuestion === qa.q && (
                      <div className="px-4 pb-4" style={{ color: "var(--app-text-dim)" }}>
                        {qa.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Contact section */}
      <div
        className="mt-12 p-6 rounded-2xl text-center"
        style={{ backgroundColor: "var(--app-accent-wash)" }}
      >
        <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--app-text)" }}>
          Still have questions?
        </h3>
        <p className="mb-4" style={{ color: "var(--app-text-dim)" }}>
          We're here to help. Reach out to us anytime.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
        <a
          href="mailto:hello@creatives.exchange"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
          style={{ backgroundColor: "var(--app-accent)", color: "var(--garden-ink)" }}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          Email us
        </a>
        <a
          href="https://cal.com/rickmoy"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-[var(--app-hairline-raised)]"
          style={{ borderColor: "var(--app-hairline-raised)", color: "var(--app-text-muted)" }}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          Book a time
        </a>
        </div>
      </div>
    </div>
  );
}
