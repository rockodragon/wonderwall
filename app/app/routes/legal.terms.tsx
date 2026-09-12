import { LegalDocument, type LegalSection } from "../components/LegalDocument";
import { LEGAL_ENTITY } from "../legal/entity";

const { company, product, shortName, contactEmail, jurisdiction, courts } =
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

const SECTIONS: LegalSection[] = [
  {
    heading: "Agreement to Terms",
    paragraphs: [
      `These Terms of Service ("Terms") are a legally binding agreement between you ("you" or "Member") and ${company} ("we," "us," or "Company") governing your access to and use of ${product} — also called The Exchange — including the website, the application, and related services (collectively, the "Service").`,
      "By creating an account, or by continuing to use the Service after these Terms change, you agree to be bound by these Terms and our Privacy Policy. If you do not agree, do not create an account and do not use the Service.",
      `${product} is owned and operated by ${company}.`,
    ],
  },
  {
    heading: "Description of the Service",
    paragraphs: [
      `${shortName} is an invitation-only community for creatives. Through it, members can:`,
    ],
    bullets: [
      "Publish a profile, passion projects, and creative work",
      "Discover other members, their work, and their offerings",
      "Create, host, and attend events, online and in person",
      "Post and browse jobs and opportunities",
      "Message one another directly",
      "Back a project or support a member financially",
    ],
  },
  {
    heading: "Membership is by invitation",
    paragraphs: [
      `${shortName} is not open registration. You join through an invite link from an existing member, and each link works a limited number of times before it stops. We may change how many invitations a member holds, reclaim unused ones, or pause invitations entirely.`,
      "One person, one account. Accounts are personal to you and may not be sold, shared, or transferred. An account created on behalf of an organization must still name a real person responsible for it.",
    ],
  },
  {
    heading: "Account registration and security",
    paragraphs: ["To use the Service, you agree to:"],
    bullets: [
      "Provide accurate, current, and complete information when you register",
      "Keep your account information up to date",
      "Maintain the security and confidentiality of your login credentials",
      "Be at least 18 years of age",
      "Accept responsibility for all activity that occurs under your account",
    ],
    trailing: [
      `You can sign in with an email address and password, or with a Google account. Either way, notify us immediately at ${contactEmail} if you become aware of unauthorized access to your account.`,
      "Impersonating someone else, or building a profile around a person or organization you are not authorized to represent, is grounds for removal.",
    ],
  },
  {
    heading: "Plans, tickets, and payments",
    paragraphs: [
      "Some parts of the Service are free and some are paid. Paid membership is billed in advance and renews automatically at the end of each billing period unless cancelled. You may cancel at any time in your account settings; cancellation takes effect at the end of the current billing period, and fees already paid are non-refundable except as stated here or required by law.",
      "Event organizers set their own ticket prices and tiers. Payments are handled by our payment processor, not by us — we do not receive or store your full card number. Where an organizer collects payment through their own payment link, your purchase is with that organizer and their refund policy governs it.",
      "We may modify plans and pricing with reasonable notice. A change takes effect at your next renewal. You are responsible for all applicable taxes.",
    ],
  },
  {
    heading: "Supporting creatives",
    paragraphs: [
      `The Service includes ways to back a project or support a member financially. Unless a particular page says otherwise in plain words, money moved this way is a payment or a gift, not a charitable donation: ${company} is not a tax-exempt organization, no tax receipt is issued, and you should not treat any amount as deductible.`,
      "Where a page routes you to a third party's own giving platform, that organization — not us — accepts the funds, decides how they are allocated, and issues any receipt.",
    ],
  },
  {
    heading: "Your content",
    paragraphs: [
      '"Your Content" means any text, images, video, audio, projects, works, prompts, replies, or other material you upload, submit, or create using the Service. You retain all ownership rights in Your Content.',
      `By posting Your Content, you grant ${company} a limited, non-exclusive, worldwide, royalty-free licence to host, store, process, reproduce, adapt for display, and show it within the Service and in reasonable promotion of the Service. The licence exists so we can put your work on a page, resize an image, generate a preview card, and index it for search. It terminates when you delete Your Content or close your account, allowing for backups and for copies others were permitted to keep.`,
      `Important: we do NOT use Your Content to train artificial intelligence or machine learning models. Your work remains yours and is processed only to provide the Service to you. Where the Service sends text to a third-party AI provider to power search, it does so through a paid API whose terms prohibit training on customer data — see the Privacy Policy for the detail.`,
      "You represent and warrant that:",
    ],
    bullets: [
      "You own or have the necessary rights to Your Content",
      "Your Content does not violate any third-party rights, including copyright, trademark, contract, or privacy",
      "Your Content complies with applicable law and these Terms",
      "You have obtained any consent needed from people who appear in what you post",
    ],
  },
  {
    heading: "Acceptable use",
    paragraphs: [
      "This is a small, trust-based community. You agree not to use the Service to:",
    ],
    bullets: [
      "Harass, threaten, or target a person or group, or post hate speech",
      "Post sexual content involving minors, or sexual content to people who did not ask for it",
      "Post work that is not yours to post, or remove anyone's credit",
      "Send spam, chain messages, or bulk unsolicited pitches, or use invitations to farm signups",
      "Scrape, crawl, or bulk-extract member profiles, contact details, or content by automated means without permission",
      "Probe, load-test, or attempt to bypass access controls, including the gating on paid or private event material",
      "Impersonate anyone, or misrepresent your affiliation with a person, employer, or organization",
      "Reverse engineer, decompile, or disassemble any part of the Service",
      "Conduct competitive analysis or build a competing product",
      "Resell, redistribute, or sublicense the Service without authorization",
      "Violate any applicable law, or put us in the position of hosting something illegal",
    ],
    trailing: [
      "We may investigate and take action against violations, including suspending or ending an account.",
    ],
  },
  {
    heading: "Events",
    paragraphs: [
      "Events are created and run by members, not by us. The organizer is responsible for the event itself — what it is, whether it happens, who gets in, what it costs, and the condition of the venue. We host the listing and the tooling around it.",
      "Some event pages are visible to anyone with the link, including people without an account, so that an invitation can reach a guest. Join links and recordings for paid or restricted events are gated and are not part of that public page. Sharing a gated link with someone who has not been granted access is a breach of these Terms.",
      "If an event is recorded, the organizer is responsible for giving participants appropriate notice and for obtaining any consent the law requires. Attending an event you find here — online or in person — is your own decision and your own risk.",
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
      "The Service surfaces job listings, opportunities, offerings, and links that come from members or from public sources elsewhere. We do not verify them. We are not the employer, the client, or a party to whatever you arrange, and we do not vouch for any listing, member, organization, or outbound link.",
      "Check anything that matters before acting on it, particularly before sending money or personal documents to someone you met here.",
    ],
  },
  {
    heading: "Our intellectual property",
    paragraphs: [
      `The Service — its software, design, features, and documentation — is owned by ${company} and protected by intellectual property law. Apart from the limited right to use the Service granted here, we retain all right, title, and interest in it.`,
      `"${company}" and "${product}", and our logos, are trademarks of ${company}. You may not use them without our prior written consent.`,
      'If you send us suggestions, ideas, or feedback about the Service ("Feedback"), you grant us an unrestricted, perpetual, irrevocable licence to use that Feedback for any purpose without compensation or attribution. This covers Feedback about the Service — never the creative work you post, which stays yours under "Your content" above.',
    ],
  },
  {
    heading: "Third-party services",
    paragraphs: [
      "The Service integrates with and links to third-party services — sign-in providers, payment processing, mapping and places data, email delivery, and analytics among them. Your use of those services is governed by their own terms and privacy policies. We are not responsible for the content, functionality, or practices of third-party services. The Privacy Policy names the providers we rely on.",
    ],
  },
  {
    heading: "Disclaimer of warranties",
    paragraphs: [
      'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.',
      "We do not warrant that the Service will be uninterrupted, error-free, or secure; that defects will be corrected; that content will always be preserved; or that anything you find here will lead to work, funding, or any particular outcome. Keep your own copy of anything you would be sorry to lose.",
    ],
  },
  {
    heading: "Limitation of liability",
    paragraphs: [
      `TO THE MAXIMUM EXTENT PERMITTED BY LAW, ${company.toUpperCase()} SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OPPORTUNITY, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE, REGARDLESS OF THE THEORY OF LIABILITY.`,
      "Our total liability for any claim arising from or related to these Terms or the Service shall not exceed the greater of (a) the amounts you paid us in the twelve (12) months preceding the claim, or (b) one hundred dollars ($100).",
      `These limits apply even if ${company} has been advised of the possibility of such damages and even if a remedy fails of its essential purpose. Some jurisdictions do not allow certain exclusions or limitations, so parts of this section may not apply to you.`,
    ],
  },
  {
    heading: "Indemnification",
    paragraphs: [
      `You agree to indemnify, defend, and hold harmless ${company} and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or related to your use of the Service, Your Content, your breach of these Terms, or your violation of applicable law or third-party rights.`,
    ],
  },
  {
    heading: "Termination",
    paragraphs: [
      "You may delete your account at any time from your settings, or by contacting us. On termination you lose access to the Service.",
      "We may suspend or end your access for breach of these Terms, for non-payment, where required by law, to protect the security or integrity of the Service, or — because membership here rests on an invitation — where the trust that invitation rested on no longer holds. For termination without cause we will give 30 days' notice.",
      "On termination, your right to use the Service ceases immediately; you may request an export of your data within 30 days; and we may delete your data after that, subject to our retention practices and applicable law. Some material legitimately remains where others hold a copy — a message already delivered, an RSVP on an organizer's list, or content quoted in a report we are required to keep.",
      "Sections that by their nature should survive termination will survive, including those on your content licence, our intellectual property, disclaimers, limitation of liability, indemnification, dispute resolution, and general provisions.",
    ],
  },
  {
    heading: "Dispute resolution",
    paragraphs: [
      `Before starting formal proceedings, please contact us at ${contactEmail} to try to resolve the dispute informally. Nearly everything is faster to fix by email than by process.`,
      `These Terms are governed by the laws of ${jurisdiction}, without regard to its conflict-of-law principles. Any legal action or proceeding arising under these Terms shall be brought exclusively in ${courts}, and you consent to personal jurisdiction there.`,
    ],
  },
  {
    heading: "Changes to these Terms",
    paragraphs: [
      "We may modify these Terms. We will notify you of material changes by posting the updated Terms here and by email or in-product notice, and we will move the effective date at the top of this page. Continuing to use the Service after the changes take effect means you accept them. If you do not agree, stop using the Service before that date.",
    ],
  },
  {
    heading: "General provisions",
    paragraphs: [
      `Entire agreement. These Terms, together with our Privacy Policy, are the entire agreement between you and ${company} regarding the Service.`,
      "Severability. If any provision is found unenforceable, the rest continues in full force.",
      "Waiver. Our failure to enforce a provision is not a waiver of it or of any other provision.",
      "Assignment. You may not assign or transfer these Terms without our prior written consent. We may assign them without restriction.",
      "Notices. We may give you notice by email to the address on your account, or by posting in the Service.",
    ],
  },
  {
    heading: "Contact",
    paragraphs: [
      `Questions about these Terms go to ${contactEmail}.`,
      `${product} is owned and operated by ${company}, and ${company} is the party you are contracting with under this agreement.`,
    ],
  },
];

export default function Terms() {
  return (
    <LegalDocument
      title="Terms of Service"
      lastUpdated={LEGAL_ENTITY.termsUpdated}
      effectiveDate={LEGAL_ENTITY.termsEffective}
      sections={SECTIONS}
    />
  );
}
