// Names held back from first come, first served (Rick, 2026-10-25). Each
// held name has a category, and each category says how the name is released
// and what a person reads when they try it. The policy page
// (routes/legal.names.tsx) reads the same table, so the page and the refusal
// can't disagree.
//
//   system      reads as the site speaking (staff, official, verify…). Never
//               released. The site's own paths are RESERVED_HANDLES in
//               handleRules.ts and stay there; this list is the rest.
//   founder     the founders' and the team's names. Released to them.
//   city        the 100 largest US metros (Census CBSAs, 2023), common
//               nicknames and world art cities. Released to the community
//               that runs that city: it takes the name as its /slug
//               (garden/communityDomains.ts renameCommunity), which keeps it
//               from people from then on (handles.handleRefusal).
//   brand       platforms, payments, creative software and gear, art supply,
//               labels and studios. Released with an Organization account.
//   discipline  art-form words. Kept for the site's own pages on them.
//   short       1–2 characters: held. 3 characters: premium, claimable with a
//               paid membership (handles.handleRefusal). A rule on length, not
//               a list; a listed name (sd, nyc, art) is its list's.
//
// Nobody loses a name to this list: a person who already holds one keeps it
// (handles.ts never refuses the address a person has, or their own old one
// while it forwards). An operator gives a held name to the person it's held
// for with handles.giveHeldHandle.
//
// No Convex imports (as handleRules.ts). heldHandles.test.ts checks every
// entry is lowercase, listed once, and a valid address by handleProblem.

import { LEGAL_ENTITY } from "../app/legal/entity";

export type HeldCategory = "system" | "founder" | "city" | "brand" | "discipline" | "short";

/** What the refusal's code tells the page: reserved = not released to
 * people; held = write to us; premium = comes with a membership;
 * org = comes with an Organization account. */
export type HeldCode = "handle_reserved" | "handle_held" | "handle_premium" | "handle_org";

export type HeldRefusal = { code: HeldCode; reason: string };

/** Names of this many characters or fewer are premium. */
export const PREMIUM_MAX_LENGTH = 3;
/** Names of this many characters or fewer are held outright. */
export const SHORT_HELD_MAX_LENGTH = 2;

const WRITE_TO_US = `Write to us at ${LEGAL_ENTITY.contactEmail} to claim it.`;

export const HELD_REFUSAL = {
  system: { code: "handle_reserved", reason: "That address is reserved." },
  held: { code: "handle_held", reason: `This name is held for its owner. ${WRITE_TO_US}` },
  brand: { code: "handle_org", reason: "This name is held for the brand. It comes with an Organization account." },
  discipline: { code: "handle_reserved", reason: "This name is kept for the site's own page on that art form." },
  short: { code: "handle_reserved", reason: `Names of 1 or ${SHORT_HELD_MAX_LENGTH} characters are held.` },
  premium: {
    code: "handle_premium",
    reason: `Names of ${PREMIUM_MAX_LENGTH} characters or fewer come with a membership.`,
  },
} as const satisfies Record<string, HeldRefusal>;

/** Each category and how it's released, in the words the policy page
 * (routes/legal.names.tsx) lists them. */
export const HELD_RELEASE: Record<HeldCategory, string> = {
  system: "Site names, like staff, support, official and admin: never released, since they would read as the site speaking.",
  founder: "The founders' and the team's names: held for them.",
  city: "Cities: the 100 largest US metro areas, common nicknames like nyc and la, and world art cities like paris and tokyo. Each is held for the community that runs that city.",
  brand: "Brands: social and tech platforms, payment services, creative software and gear, art supply makers, record labels and studios. Each is held for the brand, and comes with an Organization account.",
  discipline: "Art-form words, like painter, photography, music and poetry: kept for the site's own pages on each art form.",
  short: `Short names: those of 1 or ${SHORT_HELD_MAX_LENGTH} characters are held, and those of ${PREMIUM_MAX_LENGTH} come with a membership.`,
};

/** Words, space-separated, so the lists read as lists. */
const words = (s: string): string[] => s.trim().split(/\s+/);

/** Impersonates us. Never released. Not the site's paths: those are
 * RESERVED_HANDLES (admin, help, support, garden, exchange…). */
