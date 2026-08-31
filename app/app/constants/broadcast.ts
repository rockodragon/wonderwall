// The Exchange's own YouTube channel — the default place a public event is
// streamed when the organizer doesn't bring their own link.
//
// Why the /live path and not a per-stream watch URL: a channel's /live URL
// permanently redirects to whatever that channel is streaming right now. It
// can be set on an event weeks ahead, survives the stream being rescheduled
// or recreated, and never needs repasting — which is exactly the property
// docs/gated-event-video-prd.md's join proxy is built around. A watch URL
// (youtube.com/watch?v=...) is minted per broadcast and would go stale.
//
// YouTube also archives a finished livestream at its watch URL, so after the
// event the organizer can paste that as the recording (see postEventRecording)
// while this stays the forward-looking "join" link.
export const YOUTUBE_CHANNEL_URL = "https://www.youtube.com/@creatives.exchange";

/** Always resolves to the channel's current live broadcast. */
export const YOUTUBE_LIVE_URL = `${YOUTUBE_CHANNEL_URL}/live`;

/** Label for the one-click affordance that fills this in as a meeting link. */
export const YOUTUBE_LIVE_LABEL = "Use our YouTube Live";
