# Video Provider Research — Phase 1B (October links) & Phase 3 (in-app video)

Research date: all prices below were checked 2026-08-13. Every number is cited with a URL; where a vendor's own pricing page renders prices via client-side JS that this research's fetch tooling couldn't execute, the structural facts (caps, limits) are cited to the primary page and the dollar figures are cited to secondary aggregators that were cross-checked against each other — flagged inline as "(aggregator)".

## The question

October (7 weeks out): every Table session needs a meeting link + calendar invite. External provider, zero build risk. Phase 3 (2026 Q4+): video embedded in the app — join from the Table page, recordings attached to the Table, possibly livestreams to bigger audiences. The founder has hands-on LiveKit experience and wants to know if **LiveKit Cloud can serve both phases on one bill.**

## Scenarios used for cost math

- **[a] October:** 6 sessions/week × 60 min × 10 avg participants → 600 participant-min/session → 3,600/week → **≈15,588 participant-minutes/month** (×4.33 weeks)
- **[b] Year-1:** 30 sessions/week × 75 min × 12 avg participants + 2 monthly livestreams to 200 viewers (assume 60 min each) → 900 participant-min/session → 27,000/week → **≈116,910 participant-minutes/month**, plus **120 livestream encode-minutes/month** and a viewer-side load of 200 viewers × 60 min × 2 = 24,000 viewer-minutes/month (only relevant to providers that meter viewers, not encode minutes)

---

## Recommendation table

| Provider | October fit | Oct [a] cost | Year-1 [b] cost | Phase 3 embed effort | Verdict |
|---|---|---|---|---|---|
| **LiveKit Cloud** | No first-party hosted link product — you must build/deploy a join page (violates "zero build") | ~$50/mo (Ship tier, if you build the page) | ~$50–55/mo | **S** (founder has prior LiveKit experience; own S3 recording, native HLS/RTMP egress) | Best Phase 3 bet, wrong tool for October |
| **Zoom** | Free tier fails (40-min cap < 60-min sessions); Pro seat needed | ~$15–34/mo (1–2 Pro seats) | ~$240–260/mo (multiple concurrent seats + Webinar add-on for livestream) | M–L (Meeting SDK licensing/JWT overhead) | Safe, familiar, gets expensive with concurrency |
| **Google Meet / Workspace** | Free tier's 60-min group cap is a coin-flip risk on 60-min sessions; Workspace seat needed | ~$14/mo (2 Starter seats) | ~$112/mo (more seats) — **livestream to 200 external viewers not supported below Enterprise** | L (no true embeddable call surface; API creates links, not an in-app video widget) | Cheapest seat-based option, fails Year-1 livestream requirement outright |
| **Daily.co** | Purpose-built REST API mints a link instantly, no seats, guest join, no build | **~$22/mo** | **~$431/mo** (likely lower with volume discount) | S (prebuilt iframe UI or full custom SDK) | Best October value; credible Phase 3 alternative to LiveKit |
| **Whereby Embedded** | REST API mints a link instantly, no seats, no-download guest join | ~$64/mo | ~$470/mo — **200-viewer livestream not a native capability** | S (embed is the product) | Good October fit; not built for the Year-1 livestream ask |
| **8x8 JaaS** | Free/link-based Jitsi room works day one; MAU pricing is a step function, not per-minute | ~$99/mo (Basic tier, or $0 if under 25 unique attendees) | ~$500/mo (Standard tier) | S–M (Jitsi IFrame API, based on open-source Jitsi) | Cost-predictable, least differentiated, weakest livestream story |

---

## Provider detail

### LiveKit Cloud

**October fit:** LiveKit Cloud is realtime infrastructure (SFU + APIs), not a video-calling product. There is no "create a meeting, get a shareable link" endpoint that hands you a hosted call page — `meet.livekit.io` is an open-source **example app** (`livekit-examples/meet` on GitHub) a team deploys and brands themselves, not a first-party hosted product like Zoom or Daily's room URLs ([LiveKit Meet example](https://meet.livekit.io/), [GitHub repo](https://github.com/livekit-examples/meet), checked 2026-08-13). That means using LiveKit for October means writing and deploying a join page in the first place — exactly the "build risk" October is trying to avoid.