const SYSTEM = words(`
  staff official officials verify verified verification billing security mod mods moderator moderators
  moderation administrator sysadmin root team ce tce thecreativeexchange thecreative.exchange
  thecreative creativeexchange theexchange thegarden deeplight wonderwall
  info hello contact contactus press news privacy terms safety trust trustandsafety abuse report
  reports payments payouts account accounts notifications noreply no_reply helpdesk helpcenter
  system bot www mail email status blog store shop app dev beta ceo founder founders owner operator
  operators community member members membership null undefined anonymous everyone
`);

/** The founders. "rick" opens @rickmoy's page (HANDLE_ALIASES). */
const FOUNDER = words(`
  rick rickmoy rick.moy rick_moy
`);
// TEAM: Rick adds the team's names here, one per entry, lowercase. They are
// held like a founder's (category "founder").
const TEAM: string[] = [];

/** The 100 largest US metropolitan statistical areas (Census, 2023
 * estimates), in rank order, by the city name people type. */
const US_METROS = words(`
  newyork losangeles chicago dallas houston atlanta washington miami philadelphia phoenix
  boston riverside sanfrancisco detroit seattle minneapolis tampa sandiego denver orlando
  charlotte baltimore stlouis sanantonio austin portland sacramento pittsburgh lasvegas cincinnati
  kansascity columbus indianapolis nashville cleveland sanjose virginiabeach jacksonville providence raleigh
  milwaukee oklahomacity louisville richmond memphis saltlakecity fresno birmingham grandrapids hartford
  buffalo tucson tulsa rochester greenville omaha honolulu bridgeport neworleans knoxville
  sarasota bakersfield albuquerque mcallen albany charleston batonrouge worcester allentown elpaso
  columbia capecoral lakeland boise oxnard dayton stockton greensboro coloradosprings littlerock
  provo desmoines deltona poughkeepsie winstonsalem madison akron ogden palmbay wichita
  syracuse augusta durham fayetteville harrisburg jackson spokane toledo chattanooga newhaven
`);

/** What people call the big ones. */
const CITY_NICKNAMES = words(`
  nyc la sf sd atl chi dc philly nola dfw htx phx pdx slc stl atx satx kc vegas bmore cdmx washingtondc
`);

/** Cities the art world travels to. */
const WORLD_ART_CITIES = words(`
  paris london berlin tokyo mexicocity newyorkcity florence rome barcelona amsterdam venice vienna
  madrid milan prague lisbon istanbul kyoto seoul hongkong mumbai buenosaires saopaulo lagos capetown
  toronto
`);

// Brands. Left off on purpose: plain words and first names a creative could
// fairly go by (avid, chase, warner, universal, criterion, blender, unity).

/** Social and tech platforms, and the places creatives sell, fund and list work. */
const PLATFORMS = words(`
  instagram insta meta facebook tiktok youtube x twitter threads bluesky google apple microsoft amazon
  openai anthropic chatgpt snapchat pinterest linkedin reddit discord twitch tumblr whatsapp telegram
  mastodon substack netflix samsung midjourney squarespace wordpress wix shopify etsy ebay zoom slack
  notion github linktree kickstarter indiegogo gofundme eventbrite meetup ticketmaster livenation
  flickr vsco imdb letterboxd goodreads wattpad
`);

const PAYMENTS = words(`
  paypal venmo cashapp stripe zelle patreon kofi buymeacoffee gumroad visa mastercard amex
  americanexpress wellsfargo bankofamerica applepay googlepay klarna afterpay coinbase revolut
`);

/** Creative software, cameras, instruments and audio, and where music and pictures are hosted. */
const CREATIVE_TOOLS = words(`
  adobe photoshop lightroom premiere premierepro aftereffects indesign procreate figma canva sketchapp
  cinema4d davinciresolve blackmagic finalcutpro logicpro protools autodesk zbrush wacom huion xppen
  canon nikon sony fujifilm fuji leica hasselblad panasonic lumix olympus gopro dji arri kodak polaroid
  ilford fender gibson yamaha roland korg moog ableton steinberg nativeinstruments akai shure
  sennheiser audiotechnica focusrite ibanez steinway spotify soundcloud bandcamp applemusic deezer
  vimeo behance dribbble artstation deviantart unsplash shutterstock gettyimages getty pexels splice
  distrokid tunecore beatport garageband capcut unrealengine
`);

