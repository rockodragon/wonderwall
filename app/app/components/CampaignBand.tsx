import { CAMPAIGN_IMAGES, type CampaignImageKey } from "../lib/campaign";

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
  const [a, b] = images.map((k) => CAMPAIGN_IMAGES[k]);
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
      <div className="grid gap-4 sm:grid-cols-2">
        {[a, b].map((img) => (
          <img
            key={img.src}
            src={img.src}
            alt={img.alt}
            loading="lazy"
            className="w-full aspect-[4/5] object-cover rounded-2xl bg-[var(--garden-ink-raised)]"
          />
        ))}
      </div>
      {caption && (
        <p className="mt-4 text-[var(--garden-body)] max-w-2xl leading-relaxed">
          {caption}
        </p>
      )}
    </section>
  );
}
