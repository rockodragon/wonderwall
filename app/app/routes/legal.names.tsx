import { HANDLE_FORWARD_DAYS, HANDLE_MAX_LENGTH } from "../../convex/handleRules";
import { HELD_RELEASE, PREMIUM_MAX_LENGTH, SHORT_HELD_MAX_LENGTH } from "../../convex/heldHandles";
import { LegalDocument, type LegalSection } from "../components/LegalDocument";
import { LEGAL_ENTITY } from "../legal/entity";

// How @addresses work: five plain points. The numbers and the held
// categories come from the code that enforces them (convex/handleRules.ts,
// convex/heldHandles.ts), so the page can't promise something the claim
// form doesn't do. No prices here: what a membership or an Organization
// account costs is the pricing page's to say.

const { product, contactEmail } = LEGAL_ENTITY;

export function meta() {
  const title = `Naming policy - ${product}`;
  const description = `How names on ${product} are claimed, held and released.`;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
  ];
}

const SECTIONS: LegalSection[] = [
  {
    heading: "Names are first come, first served",
    paragraphs: [
      `Your address is ${product.toLowerCase()}/@name. A name of ${PREMIUM_MAX_LENGTH + 1} or more characters is yours if you are the first to claim it in Settings, unless it is held (point 3).`,
      `A name can use letters, numbers, periods and underscores, up to ${HANDLE_MAX_LENGTH} characters. These are Instagram's rules, so you can bring the name you already use.`,
    ],
  },
  {
    heading: "We never take a name from a member who is using it",
    paragraphs: [
      "Once a name is yours, it stays yours, even if a name like it is held later.",
      `If you change your name, the old one sends people to your page for ${HANDLE_FORWARD_DAYS} days. Nobody else can claim it in that time, and you can take it back.`,
    ],
  },
  {
    heading: "Some names are held",
    paragraphs: ["Some names can't be claimed in Settings. Each kind is released its own way:"],
    bullets: [
      HELD_RELEASE.system,
      HELD_RELEASE.founder,
      HELD_RELEASE.city,
      HELD_RELEASE.brand,
      HELD_RELEASE.discipline,
      HELD_RELEASE.short,
    ],
  },
  {
    heading: `Names of ${PREMIUM_MAX_LENGTH} characters or fewer are premium`,
    paragraphs: [
      `They come with a membership. A member can claim any ${PREMIUM_MAX_LENGTH}-character name that nobody holds, in Settings.`,
      `Names of 1 or ${SHORT_HELD_MAX_LENGTH} characters are held for now.`,
    ],
  },
  {
    heading: "Real-name owners, and anyone being impersonated, can write to us",
    paragraphs: [
      `If a held name is your real name, write to us at ${contactEmail}. Tell us the name and how it is yours. We check, then give it to you.`,
      "If someone is using a name to pass as you or your brand, write to us the same way. Passing as someone else is against the Terms, so point 2 does not protect a name used that way.",
      "A brand's own name comes with an Organization account (point 3).",
    ],
  },
];

export default function NamingPolicy() {
  return (
    <LegalDocument
      title="Naming policy"
      lastUpdated={LEGAL_ENTITY.namesUpdated}
      effectiveDate={LEGAL_ENTITY.namesEffective}
      sections={SECTIONS}
    />
  );
}
