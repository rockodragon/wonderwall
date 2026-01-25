import { useState } from "react";

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
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        Frequently Asked Questions
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">
        Everything you need to know about using Wonderwall
      </p>

      <div className="space-y-6">
        {FAQ_SECTIONS.map((section) => (
          <div
            key={section.title}
            className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden"
          >
            {/* Section header */}
            <button
              onClick={() =>
                setOpenSection(
                  openSection === section.title ? null : section.title,
                )
              }
              className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {section.title}
              </h2>
              <svg
                className={`w-5 h-5 text-gray-500 transition-transform ${
                  openSection === section.title ? "rotate-180" : ""
                }`}
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
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {section.questions.map((qa) => (
                  <div key={qa.q}>
                    <button
                      onClick={() =>
                        setOpenQuestion(openQuestion === qa.q ? null : qa.q)
                      }
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <span className="font-medium text-gray-900 dark:text-white pr-4">
                        {qa.q}
                      </span>
                      <svg
                        className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${
                          openQuestion === qa.q ? "rotate-180" : ""
                        }`}
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
                      <div className="px-4 pb-4 text-gray-600 dark:text-gray-400">
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
      <div className="mt-12 p-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Still have questions?
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          We're here to help. Reach out to us anytime.
        </p>
        <a
          href="mailto:hello@wonderwall.app"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
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
          Contact Us
        </a>
      </div>
    </div>
  );
}
