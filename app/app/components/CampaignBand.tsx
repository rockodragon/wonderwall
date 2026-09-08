import {
  CAMPAIGN_IMAGES,
  CAMPAIGN_QUOTES,
  type CampaignImageKey,
} from "../lib/campaign";

// The "create different." band — two black-and-white frames and the line.
//
// Type never sits on a photograph here. That was the one rule the campaign
// pass settled: a gradient over a busy picture is a legibility gamble and it
// loses on a phone in daylight. Words sit on solid ground, above or below.
//
// The word after "different" is what changes per audience — odds, futures,
// livelihoods, outcomes, nights. The verb never does.

export function CampaignBand({
  images,
  tail,
  caption,
}: {
  images: [CampaignImageKey, CampaignImageKey];
  /** The word after "different" — omit for the bare "create different." */
  tail?: string;
  caption?: string;
}) {
  return (
    <section className="mb-16">
      <p
        className="text-3xl md:text-5xl text-[var(--garden-paper)] leading-none mb-6 lowercase"
        style={{ fontFamily: "var(--garden-font-display)", fontWeight: 600 }}
      >
        create{" "}
        <span className="text-[var(--garden-citron)]">
          {tail ? `different ${tail}.` : "different."}
        </span>
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        {images.map((key) => {
          const img = CAMPAIGN_IMAGES[key];
          const q = CAMPAIGN_QUOTES[key];
          return (
            <figure key={key} className="m-0">
              <img
                src={img.src}
                alt={img.alt}
                loading="lazy"
                className="w-full aspect-[4/5] object-cover rounded-2xl bg-[var(--garden-ink-raised)]"
              />
              <figcaption className="pt-4">
                <p
                  className="text-[var(--garden-paper)] text-2xl md:text-3xl leading-tight mb-2"
                  style={{ fontFamily: "var(--garden-font-display)", fontWeight: 500 }}
                >
                  “{q.said}”
                </p>
                <p className="text-[var(--garden-dim)] text-sm">{q.who}</p>
              </figcaption>
            </figure>
          );
        })}
      </div>
      {caption && (
        <p className="mt-4 text-[var(--garden-body)] max-w-2xl leading-relaxed">
          {caption}
        </p>
      )}
    </section>
  );
}