**Cost at scale:** [livekit.com/pricing](https://livekit.com/pricing), checked 2026-08-13. Four tiers: Build ($0 — 5,000 WebRTC min, 1,000 agent min, 50GB transfer, 60 recording-transcode min), Ship ($50/mo — 150,000 WebRTC min included then $0.0005/min, 250GB transfer then $0.12/GB, 600 recording-transcode min then $0.02/min video), Scale ($500/mo — 1.5M WebRTC min then $0.0004/min, 3TB transfer then $0.10/GB, 8,000 recording-transcode min then $0.015/min), Enterprise (custom).
- Scenario [a]: 15,588 min exceeds Build's 5,000 free min → Ship tier, flat **$50/mo** (10% of included minutes used).
- Scenario [b]: 116,910 min still fits inside Ship's 150,000-minute allotment → still **~$50/mo** base; the 2 monthly livestreams (120 encode-min) fit inside Ship's 600 included recording-transcode minutes. The wildcard is HLS viewer-side data transfer for 200 concurrent viewers — a rough estimate (200 viewers × 60 min × 2 events at ~1.5Mbps) lands around 260–270GB, which slightly exceeds Ship's 250GB included transfer (~$1–2 overage at $0.12/GB). **Total ≈ $50–55/mo.** This needs a real proof-of-concept before committing — HLS/CDN delivery cost estimates are rough.

**Phase 3 fit:** Strongest of the group on paper. Egress writes recordings directly to your own S3/GCS/Azure bucket (no LiveKit storage fee, just your own cloud storage bill), and supports HLS segment output and RTMP push to YouTube/Twitch/etc. for livestreaming ([LiveKit Egress docs](https://docs.livekit.io/server/egress/), checked 2026-08-13). React components (`@livekit/components-react`) make embedding fast, and the founder's prior hands-on experience further reduces effort — grade **S**.

**Gotcha:** the crossover point where Ship's flat $50/mo stops being enough is ~150,000 participant-minutes/month — well past Year-1 scale in this plan (30 sessions/week × 75 min × 12 people = 116,910/month). If Tables grow past that (roughly 40 sessions/week at this session shape), LiveKit either eats modest per-minute overage on Ship (~$0.0005/min) or jumps to Scale's $500/mo floor — evaluate before committing to a tier.

### Zoom

**October fit:** [zoom.us/pricing](https://zoom.us/pricing), checked 2026-08-13 — confirmed directly: Basic (free) caps group meetings (3+ participants) at **40 minutes**, 100 participants. Since sessions run 60 minutes, the free tier doesn't work; a Pro seat is required. Pro removes the time cap (up to 30 hours) and keeps the 100-participant cap; Business raises the cap to 300. Dollar figures didn't render through fetch tooling (Zoom's pricing widget is client-rendered), so pricing is triangulated across three checked-today aggregators that agree within a few dollars: Pro ≈ **$13.33–$14.16/mo per user billed annually, $15.99–$16.99/mo billed monthly** ([tech.co](https://tech.co/web-conferencing/zoom-pricing-guide), [pumble.com](https://pumble.com/zoom-pricing), [meetgeek.ai](https://meetgeek.ai/blog/zoom-price-plans), all checked 2026-08-13 — **verify at checkout**, these are aggregator figures not a fetched primary price). Attendee friction is low (browser join available, no account needed to join), but each **concurrent** session needs its own licensed host — Zoom's API (Server-to-Server OAuth) can mint meetings programmatically but the host creating them must hold a Pro+ license.
- Scenario [a]: assume 1–2 Pro seats cover 6 sessions/week spread across the two launch orgs → **~$15–34/mo**.
- Scenario [b]: 30 sessions/week likely needs several concurrent facilitators holding seats — estimate 8 Business seats (~$18–22/mo each) ≈ **$160/mo**, plus a Zoom Webinars add-on for the 200-viewer livestream (Zoom Meetings' own participant cap tops out at 300 on Business, but broadcast-style large-audience streaming is really the Webinars product, roughly $79–99/mo per host license) → **total ≈ $240–260/mo**. This is the least precise estimate here since it depends on operational choices (how many concurrent hosts) more than raw usage.

**Phase 3 fit:** Zoom Meeting SDK embeds the full Zoom meeting UI in-app; Zoom Video SDK is the lower-level building block, priced separately at **$3.5/1,000 min ($0.0035/min)** with **10,000 free minutes/month**, cloud recording at **$0.01/min + $0.25/GB storage** ([devforum.zoom.us Video SDK pricing discussion](https://devforum.zoom.us/t/zoom-video-sdk-price/144877), [Video SDK fact sheet](https://developers.zoom.us/blog/video-sdk-fact-sheet/), checked 2026-08-13). Effort grade **M–L**: JWT-based session auth, licensing model is awkward for a per-session use case, and the SDK is heavier to integrate cleanly than purpose-built embed products.

**Gotcha:** the free tier's 40-minute cap is a real trap if any Table runs long — verify this hasn't changed before relying on it even for testing.

### Google Meet / Google Workspace

**October fit:** A personal (free) Google account's Meet caps group calls (3+ participants) at **60 minutes** ([screenapp.io Google Meet pricing summary](https://screenapp.io/blog/google-meet-pricing), checked 2026-08-13) — exactly the length of an Oct session, which is too close to the line to rely on. A Workspace Business Starter seat ($7/user/mo annual, [workspace.google.com/pricing](https://workspace.google.com/pricing), checked 2026-08-13) removes the cap and supports 100 participants; Standard ($14/user/mo) raises the cap to 150 and adds recording-to-Drive. The Google Meet REST API can create a meeting space and hand back a join link programmatically, and standard API usage is free — only exceeding quota is planned to incur Cloud billing charges later in 2026 ([Google Meet API usage limits](https://developers.google.com/workspace/meet/api/guides/limits), checked 2026-08-13). Attendee friction is low — no Meet account needed to join via a link, browser-based.
- Scenario [a]: 2 Business Starter seats ≈ **$14/mo**.
- Scenario [b]: more seats for more concurrent facilitators (assume ~8 Standard seats for recording) ≈ **$112/mo**, but **the 200-viewer livestream requirement is not supported** — only Enterprise tier offers live streaming, and it's explicitly "in-domain" (internal org audience only), not a public/external broadcast to 200 outside viewers ([workspace.google.com/pricing](https://workspace.google.com/pricing), checked 2026-08-13). This scenario simply doesn't fit Google Meet without a manual workaround (e.g., screen-sharing into a separate YouTube Live encoder).

**Phase 3 fit:** Weak. The Meet REST API is built for creating/managing meeting spaces and pulling artifacts (recordings, transcripts) after the fact — it is **not** an embeddable in-app video-calling widget. There's no equivalent of a LiveKit/Daily/Whereby SDK that lets you render a live call surface inside your own UI. Effort grade **L**, and the ceiling is a hard "not really supported" for genuine in-app embed.

### Daily.co

**October fit:** [daily.co/pricing/webrtc-infrastructure](https://www.daily.co/pricing/webrtc-infrastructure/), checked 2026-08-13. REST API creates a room and returns a URL in one call — no seat licensing, no account required to join (guest join over browser). **10,000 free participant-minutes/month**, then $0.004/participant-min sliding down to $0.0015/min at volume.
- Scenario [a]: 15,588 − 10,000 free = 5,588 billable × $0.004 = **≈$22.35/mo**.
- Scenario [b]: 116,910 − 10,000 = 106,910 billable × $0.004 = $427.64, plus HLS livestream encode at $0.03/min × 120 min = $3.60 → **≈$431/mo** (likely somewhat lower — Daily's own sliding scale drops to $0.0015/min at higher volumes, so this is an upper-bound estimate; get a volume quote before committing).

**Phase 3 fit:** Strong — prebuilt iframe call UI for fast embed, or `daily-js`/React SDK for full custom control. Cloud recording $0.01349/min + $0.003/min storage, HLS livestream $0.03/min, RTMP $0.015/min ([daily.co/pricing/webrtc-infrastructure](https://www.daily.co/pricing/webrtc-infrastructure/), checked 2026-08-13). Effort grade **S**. This is the closest thing to a LiveKit alternative that also cleanly covers October with zero build.

### Whereby Embedded

**October fit:** [whereby.com/information/embedded/pricing](https://www.whereby.com/information/embedded/pricing), checked 2026-08-13. REST API (`POST /v1/meetings`) creates a room instantly; join is no-download, no-account, click-the-link in browser — the lowest attendee friction of any option checked. Explore (free): 2,000 participant-min/month included. Build: $9.99/mo base + 2,000 min included + $0.004/participant-min overage, recording $0.01/min.
- Scenario [a]: 15,588 − 2,000 = 13,588 × $0.004 = $54.35 + $9.99 = **≈$64.34/mo**.
- Scenario [b]: 116,910 − 2,000 = 114,910 × $0.004 = $459.64 + $9.99 = **≈$469.63/mo**. The **200-viewer livestream is not a fit** — Whereby Embedded rooms are designed for small/medium interactive groups (default room mode caps at 4, "group" mode extends this but it's not a broadcast product), so this requirement would need a separate tool even if Whereby handled everything else.

**Phase 3 fit:** Effort grade **S** — embedding is the entire product (iframe or custom UI via `@whereby.com/browser-sdk`). Optional HIPAA add-on at $16.99/mo is a gotcha to avoid enabling by accident since nothing here requires it.

### 8x8 JaaS (Jitsi as a Service)

**October fit:** [cpaas.8x8.com/en/pricing/jitsi-as-a-service-pricing](https://cpaas.8x8.com/en/pricing/jitsi-as-a-service-pricing/), checked 2026-08-13. Unlike every other option, pricing is **Monthly Active Users (MAU)**, not participant-minutes: a unique user who attends ≥1 meeting with ≥1 other person in a given month counts once, regardless of session length or count. Free Developer tier: 25 MAU. Basic: $99/mo for 300 MAU. Standard: $499/mo for 1,500 MAU. Business: $999/mo for 3,000 MAU. Overage $0.99/MAU beyond a tier's cap.
- Scenario [a]: two launch orgs, 6 sessions/week — unique monthly attendees plausibly land in the 30–80 range, likely just over the 25-MAU free ceiling → Basic tier, flat **$99/mo** regardless of the exact session count or length (a real advantage for October's unpredictable shape).
- Scenario [b]: platform-wide unique attendees across 30 sessions/week likely run into the hundreds/month → Standard tier, flat **$499/mo**, plus RTMP livestream at $0.01/min × 120 min ≈ $1.20/mo → **≈$500/mo**.

**Phase 3 fit:** Effort grade **S–M** via the Jitsi IFrame API (`external_api.js`, embed in a container div) — built on open-source Jitsi so documentation and community patterns are mature ([8x8 Developer Portal, IFrame API overview](https://developer.8x8.com/jaas/docs/iframe-api-overview/), checked 2026-08-13). Recording is a paid add-on at $0.01/min (not free-tier included) ([cpaas.8x8.com pricing](https://cpaas.8x8.com/en/pricing/jitsi-as-a-service-pricing/), checked 2026-08-13).

**Gotcha:** the MAU tiers are a step function, not a gradient — going from 299 to 301 unique monthly attendees means the same $99/mo bill (still under Basic's 300 cap) but crossing 300 jumps you to needing Standard's $499/mo (a 5x jump) unless you pay per-MAU overage instead. Model growth carefully against these thresholds.

---

## Cross-cutting gotchas

- **Per-participant-minute billing surprises** apply to LiveKit, Daily, Whereby, and 8x8's overage tier — a participant who leaves a tab open and connected (not just visually "in" the call) keeps accruing minutes. Idle-timeout/auto-disconnect logic matters at scale.
- **Livestream to a big audience should go through HLS/RTMP egress, not native WebRTC participation** — on LiveKit and Daily, a viewer watching via an HLS player is billed as encode-minutes (flat, independent of viewer count), not participant-minutes. Piping 200 "viewers" into a WebRTC room directly (rather than out via HLS) would multiply cost by 200x on any per-participant-minute provider — this is the single biggest cost trap in scenario [b] across every usage-based vendor.
- **Recording storage** is billed differently everywhere: LiveKit writes to your own cloud bucket (no LiveKit storage fee, but you own that bill and its egress costs); Daily and Whereby charge their own per-minute recording + separate storage fee; Zoom's cloud recording eats into a plan's included storage (10GB on Pro) before charging extra; 8x8 charges $0.01/min for recording with no free allotment.
- **Browser support** is not a differentiator in 2026 — all six run on current Chrome/Firefox/Edge/Safari via WebRTC.
- **Compliance features you don't need but pay for**: Whereby's HIPAA add-on ($16.99/mo) and Zoom/Google's higher compliance-oriented tiers (SSO, information barriers, in-domain-only streaming) are gated behind pricier plans that a two-customer launch doesn't need — easy to over-buy a tier for one compliance checkbox.

---

## Synthesis

**Is LiveKit Cloud the right single bet for both phases?** No, and the reason isn't cost — LiveKit Cloud's $50/mo Ship tier is cheap enough to cover *both* scenario [a] (≈$50/mo) and scenario [b] (≈$50–55/mo), comfortably beating every seat-licensed competitor at Year-1 scale. The reason is October's "zero build risk" constraint: LiveKit Cloud is infrastructure, not a product — there is no first-party hosted "click this link to join" page the way Zoom, Daily, Whereby, and even 8x8's raw Jitsi room links provide out of the box. Using LiveKit for October means building and deploying a join page in week one of a seven-week runway, which is precisely the risk October is trying to avoid. The honest answer is the two-path one: **mint links now with Daily.co or Whereby (both have purpose-built REST APIs, no seat costs, and October costs of $22–64/mo), and build the Phase 3 in-app embed on LiveKit Cloud** starting whenever engineering bandwidth opens after October — leaning on the founder's existing LiveKit experience to keep that a small (S) effort. The crossover point where LiveKit's flat $50/mo starts beating per-host-licensed products (Zoom, Google Workspace) arrives early — once more than roughly 3–4 concurrent facilitators are needed at once (~$50–70/mo in seats), which Year-1's 30 sessions/week already exceeds — so the cost case for eventually moving off per-seat products and onto LiveKit (or Daily, as a lower-effort fallback with similar Phase 3 capability) strengthens as the platform grows, independent of the October decision.