const ART_SUPPLY = words(`
  blick dickblick moleskine winsornewton liquitex goldenpaints fabercastell staedtler prismacolor copic
  posca molotow sennelier strathmore canson derwent pentel sharpie crayola jerrysartarama hobbylobby
  utrecht gamblin holbein schmincke danielsmith carandache
`);

/** Major record labels, film and TV studios, and the award bodies. */
const LABELS_AND_STUDIOS = words(`
  universalmusic umg sonymusic warnermusic warnerbros interscope defjam republicrecords columbiarecords
  atlanticrecords capitolrecords islandrecords epicrecords motown rca emi subpop rocnation xlrecordings
  roughtrade a24 disney pixar dreamworks paramount universalpictures lionsgate hbo hulu appletv marvel
  lucasfilm sonypictures mgm focusfeatures blumhouse aardman studioghibli ghibli mubi sundance
  recordingacademy grammys oscars
`);

const DISCIPLINES = words(`
  art arts artist artwork painter painting photography photographer photo music musician film
  filmmaker cinema poetry poet dance dancer choreography choreographer sculpture sculptor ceramics
  ceramicist pottery design designer illustration illustrator writing writer theater theatre acting
  actor drawing printmaking animation animator architecture fashion textiles jewelry calligraphy
  comics songwriter singer composer opera murals streetart tattoo video creative creatives
`);

/** Every listed name, by category. heldHandles.test.ts counts them. */
export const HELD_LISTS: Record<Exclude<HeldCategory, "short">, readonly string[]> = {
  system: SYSTEM,
  founder: [...FOUNDER, ...TEAM],
  city: [...US_METROS, ...CITY_NICKNAMES, ...WORLD_ART_CITIES],
  brand: [...PLATFORMS, ...PAYMENTS, ...CREATIVE_TOOLS, ...ART_SUPPLY, ...LABELS_AND_STUDIOS],
  discipline: DISCIPLINES,
};

/** The groups inside each list, for the test's counts. */
export const HELD_GROUPS = {
  usMetros: US_METROS,
  cityNicknames: CITY_NICKNAMES,
  worldArtCities: WORLD_ART_CITIES,
  platforms: PLATFORMS,
  payments: PAYMENTS,
  creativeTools: CREATIVE_TOOLS,
  artSupply: ART_SUPPLY,
  labelsAndStudios: LABELS_AND_STUDIOS,
} as const;

const LISTED: ReadonlyMap<string, HeldCategory> = new Map(
  (Object.entries(HELD_LISTS) as [HeldCategory, readonly string[]][]).flatMap(([category, names]) =>
    names.map((name) => [name, category] as const),
  ),
);

/** A founder alias: the address on the left opens the page of whoever holds
 * the one on the right, for good (no 90-day limit, unlike a changed
 * address). Both are founder names, so nobody else can claim either. When
 * the right one is unclaimed, the left one is the 404 like any free name.
 * handles.profileForHandle reads this. */
export const HANDLE_ALIASES: ReadonlyMap<string, string> = new Map([["rick", "rickmoy"]]);

/** The category a cleaned, valid handle is held under, or null when it's
 * free to claim. A listed name is its list's; anything else of 3
 * characters or fewer is "short". */
export function heldCategory(handle: string): HeldCategory | null {
  return LISTED.get(handle) ?? (handle.length <= PREMIUM_MAX_LENGTH ? "short" : null);
}

/** Why a held handle can't be claimed through the form, or null when it's
 * free. A 3-character name answers "premium": handles.handleRefusal lets a
 * paid member through. */
export function heldRefusal(handle: string): HeldRefusal | null {
  switch (heldCategory(handle)) {
    case null:
      return null;
    case "system":
      return HELD_REFUSAL.system;
    case "founder":
    case "city":
      return HELD_REFUSAL.held;
    case "brand":
      return HELD_REFUSAL.brand;
    case "discipline":
      return HELD_REFUSAL.discipline;
    case "short":
      return handle.length <= SHORT_HELD_MAX_LENGTH ? HELD_REFUSAL.short : HELD_REFUSAL.premium;
  }
}
