import { LegalDocument, type LegalSection } from "../components/LegalDocument";
import { LEGAL_ENTITY } from "../legal/entity";

const {
  company,
  product,
  shortName,
  privacyEmail,
  mailingAddress,
  legalName,
} = LEGAL_ENTITY;

export function meta() {
  const title = `Privacy Policy - ${product}`;
  const description = `What ${company} collects when you use ${product}, why, and who else touches it.`;
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

const INTRO = [
  `${product} — The Exchange — is owned and operated by ${company}. ${legalName} decides what personal information the service collects and why, and is the party accountable for it.`,
  "This policy covers the website and the app behind it. It is written to be read, not to be survived, so it says what we actually hold rather than every category we could conceivably imagine.",
];

const SECTIONS: LegalSection[] = [
  {
    heading: "What you give us",
    paragraphs: [
      "Most of what we hold is what you typed in. Depending on how far you go into the product, that includes:",
    ],
    bullets: [
      "Account: your name, email address, and — if you did not sign in with Google — a password, which is stored hashed and is never visible to us in the clear.",
      "Profile: your bio, photo, interests, links, social handles, employer or organization, and the role you chose at signup (creative, patron, or partner).",
      "Location: the place you type into the location field, which we resolve through Google's places service. We keep the display string you see plus the structured result behind it — city, region, postal code, country, coordinates, and the place identifier — so that search and nearby-event matching work.",
      "Content: projects, works, images, video, audio, writing, prompts, and replies you post, together with anything you upload as a file.",
      "Events: events you create or RSVP to, ticket tiers you set, and the guest details attached to an RSVP. An RSVP does not require an account, so a guest may appear here having given only a name and an email.",
      "Messages: direct messages you send to other members, and their content.",
      "Invitations: who invited you, and who you have invited. This graph is intrinsic to an invite-only community — it is how membership is traced.",
      "Waitlist: if you asked to be told when a place opens, the email address you gave, before any account exists.",
      "Support and funding: pledges or contributions you make to a project or a member, and what they were for.",
    ],
  },
  {
    heading: "What we collect as you use it",
    paragraphs: [
      "We use PostHog to understand how the product is used — pages viewed, features touched, broad device and browser information, and an approximate location derived from your IP address. This is product analytics, not advertising: we do not sell it, and we do not run third-party ad or tracking pixels.",
      "We set cookies and use your browser's local storage for the things that make a session work — keeping you signed in, remembering a pending invitation, holding a draft. Blocking them will break signing in.",
      "Our servers keep ordinary technical logs, including IP addresses, for security and debugging.",
    ],
  },
  {
    heading: "What is public, what members see, and what stays closed",
    paragraphs: [
      "This is the part worth reading closely, because The Exchange is not uniformly private.",
    ],
    bullets: [
      "Public to anyone, no account needed: event pages. Event detail pages are deliberately reachable without signing in, so that an invitation can reach a guest who has no account. The title, description, date, venue and address, tags, images, and any ticket price on an event are visible to anyone holding the link, and they appear in link previews when shared.",
      "Gated, even on a public event page: the join link for an online event and any recording of it. These are stored apart from the event itself and released only to someone whose access has been checked.",
      "Visible to signed-in members: your profile, your projects and works, your interests and location, and your place in the invitation graph.",
      "Between participants: direct messages. They are not end-to-end encrypted — see the section on our access below.",
      "Not shown to other members: your email address, your password, your analytics, and your payment records.",
    ],
  },
  {
    heading: "What we use it for",
    bullets: [
      "Running the service — your account, your profile, your content, events, messages, and search.",
      "Matching and discovery: connecting members to each other, to projects, to events nearby, and to relevant opportunities.",
      "Email you would expect: sign-in and account mail, event and RSVP notices, message and activity digests, and occasional announcements about The Exchange.",
      "Safety and integrity: investigating reports, enforcing the Terms, and preventing abuse of invitations.",
      "Understanding and improving the product in aggregate.",
      "Meeting legal obligations and responding to lawful requests.",
    ],
  },
  {
    heading: "Search and AI features",
    paragraphs: [
      "To make search understand meaning rather than only keywords, we convert profile and content text into numeric embeddings using OpenAI's embedding API. That text is sent to OpenAI for the purpose of generating the embedding. We do not send your direct messages, your password, or your payment details.",
      "We also run an automated crawler that reads publicly available pages — such as organizations' own careers pages — to gather opportunity listings. That process collects information published openly by organizations, not private information about members.",
    ],
  },
  {
    heading: "Who else touches your information",
    paragraphs: [
      "We do not sell personal information, and we do not share it for cross-context behavioural advertising. We do rely on service providers who process it on our instructions in order to run the product:",
    ],
    bullets: [
      "Convex — the database, file storage, and authentication behind the app. Almost everything described above lives here.",
      "Cloudflare — hosting and content delivery for the site.",
      "Google — sign-in, if you use it, and the places service that resolves the locations you type.",
      "Radar — enriching event place data.",
      "PostHog — product analytics, processed in the United States.",
      "Resend — sending transactional and notification email.",
      "Stripe — processing payments. Stripe handles card details directly; we receive a record that a payment happened, not your card number.",
      "OpenAI — generating the search embeddings described above.",
    ],
  },
  {
    heading: "Other times we may disclose it",
    bullets: [
      "When you tell us to — for instance, by posting something, or by RSVPing to an event, which shows the organizer that you are coming.",
      "To comply with law, a court order, or a valid legal request.",
      "To protect the rights, safety, or property of members, the public, or us — including acting on a credible report of harm.",
      "In connection with a merger, acquisition, or sale of assets, in which case we will tell members before their information moves under a different privacy policy.",
    ],
  },
  {
    heading: "Our own access to your content",
    paragraphs: [
      "A small number of people at the company can reach member content, including direct messages, through administrative tooling. We use that access narrowly: to investigate a report, to keep someone safe, to diagnose a defect, or to meet a legal obligation. It is not used to read member conversations out of curiosity.",
    ],
  },
  {
    heading: "How long we keep it",
    paragraphs: [
      "We keep your account information while your account exists. Delete your account and we remove your profile and your content from the product, though some traces legitimately persist: a message you already sent sits in the recipient's thread, an RSVP remains on an organizer's guest list, and financial records are kept as long as tax and accounting rules require.",
      "Backups roll off on their own schedule, so a deleted item may sit in a backup for a period after it disappears from the product. Analytics and logs are kept in a form that is not tied to your profile once they are no longer needed.",
    ],
  },
  {
    heading: "Your choices and your rights",
    paragraphs: [
      "You can edit or remove most of what we hold directly: your profile, your content, and your account are all editable from your settings, and deleting your account is available there too. Notification email can be turned down without leaving; mail that is strictly about your account cannot, as long as you have one.",
      `Depending on where you live — including under the GDPR in the UK and EEA, and under the CCPA in California — you may have the right to access a copy of your information, correct it, delete it, restrict or object to how it is used, take it elsewhere in a portable form, and be free from discrimination for exercising any of that. Write to ${privacyEmail} and we will act on it. We will not charge you for asking, and we will not treat you differently for having asked.`,
      `If you are in the UK or EEA, our lawful bases are: performing our contract with you (running your account and the service), our legitimate interests (safety, abuse prevention, and improving the product), your consent where we ask for it, and compliance with law. You may also complain to your local supervisory authority.`,
    ],
  },
  {
    heading: "Where your information is held",
    paragraphs: [
      "The Exchange is operated from the United States, and our service providers process information there. If you use it from elsewhere, you are sending your information to the United States, where privacy law differs from your own.",
    ],
  },
  {
    heading: "Security",
    paragraphs: [
      "Traffic is encrypted in transit, passwords are stored hashed, administrative access is limited to people who need it, and secret material such as event join links is stored separately from the public record it belongs to. No service can promise perfect security, and we do not.",
    ],
  },
  {
    heading: "Children",
    paragraphs: [
      "The Exchange is for adults. It is not directed at children, and you must be 18 or older to hold an account. If we learn that we hold information about a child, we delete it.",
    ],
  },
  {
    heading: "Changes to this policy",
    paragraphs: [
      "We will update this page when our practices change, and move the effective date at the top. When a change is material we will tell members in the product or by email rather than relying on you to notice.",
    ],
  },
  {
    heading: "How to reach us",
    paragraphs: [
      `Privacy questions, and any request about your information, go to ${privacyEmail}. By post: ${legalName}, ${mailingAddress}.`,
      `${product} is owned and operated by ${company}.`,
    ],
  },
];

export default function Privacy() {
  return (
    <LegalDocument
      title="Privacy Policy"
      effectiveDate={LEGAL_ENTITY.privacyEffective}
      intro={INTRO}
      sections={SECTIONS}
    />
  );
}
