import { LegalDocument, type LegalSection } from "../components/LegalDocument";
import { LEGAL_ENTITY } from "../legal/entity";

const { company, product, shortName, privacyEmail } = LEGAL_ENTITY;

export function meta() {
  const title = `Privacy Policy - ${product}`;
  const description = `How ${company} collects, uses, and safeguards your information on ${product}.`;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
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
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
}

const SECTIONS: LegalSection[] = [
  {
    heading: "Introduction",
    paragraphs: [
      `${company} ("we," "our," or "us") operates the ${product} platform — also called The Exchange. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the platform and related services (collectively, the "Service").`,
      "By using the Service you consent to the practices described here. If you do not agree with them, please do not use the Service.",
      "This policy is written to be read, not to be survived, so it says what we actually hold rather than every category we could conceivably imagine.",
    ],
  },
  {
    heading: "Information we collect",
    paragraphs: ["What you provide:"],
    bullets: [
      "Account information: your name, email address, and — unless you sign in with Google — a password, which is stored hashed and is never visible to us in the clear.",
      "Profile information: bio, photo, interests, links, social handles, employer or organization, and the role you chose at signup (creative, patron, or partner).",
      "Location: the place you type into the location field, which we resolve through Google's places service. We keep the display string you see plus the structured result behind it — city, region, postal code, country, coordinates, and the place identifier — so that search and nearby-event matching work.",
      "Content: projects, works, images, video, audio, writing, prompts, and replies you post, together with any file you upload.",
      "Events: events you create or RSVP to, ticket tiers you set, and the guest details attached to an RSVP. An RSVP does not require an account, so a guest may appear here having given only a name and an email.",
      "Messages: direct messages you send to other members, and their content.",
      "Invitations: who invited you, and who you have invited. This graph is intrinsic to an invite-only community — it is how membership is traced.",
      "Waitlist: if you asked to be told when a place opens, the email address you gave, before any account exists.",
      "Support and funding: pledges or contributions you make to a project or a member, and what they were for.",
      "Payment information: billing details are handled by our payment processor. We receive a record that a payment happened, not your card number.",
      "Communications: what you tell us when you contact us for support.",
    ],
    trailing: ["Collected automatically:"],
    trailingBullets: [
      "Usage data: pages visited, features used, and actions taken, through our analytics provider.",
      "Device information: IP address, browser type, operating system, and an approximate location derived from your IP address.",
      "Cookies and similar technologies: session cookies and browser local storage (see the cookies section below).",
      "Server logs: ordinary technical logs, including IP addresses, kept for security and debugging.",
    ],
  },
  {
    heading: "What is public, what members see, and what stays closed",
    paragraphs: [
      `This is the part worth reading closely, because ${shortName} is not uniformly private.`,
    ],
    bullets: [
      "Public to anyone, no account needed: event pages. Event detail pages are deliberately reachable without signing in, so that an invitation can reach a guest who has no account. The title, description, date, venue and address, tags, images, and any ticket price on an event are visible to anyone holding the link, and they appear in link previews when shared.",
      "Gated, even on a public event page: the join link for an online event and any recording of it. These are stored apart from the event itself and released only to someone whose access has been checked.",
      "Visible to signed-in members: your profile, your projects and works, your interests and location, and your place in the invitation graph.",
      "Between participants: direct messages. They are not end-to-end encrypted — see our access, below.",
      "Not shown to other members: your email address, your password, your analytics, and your payment records.",
    ],
  },
  {
    heading: "How we use your information",
    paragraphs: ["We use the information we collect to:"],
    bullets: [
      "Provide, maintain, and improve the Service",
      "Run your account, your profile, your content, events, messages, and search",
      "Connect members to each other, to projects, to events nearby, and to relevant opportunities",
      "Process payments and manage memberships",
      "Send transactional email and service notifications, including event and RSVP notices and activity digests",
      "Respond to your requests and provide support",
      "Investigate reports, enforce the Terms, and protect against fraud, abuse, and security threats",
      "Analyze usage patterns in aggregate to improve the experience",
      "Comply with legal obligations",
    ],
    trailing: [
      "Important: we do NOT use your content, your work, or your messages to train artificial intelligence or machine learning models. Your content remains yours and is processed only to provide the Service to you.",
    ],
  },
  {
    heading: "Search and AI features",
    paragraphs: [
      "To make search understand meaning rather than only keywords, we convert profile and content text into numeric embeddings using OpenAI's embedding API. That text is sent to OpenAI solely to generate the embedding. This is a paid API service whose terms prohibit training on customer API data. We do not send your direct messages, your password, or your payment details.",
      "We also run an automated crawler that reads publicly available pages — such as organizations' own careers pages — to gather opportunity listings. That process collects information organizations publish openly, not private information about members.",
    ],
  },
  {
    heading: "How we share your information",
    paragraphs: [
      "We do not sell your personal information, and we do not share it for cross-context behavioural advertising. We may share it in these circumstances:",
    ],
    bullets: [
      "Service providers: trusted vendors who help operate the Service, listed in the next section.",
      "When you tell us to: by posting something, or by RSVPing to an event, which shows the organizer that you are coming.",
      "Business transfers: in connection with a merger, acquisition, or sale of assets, with appropriate confidentiality protections. We will tell members before their information moves under a different privacy policy.",
      "Legal requirements: when required by law, legal process, or a valid government request.",
      "Protection of rights: to protect the rights, property, or safety of members, the public, or us — including acting on a credible report of harm.",
      "With your consent: for any other purpose you explicitly agree to.",
    ],
  },
  {
    heading: "Service providers",
    paragraphs: [
      "These providers process personal information on our instructions in order to run the Service:",
    ],
    bullets: [
      "Convex — the database, file storage, and authentication behind the app. Almost everything described above lives here.",
      "Cloudflare — hosting and content delivery.",
      "Google — sign-in, if you use it, and the places service that resolves the locations you type.",
      "Radar — enriching event place data.",
      "PostHog — product analytics, processed in the United States.",
      "Resend — sending transactional and notification email.",
      "Stripe — processing payments. Stripe handles card details directly.",
      "OpenAI — generating the search embeddings described above.",
    ],
  },
  {
    heading: "Our own access to your content",
    paragraphs: [
      "A small number of people at the company can reach member content, including direct messages, through administrative tooling. We use that access narrowly: to investigate a report, to keep someone safe, to diagnose a defect, or to meet a legal obligation. It is not used to read member conversations out of curiosity.",
    ],
  },
  {
    heading: "Data retention",
    paragraphs: [
      "We keep your information for as long as your account is active or as needed to provide the Service.",
    ],
    bullets: [
      "Account and profile information: kept while your account is active, and for a reasonable period after closure for legal and business purposes.",
      "Content you post: kept until you delete it or close your account.",
      "Deleted content: removed from the Service on deletion. Backups roll off on their own schedule, so a deleted item may persist in a backup for a period afterwards.",
      "Usage data and logs: kept in a form no longer tied to your profile once they are no longer needed.",
      "Financial records: kept as long as tax and accounting rules require.",
    ],
    trailing: [
      "On account termination you may request an export of your data within 30 days. Some material legitimately persists where others hold a copy — a message already delivered, or an RSVP on an organizer's guest list.",
    ],
  },
  {
    heading: "Your rights and choices",
    paragraphs: [
      "You can edit or remove most of what we hold directly: your profile, your content, and your account are all editable from your settings, and deleting your account is available there too. Notification email can be turned down without leaving; mail strictly about your account cannot, as long as you have one.",
      "Depending on your location you may have the following rights:",
    ],
    bullets: [
      "Access: request a copy of the personal information we hold about you.",
      "Correction: request correction of inaccurate or incomplete information.",
      "Deletion: request deletion of your personal information, subject to legal retention requirements.",
      "Portability: request a machine-readable copy of your data.",
      "Objection: object to certain processing of your information.",
      "Restriction: request restriction of processing in certain circumstances.",
      "Withdraw consent: where processing is based on consent.",
    ],
    trailing: [
      `To exercise these rights, contact us at ${privacyEmail}. We will respond within 30 days. We will not charge you for asking, and we will not treat you differently for having asked.`,
    ],
  },
  {
    heading: "California privacy rights (CCPA/CPRA)",
    paragraphs: [
      "California residents have additional rights under the California Consumer Privacy Act and the California Privacy Rights Act:",
    ],
    bullets: [
      "Right to know what personal information is collected and how it is used",
      "Right to delete personal information, with certain exceptions",
      "Right to opt out of the sale or sharing of personal information",
      "Right to correct inaccurate personal information",
      "Right to limit the use of sensitive personal information",
      "Right to non-discrimination for exercising privacy rights",
    ],
    trailing: [
      "We do not sell personal information as defined under the CCPA/CPRA.",
    ],
  },
  {
    heading: "European privacy rights (GDPR)",
    paragraphs: [
      "If you are in the European Economic Area, the United Kingdom, or Switzerland, you have additional rights under the GDPR:",
    ],
    bullets: [
      "Legal basis: we process your data on the basis of performing our contract with you, our legitimate interests in safety and abuse prevention, your consent where we ask for it, and compliance with law.",
      "Data protection authority: you have the right to lodge a complaint with your local supervisory authority.",
      `Contact: privacy enquiries go to ${privacyEmail}.`,
    ],
  },
  {
    heading: "Cookies and similar technologies",
    paragraphs: ["We use:"],
    bullets: [
      "Essential cookies: required for the Service to function — authentication and security. Blocking them will break signing in.",
      "Analytics cookies: help us understand how the Service is used so we can improve it.",
      "Preference storage: your browser's local storage, remembering things like a pending invitation or an unsent draft.",
    ],
    trailing: [
      "You can control cookies through your browser settings. Disabling some will affect how the Service works. We do not run third-party advertising or tracking pixels.",
    ],
  },
  {
    heading: "Data security",
    paragraphs: [
      "Traffic is encrypted in transit, passwords are stored hashed, administrative access is limited to people who need it, and secret material such as event join links is stored separately from the public record it belongs to.",
      "While we work to protect your information, no method of transmission over the Internet is completely secure, and we cannot guarantee absolute security.",
    ],
  },
  {
    heading: "International data transfers",
    paragraphs: [
      "The Service is operated from the United States, and our service providers process information there. If you use it from elsewhere, your information is transferred to the United States, where privacy law differs from your own. Where required, we rely on appropriate safeguards for those transfers, including Standard Contractual Clauses and data processing terms with our providers.",
    ],
  },
  {
    heading: "Children's privacy",
    paragraphs: [
      "The Service is intended for users 18 years of age and older. We do not knowingly collect personal information from anyone under 18. If we learn that we have, we delete it promptly. If you believe we hold such information, contact us at " +
        privacyEmail +
        ".",
    ],
  },
  {
    heading: "Changes to this policy",
    paragraphs: [
      'We may update this Privacy Policy from time to time. We will notify you of material changes by posting the new policy here and updating the "Last updated" date. For significant changes we will give additional notice by email or in the Service. Continuing to use the Service after the changes take effect means you accept them.',
    ],
  },
  {
    heading: "Contact us",
    paragraphs: [
      `Questions about this Privacy Policy or our data practices go to ${privacyEmail}. For data subject requests, please use the same address with the subject line "Data Subject Request."`,
      `${company} — ${product} is owned and operated by ${company}.`,
    ],
  },
];

export default function Privacy() {
  return (
    <LegalDocument
      title="Privacy Policy"
      lastUpdated={LEGAL_ENTITY.privacyUpdated}
      effectiveDate={LEGAL_ENTITY.privacyEffective}
      sections={SECTIONS}
    />
  );
}
