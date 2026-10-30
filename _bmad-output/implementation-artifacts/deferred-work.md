- source_spec: `_bmad-output/implementation-artifacts/spec-public-project-pages.md`
  summary: Test that Cheer and Back this on the project page and /projects cards actually route through supportDetour (click wiring).
  evidence: Mutating either call site left the suite green; tests render with renderToString in a node environment, so a click test needs a DOM setup the repo lacks.
- source_spec: `_bmad-output/implementation-artifacts/spec-public-project-pages.md`
  summary: getProject still sends nonprofitName, benefitsNonprofit, supportPaymentLinkUrl and statusBeforeHidden to every caller.
  evidence: Pre-existing (getProject had no auth check before); the nonprofit card is owner-only on the page, but the payload is public.
- source_spec: `_bmad-output/implementation-artifacts/spec-public-project-pages.md`
  summary: FavoriteButton has no signed-out handling, so hearts on public event pages fail for visitors.
  evidence: Pre-existing on event.tsx and EventCard; impact analysis rates FavoriteButton CRITICAL, so it needs its own change.
- source_spec: `_bmad-output/implementation-artifacts/spec-public-project-pages.md`
  summary: Give shareable project pages a per-project title and link preview (like functions/events/[id].ts), and link /opportunities cards to the now-public project pages.
  evidence: projects.$id.tsx meta is noindex with one generic title; opportunities.tsx:24 says there is no public project page.
- source_spec: `_bmad-output/implementation-artifacts/spec-public-project-pages.md`
  summary: Carry the owner's invite on shared project links so a visitor's sign-up detour doesn't dead-end at the invite-only signup.
  evidence: signup.tsx refuses without an invite code; affects every join CTA, not only this change.
- source_spec: `_bmad-output/implementation-artifacts/spec-public-project-pages.md`
  summary: Replay the action a visitor tapped (Cheer, Follow, Ask to join) after they sign up, not just the page.
  evidence: Detours return to the page only, so the visitor taps again; shareProjectHref already carries an action (?new=project).
- source_spec: `_bmad-output/implementation-artifacts/spec-fix-message-notify-email-text.md`
  summary: Before switching message texts on (setMessageTexts), send them from their own Telnyx number enforced in code, record STOP/START from an inbound webhook, add consent and Settings/privacy copy, store Telnyx ids with a delivery-status webhook, add quiet hours, keep texts within one GSM-7 segment, harden the sender-name filter (fullwidth dots, IPs, phone numbers), add a lease for stuck rows, count the cap without take(100), delete text rows with accounts, and show texts to operators.
  evidence: Two review passes found these on the text path; texts ship off by human decision until a separate number exists, so none of them can happen yet.
- source_spec: `_bmad-output/implementation-artifacts/spec-fix-message-notify-email-text.md`
  summary: Any standard email (likes digest, nudge) cancels host announcements and event reminders to the same person for 24h under the contact cooldown.
  evidence: Pre-existing since 88bf36f: announcements are "standard" (announcements.ts:670) and claimForDispatch cancels them on contact_cooldown with no retry.
- source_spec: `_bmad-output/implementation-artifacts/spec-fix-message-notify-email-text.md`
  summary: Track email opens and text delivery receipts, so "was it received" has an answer for every channel.
  evidence: Asked by the human on 2026-10-30; Resend open events aren't handled (resendWebhook.ts:94) and there is no Telnyx status webhook.
