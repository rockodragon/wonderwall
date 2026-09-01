import { LegalDocument, type LegalSection } from "../components/LegalDocument";
import { LEGAL_ENTITY } from "../legal/entity";

const { company, product, shortName, contactEmail, jurisdiction, legalName } =
  LEGAL_ENTITY;

export function meta() {
  const title = `Terms of Service - ${product}`;
  const description = `The agreement between you and ${company}, which owns and operates ${product}.`;
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
  `${product} — also called The Exchange — is an invitation-only community for creatives. It is owned and operated by ${company}. When these terms say "we," "us," or "our," they mean ${legalName}; "you" means the person holding the account.`,
  `By creating an account, or by using ${shortName} after these terms change, you agree to what follows. If you do not agree, do not create an account. Our Privacy Policy explains what we collect and why, and forms part of this agreement.`,
];

const SECTIONS: LegalSection[] = [
  {
    heading: "Membership is by invitation",
    paragraphs: [
      `${shortName} is not open registration. You join through an invite link from an existing member, and each link works a limited number of times before it stops. We may change how many invitations a member holds, reclaim unused ones, or pause invitations entirely.`,
      "You must be at least 18 years old to hold an account. One person, one account — accounts are personal to you and may not be sold, shared, or transferred. An account created for an organization must still name a real person responsible for it.",
    ],
  },
  {
    heading: "Your account",
    paragraphs: [
      "You can sign in with an email address and password, or with a Google account. Either way you are responsible for keeping access to your account secure and for everything done through it. Tell us promptly if you believe someone else has gotten in.",
      "Keep the information on your account accurate. Impersonating someone else, or building a profile around a person or organization you are not authorized to represent, is grounds for removal.",
    ],
  },
  {
    heading: "Plans, tickets, and payments",
    paragraphs: [
      "Some parts of The Exchange are free and some are paid. Paid membership renews on the interval shown when you subscribe and continues until you cancel; cancelling stops the next renewal and does not retroactively refund the period you are already in.",
      "Event organizers set their own ticket prices and tiers. Payments are handled by our payment processor, not by us — we do not receive or store your full card number. Where a payment is collected by an organizer through their own payment link, your purchase is with that organizer and their refund policy governs it.",
      "Prices may change. We will give notice before a change affects an existing paid membership, and the change takes effect at your next renewal.",
    ],
  },
  {
    heading: "Supporting creatives",
    paragraphs: [
      `${shortName} includes ways to back a project or support a member financially. Unless a particular page says otherwise in plain words, money moved this way is a payment or a gift, not a charitable donation: ${company} is not a tax-exempt organization, no tax receipt is issued, and you should not treat any amount as deductible.`,
      "Where a page routes you to a third party's own giving platform, that organization — not us — accepts the funds, decides how they are allocated, and issues any receipt.",
    ],
  },
  {
    heading: "What you post stays yours",
    paragraphs: [
      "You keep ownership of everything you upload — your profile, projects, works, images, video, audio, writing, prompts, and replies. We claim no ownership of it.",
      `To run the service, you give ${company} a non-exclusive, worldwide, royalty-free licence to host, store, reproduce, adapt for display, and show your content within ${shortName} and in reasonable promotion of it, for as long as you keep it posted. The licence exists so we can put your work on a page, resize an image, generate a preview card, and index it for search. It ends for new uses when you delete the content, allowing for backups and for copies others were permitted to keep.`,
      "You promise that you have the rights to what you post, and that posting it does not break anyone else's copyright, trademark, contract, or privacy.",
    ],
  },
  {
    heading: "How the community behaves",
    paragraphs: [
      "This is a small, trust-based community. The rules are short because the standard is simple: behave the way you would in a room full of colleagues.",
    ],
    bullets: [
      "No harassment, threats, hate speech, or targeting a person or group.",
      "No sexual content involving minors, and no sexual content presented to people who did not ask for it.",
      "No posting work that is not yours to post, and no removing anyone's credit.",
      "No spam, chain messages, bulk unsolicited pitches, or using invitations to farm signups.",
      "No scraping, crawling, or bulk-extracting member profiles, contact details, or content by any automated means.",
      "No probing, load-testing, or attempting to bypass access controls — including the gating on paid or private event material.",
      "No impersonation, and no misrepresenting your affiliation with a person, employer, or organization.",
      "Nothing illegal, and nothing that puts us in the position of hosting something illegal.",
    ],
  },
  {
    heading: "Events",
    paragraphs: [
      "Events are created and run by members, not by us. The organizer is responsible for the event itself — what it is, whether it happens, who gets in, what it costs, and what condition the venue is in. We host the listing and the tooling around it.",
      "Some event pages are visible to anyone with the link, including people without an account, so that an invitation can reach a guest. Join links and recordings for paid or restricted events are gated and are not part of that public page. Sharing a gated link with someone who has not been granted access is a breach of these terms.",
      "If an event is recorded, the organizer is responsible for telling attendees so. Attending an event you find here — online or in person — is your own decision and your own risk.",
    ],
  },
  {
    heading: "Messages between members",
    paragraphs: [
      "Direct messages are private between the participants in the ordinary course. They are not end-to-end encrypted, and we can access message content where we genuinely need to — to investigate a report, to keep someone safe, to fix a defect, or to meet a legal obligation. Do not use messages for anything you would not want read under those circumstances.",
    ],
  },
  {
    heading: "Listings and other people's content",
    paragraphs: [
      "The Exchange surfaces job listings, opportunities, offerings, and links that come from members or from public sources elsewhere. We do not verify them. We are not the employer, the client, or a party to whatever you arrange, and we do not vouch for any listing, member, organization, or outbound link.",
      "Check anything that matters before acting on it, particularly before sending money or personal documents to someone you met here.",
    ],
  },
  {
    heading: "Removal, suspension, and ending your account",
    paragraphs: [
      "You may delete your account at any time from your settings. Some material may remain visible where others hold a legitimate copy — a message already delivered, an RSVP on an organizer's list, or content quoted in a report we are required to keep.",
      "We may remove content, limit features, suspend an account, or end membership — with notice where we reasonably can, and immediately where we cannot — if someone breaks these terms, puts other members at risk, or exposes us to legal liability. Because membership here is by invitation, we may also remove an account when the trust the invitation rested on no longer holds.",
    ],
  },
  {
    heading: "The service is provided as it is",
    paragraphs: [
      `${shortName} is offered as it stands and as it is available. To the fullest extent the law allows, ${company} disclaims all warranties, express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not promise the service will be uninterrupted, that content will always be preserved, or that anything you find here will lead to work, funding, or a particular outcome.`,
      "Keep your own copy of anything you would be sorry to lose.",
    ],
  },
  {
    heading: "Limits on liability",
    paragraphs: [
      `To the fullest extent the law allows, ${company} is not liable for indirect, incidental, special, consequential, or punitive damages, nor for lost profits, lost opportunities, lost data, or loss of goodwill, arising from your use of ${shortName}.`,
      "Our total liability for any claim relating to the service is limited to the greater of the amount you paid us in the twelve months before the claim arose, or one hundred US dollars. Some jurisdictions do not allow these limits, in which case they apply only as far as that jurisdiction permits.",
    ],
  },
  {
    heading: "Indemnity",
    paragraphs: [
      `You agree to indemnify and hold harmless ${company}, its officers, employees, and contractors, from claims, damages, and reasonable legal costs arising from content you post, from your use of the service, or from your breach of these terms.`,
    ],
  },
  {
    heading: "Changes to these terms",
    paragraphs: [
      "We may update these terms. When a change is material we will give notice in the product or by email before it takes effect, and we will move the effective date at the top of this page. Continuing to use The Exchange after that date means you accept the revised terms.",
    ],
  },
  {
    heading: "Governing law and disputes",
    paragraphs: [
      `These terms are governed by the laws of ${jurisdiction}, without regard to conflict-of-laws rules, and the courts of ${jurisdiction} have exclusive jurisdiction over disputes arising from them.`,
      "Before filing anything, please write to us. Nearly everything is faster to fix by email than by process.",
    ],
  },
  {
    heading: "How to reach us",
    paragraphs: [
      `Questions about these terms go to ${contactEmail}. ${product} is owned and operated by ${company}; ${legalName} is the party you are contracting with under this agreement.`,
    ],
  },
];

export default function Terms() {
  return (
    <LegalDocument
      title="Terms of Service"
      effectiveDate={LEGAL_ENTITY.termsEffective}
      intro={INTRO}
      sections={SECTIONS}
    />
  );
}
