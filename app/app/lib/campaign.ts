// "Create different." — the campaign photography and the line it carries.
//
// One manifest so every surface uses the same frames and the credits stay
// correct. The files live in public/campaign/, converted to black and white
// with grain (the campaign's look) from Creative Commons originals sourced
// through Openverse. CC BY requires visible attribution, which is why
// `CREDITS` exists and /legal/credits renders it.
//
// These are stand-ins for a real shoot. They are honest as PICTURES — a
// guitarist is a guitarist — so they carry the campaign fine. What they must
// never carry is a name and a quote: an invented testimonial attributed to
// "Shua, musician, San Diego" reads as a real customer saying a real thing.
// The campaign mockup had those; the live site does not, and must not until
// the person exists and said it.

export type CampaignImage = {
  src: string;
  alt: string;
  /** Title — Creator, License. Rendered on /legal/credits. */
  credit: string;
};

export const CAMPAIGN_IMAGES = {
  shua: {
    src: "/campaign/shua.jpg",
    alt: "A guitarist's hands on the body of an electric guitar.",
    credit: "“Playing the electric guitar” by nzgabriel, CC BY",
  },
  ade: {
    src: "/campaign/ade.jpg",
    alt: "Hands shaping a pot on a potter's wheel.",
    credit: "“Potter's Hands” by Walt Stoneburner, CC BY",
  },
  june: {
    src: "/campaign/june.jpg",
    alt: "A hand writing in an open notebook beside three small plants.",
    credit: "“Write Desk” by Ylanite Koppens, CC0",
  },
  dee: {
    src: "/campaign/dee.jpg",
    alt: "Hands holding a camera body and lens.",
    credit: "“Photographer Holding Camera” by an unknown photographer, CC0",
  },
  marta: {
    src: "/campaign/marta.jpg",
    alt: "A craftsman shaping a piece of wood by hand.",
    credit:
      "“Elderly craftsman working with wood in a rustic workshop” by nenadstojkovicart, CC BY",
  },
  gallery: {
    src: "/campaign/gallery.jpg",
    alt: "A visitor in a wide-brimmed hat looking at framed photographs on a gallery wall.",
    credit: "“Photo Exhibition” by Me in ME, CC BY",
  },
  band: {
    src: "/campaign/band.jpg",
    alt: "A drummer and a guitarist playing on a small stage.",
    credit: "“Neil Turpin playing drums” by gpoo, CC BY",
  },
  viewing: {
    src: "/campaign/viewing.jpg",
    alt: "A person standing in front of a large painted mural in a gallery.",
    credit: "“Scream” by Go-tea 郭天, CC BY",
  },
  church: {
    src: "/campaign/church.jpg",
    alt: "The inside of a church, rows of empty pews under a chandelier.",
    credit:
      "“Unitarian Universalist Church of Provincetown” by dbking, CC BY",
  },
  busker: {
    src: "/campaign/busker.jpg",
    alt: "A busker playing an acoustic guitar on a cobbled street.",
    credit: "“redvers bailey” by abbilder, CC BY",
  },
  cafe: {
    src: "/campaign/cafe.jpg",
    alt: "A man sitting alone in a diner booth.",
    credit: "“Nighthawk Diner” by Siri B.L., CC BY",
  },
  night: {
    src: "/campaign/night.jpg",
    alt: "A cafe front at night, tables visible through the window.",
    credit: "“Cafe Rouge” by Sheffield Tiger, CC BY",
  },
  opening: {
    src: "/campaign/opening.jpg",
    alt: "People talking over drinks at a gallery opening.",
    credit:
      "“Karl Krogstad's Fine Art Opening in Ballard, Seattle” by Wonderlane, CC0",
  },
  pair: {
    src: "/campaign/pair.jpg",
    alt: "A museum visitor in a straw hat standing before a framed painting.",
    credit: "“American Gothic - 28/52” by Phil Roeder, CC BY",
  },
} satisfies Record<string, CampaignImage>;

export type CampaignImageKey = keyof typeof CAMPAIGN_IMAGES;

export const CREDITS: CampaignImage[] = Object.values(CAMPAIGN_IMAGES);
