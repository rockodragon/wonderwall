# Native iPhone app: assessment and implementation strategy

Date: 2026-10-26. Status: proposal for review, not an accepted product specification.
Assessment: `wonderwall-e2k0`. Delivery epic: `wonderwall-jguo`.

## Recommendation

Build a React Native app with Expo, Expo Router and EAS, using the existing Convex backend and user identities. Introduce a lightweight pnpm workspace in stages. Keep the existing React Router website for public discovery, sharing, SEO and browser workflows. Build native screens for the member experience.

This is technically feasible. Convex is already the main business/data layer, and its React client supports React Native. The substantial new work is native UI, authentication/lifecycle integration, notifications, media handling and release operations. This is not a straightforward packaging of the website. No defensible reuse percentage or delivery date can be inferred from source inspection alone.

Working product assumption: first release covers discovery, event detail/free RSVP, conversations, notification inbox/push and basic profile/settings. Payment UI, host tools and administration are deferred pending scope decisions. Android should remain structurally possible, but iOS is the first validation/release target. Revisit this assumption before committing the feature build.

## Evidence and limits

Reviewed checkout: `/Users/rickmoy/code/wonderwall`, initially at source HEAD `0e5ac27ea0535a6efa0491ae7df9ea29e64d2fa5`, then reconciled with current `origin/main` at `3d9664f47db2c9b6f0b11db1993da30f3b883dd9` before publishing. Read-only reviews used the repository's BMAD Winston architect and Amelia senior developer personas, plus GitNexus and current official documentation. This assessment did not install Expo, execute a native build, inspect production data, verify credentials or test an iPhone. Evidence line references below come from the initial sweep and may shift slightly on main.

The GitNexus registry initially reported an old index. The initial local index matched the initial HEAD (11,840 nodes, 26,956 edges, 300 flows). After rebasing the planning branch, the separate `desktop-navigation-ui-a3e448` worktree's 12,316-node index matched current main; hotspot impact checks were repeated against that exact worktree path. Source changes relevant to this assessment were reviewed, including onboarding/names, directory pagination, profile sharing, notifications, messaging, branding and the drift guard. The recommendation is unchanged.

| Finding | Repository evidence | Architectural consequence |
|---|---|---|
| One web package, no Expo/EAS application | `app/package.json`; `app/pnpm-workspace.yaml` contains only build permissions | A workspace and native application must be introduced; the repository is not currently a multi-app workspace. |
| Client data fetching already uses Convex | `app/app/providers.tsx:6`; `app/react-router.config.ts:6` has SPA mode and public prerendering | Native can call the same APIs; public web delivery remains useful. |
| Existing phone components are DOM UI | `app/app/components/phone/TabStrip.tsx:12` and `:49` | Reuse interaction/design intent, not HTML/Tailwind component implementations. |
| Shared rules are in inconsistent locations | `app/convex/shortlist.ts:29`; `garden/allocations.ts:22`; `garden/operatorCounts.ts:19` import web modules | Put truly portable rules in an explicit shared package. Backend must ultimately not depend on the web application. |
| Some hand copies exist alongside those imports | `app/convex/garden/giving.ts:58`; `garden/capabilities.ts:214`; `garden/projectTeam.ts:33` | Remove real duplicated sources as their domains are migrated; avoid a third mobile copy. |
| Authentication has custom account-linking behavior | `app/convex/auth.ts`; `app/convex/authLinking.ts` | Preserve account identity and linking semantics; an auth-provider replacement would be a separate migration. |
| Native callback schemes are currently rejected | `app/convex/garden/brandHosts.ts:61`; `app/app/lib/oauthHost.ts:24` | Native OAuth requires an explicit, narrow callback design and regression tests. |
| Community/brand selection uses browser hostname | `app/app/lib/entryCommunity.ts:5`; `app/app/brand/brandConfig.ts:20` | Native needs explicit brand/community context, carried through links and login. |
| Notifications currently mean inbox plus optional email | `app/convex/notify.ts:22`; `app/convex/notifications.ts:105` | Device token registration and push delivery are new work. Existing links also need native routing. |
| Messaging pagination is only superficial | `app/convex/messaging.ts:345`, `:383`, `:458` | Conversations/all thread messages are collected before filtering/slicing. Profile and introduce bounded reads for launch-sized data. |
| Event browsing also collects before filtering | `app/convex/events.ts:263` | Evaluate query sizes and subscriptions before broad rollout; no backend rewrite follows from this finding. |
| Uploads already enforce metadata handling | `app/app/lib/uploadFile.ts:10`; `imageLocation.ts:30`, `:43`; `shrinkImage.ts:36` | Preserve the central upload policy, with a native file/picker adapter instead of browser canvas/object URLs. |
| Account-deletion statements disagree | `app/app/routes/faq.tsx:107` says contact support; `legal.privacy.tsx:158` says deletion is available in settings; source search found admin deletion only | Audit and implement a real member deletion/request flow before store release. |
| DRY checks only scan current web/backend roots | `app/test-support/driftGuard.test.ts:30` | Include mobile/shared roots in enforcement during workspace introduction. |
| Install/deploy assumptions are app-directory specific | `.github/workflows/test.yml:15` uses `npm install`; pnpm lockfile is tracked; package-lock is ignored | Pin one manager, use frozen installs and update CI/build-root assumptions together. |

Current-main additions strengthen reuse opportunities: `goesToOnboarding` already composes `hasRealName`, `isShownProject` centralizes project visibility, and `useDirectory`/`directoryRules`/`directoryPage` provide an existing directory paging policy. Reuse those decisions rather than rebuilding them on mobile; still profile actual backend work rather than assuming page-shaped output guarantees bounded reads. New profile sharing has portable URL/QR-grid logic but browser canvas image export (`storyImage.ts`), so native sharing needs a separate rendering/transport adapter. `GARDEN_ORIGIN` now centralizes the Garden's canonical sharing origin; build native links on that authority rather than introducing another hardcoded domain.

The local UpSight project confirms the remembered approach: `packages/mobile/package.json` uses Expo/React Native and `packages/mobile/eas.json` defines an internal preview build. However, its root workspace explicitly excludes mobile because it uses React 18/RN 0.76 while web uses React 19. Its README also records missing device validation. Reuse release conventions and lessons, not its old dependency versions, Supabase identity layer or unverified implementation wholesale.

## Choices considered

| Option | Benefit | Cost / fit |
|---|---|---|
| Expo native app + current web + Convex | Native UI/device integration; shared TypeScript contracts and backend | Recommended. Two renderers and release pipelines need explicit boundaries. |
| Rewrite web and native as one universal Expo app | Potentially more shared UI later | Large unrelated web/SEO/navigation migration; delays learning whether the native product is useful. Reconsider only after real native usage. |
| Swift native app + Convex | Deep Apple integration | Less TypeScript/client behavior reuse and a separate skill/tooling surface. Consider if a later requirement demands native Apple APIs beyond practical Expo integration. |
| Web wrapper / PWA | Smaller initial change | Does not satisfy the intended native member experience; limited basis for native interaction quality. |
| Separate mobile repository | Independent delivery | Extra contract/version coordination. Feasible, but unnecessary when the same team owns both clients and backend. |

A monorepo is recommended for ownership and coordinated changes, not required by Expo or Convex. Start with package-manager workspaces; add Turbo/Nx only if measured task scheduling/cache needs justify it.

## Package strategy and DRY boundaries

First workspace shape, intentionally preserving deployed paths:

```text
/
  package.json                 private workspace orchestration; pinned packageManager
  pnpm-workspace.yaml          app, apps/mobile, packages/*
  pnpm-lock.yaml               one authoritative lockfile
  app/                        existing web package, build root retained initially
    app/                      React Router + DOM UI
    convex/                   single backend, schema, auth and codegen owner
  apps/mobile/                Expo Router + native components/adapters + eas.json
  packages/domain/            audited pure rules and shared display/error helpers
  packages/convex-client/     narrow generated API reference/type bridge
  packages/design-tokens/      only when tokens are consumed by both renderers
```

The client bridge is a proposal to prove in the packaging spike. It re-exports the existing generated public `api` references and type-only `Id`/`Doc` contracts; it does not own another schema or generate a second backend. Restrict exports to named client entry points. Do not export `internal`, server handlers, Stripe, Resend, auth callbacks or a barrel over `convex/`. API typing is not authorization: every endpoint still enforces permissions server-side. Inspect an actual Metro release bundle to confirm server implementations and secrets are unreachable.

The likely eventual shape is `apps/web`, `apps/mobile`, `packages/backend` and the shared packages above. Do not move web/backend directories during the first native scaffold. A later mechanical move must account for codegen paths, Convex CLI configuration, Cloudflare build root/output, scripts, fixtures, aliases, drift guards and CI. The initial tree is a useful supported state, not a promise that every folder must eventually move.

Dependency rules:

1. Backend and both clients may depend on `domain`; `domain` cannot depend on either application or server runtime. Keep it React-free and free of DOM/Node/browser storage APIs. Separate transport-specific helpers if they introduce framework dependencies.
2. Web and native share generated API/types, pure validation/formatting, identifiers, filters, event rules, rich-content models and error decoding when both need them. Candidates include `convexError.ts`, `stage.ts`, `phone.ts`, shortlist model/types and existing rich-text/video pure sources. Audit each import closure; a pure function living in a server file is not automatically safe to import.
3. All authorization, entitlements, capacity, visibility, payments and persisted mutations remain authoritative in Convex. Existing helpers such as `requireEventHost`, `requireOwner`, `requireOperator`, image resolvers, block helpers and community lookup stay the single backend path. Shared client rules improve UX; they do not grant access.
4. Renderers own their UI. Native `PersonAvatar`/`OrgLogo` equivalents can share image contracts and token data without trying to render the current DOM components. Share color/type/spacing data as needed; adapt text metrics and touch targets per platform.
5. Split browser effects from reusable workflows when the second consumer exists. `useStartConversation` and `useSignOut` currently mix mutations with React Router/PostHog. Use narrow adapters or injected effects, preserving one workflow/error policy. Do not build a universal component framework in anticipation of reuse.
6. Prefer direct typed Convex hooks to a generic repository/API abstraction or duplicate server-state cache. Add a shared hook only when it owns behavior that would otherwise drift. Shared React packages use compatible peer dependencies, never their own bundled React runtime.
7. Extend the drift guard and import-boundary checks to all new roots. Preserve or lower existing duplication limits. Compatibility re-exports are acceptable during extraction; mirrored implementations are not.

GitNexus on the current-main index identifies two migration hotspots: `resolveStage` has **11 direct dependents, 26 affected symbols and 5 affected process groups**, rated **CRITICAL**; `insertNotification` has **26 direct dependents, 37 affected symbols and 18 affected process groups**, also **CRITICAL**. Extract/extend these in small changes with compatibility shims and affected-flow regression coverage. `allowedAuthRedirect` returned a partial LOW/zero result on the initial index, but `context` and source show the auth callback calls it: that zero is not proof of isolation. No runtime symbols were edited for this assessment.

## Platform work that cannot be skipped

### Identity and links

Keep Convex Auth for the first feasibility slice. The installed library explicitly supports a React Native custom-storage adapter and returns OAuth redirect data on native. Use SecureStore through the provider's storage interface; do not copy browser localStorage logic. Validate restart, refresh, logout, account switching and storage failure on device. Current web dependencies are React 19.2.x; select Expo's supported React/RN pair and align web/shared React dependencies deliberately. Do not force incompatible native peer versions to make installation pass.

Prove email/phone OTP or password sign-in first, then the exact provider paths intended for launch. Existing Google account linking must still reach the same user/profile. Evaluate Apple private-relay identities and duplicate-account linking separately. OAuth involves two distinct returns: provider to Convex HTTP callback, then Convex to the app. Use the supported browser-session/code exchange and exact approved app callback(s), with explicit dev/preview/production identity separation. Retain state/verifier protections and rejection of untrusted URLs.

Define one canonical public HTTPS URL mapping for profiles, projects, events, Tables, invites and conversations where applicable. Public links must retain a useful website fallback. Configure universal links/associated domains on owned hosts and exact internal auth routes; preserve intended destination/community through login and onboarding. Native screens resolve links to IDs through existing server rules; arbitrary notification URLs or URL community IDs are not authorization.

Decide whether the store app is the platform, The Garden, or another branded community. Prefer one app with explicit community selection unless a concrete distribution requirement calls for more binaries. Honor the accepted Tables ADR: Table membership and Event attendance remain distinct; avoid porting legacy Offering flows as a new native domain model.

### Notifications and app lifecycle

Reuse `insertNotification` as the notification creation authority, adding asynchronous delivery behind a compatible interface. Store device installations separately from people: user ownership, token, platform, environment/project and enabled state; support rotation, multiple devices and logout/account switching. Respect delivery preferences, blocks and privacy; use minimal lock-screen payloads. Check receipts, retire invalid tokens, retry transient failures with bounded backoff, and deduplicate using a notification/delivery identity. Push failure must not roll back the inbox event or core mutation. Delivery is best effort; the authenticated inbox remains authoritative.

Convex live subscriptions do not provide background execution or push. Test cold/warm notification taps, foreground refresh, network loss, session expiry and reconnect. Start online-first with explicit offline/retry states. Durable offline writes, conflict resolution and background uploads are separately scoped capabilities, not assumptions supplied by Convex. Avoid replaying RSVP/payment/message mutations blindly after uncertain responses.

### Media, performance and native presentation

Adapt picker URIs, byte reading, resize/compression, progress and cancellation to Expo APIs. Preserve the existing best-effort GPS removal policy, and decide explicitly whether unreadable metadata should block upload; current code passes unknown formats through. Validate real HEIC/JPEG orientation, Live Photo selection behavior, EXIF/XMP, large-file memory and storage ownership/size/MIME enforcement. Reuse byte-level logic only after testing native runtime support. Rich content needs a native renderer over the same content model; browser textarea/selection editing, iframe and canvas implementations cannot simply be imported.

Profile event lists, conversation lists and long threads at a realistic data volume. Replace collect-then-slice with indexed, bounded queries where required; preserve old endpoint payloads for installed clients. Measure screen startup, payload sizes and reconnect behavior on a real phone/network. Use appropriate native lists, keyboard handling, safe areas, accessible text scaling, touch targets and permission-denied alternatives. Verify analytics/crash tooling with a native SDK and shared event names rather than importing PostHog's browser provider.

### App Store and payment decisions

Apple's guidelines require UGC safeguards, in-app account deletion initiation, and an equivalent privacy-preserving login option when applicable to third-party sign-in. Audit reporting, blocking, filtering/contact operations and deletion effects on content, ownership, sessions and retained financial records. Existing block/report work should be reused, not assumed complete. [Apple guidelines](https://developer.apple.com/app-store/review/guidelines/)

Classify every paid product before implementing native checkout: digital access/membership, in-person events, one-to-one services, project backing and charitable fundraising have different rules. Digital purchases may require IAP; external-payment permissions vary by storefront and product. Nonprofit fundraising has approval conditions; a platform fee complicates relying on the personal-gift exception. Existing Stripe checkout and web return URLs do not settle these questions. Record the launch storefronts and permitted flows; omitting purchase controls is a scope choice requiring review, not an automatic compliance exemption. [Apple payment rules](https://developer.apple.com/app-store/review/guidelines/#business)

If IAP is required, keep entitlement ownership in Convex and design verified store events, restore/refunds and duplicate subscription prevention alongside existing Stripe memberships. Select a store integration only after that decision. Link this work to existing Stripe/payout decisions rather than silently inventing a second ledger.

## Build, environments and release contracts

Use Expo's current stable starter and standard Metro configuration at implementation time; pin the validated dependency set. The reviewed setup guide presently shows an SDK 58 starter, but no SDK compatibility was tested here. Start with normal workspace support, not copied legacy Metro watch-folder patches. Validate isolated pnpm dependencies first; hoisting is a measured fallback for an identified library issue.

Use development builds with `expo-dev-client` for native integration, an internal preview profile, and a production/TestFlight profile. Keep EAS configuration in `apps/mobile`, run EAS from that directory, and include required workspace packages in build uploads. Define Expo project ownership, Apple developer team, bundle IDs, signing credentials, associated domains, push credentials, privacy descriptions and store metadata. Organization account ownership and available credentials remain unverified.

Map each EAS profile explicitly to the intended Convex deployment and public app configuration. `EXPO_PUBLIC_*` values are bundled and public; backend/admin/provider secrets stay server-side. Remove reliance on the web build script's production URL fallback for native preview builds. Test dev and preview cannot create production data. Configure Cloudflare's root install versus web build directory deliberately when promoting the root lockfile.

CI should use a pinned Node/package manager and frozen root lockfile, with package-level typechecks, shared/backend tests, native component tests, a Metro iOS release export/bundle check and existing web build/Playwright checks. Run a real signed device smoke flow and EAS preview before claiming native readiness; add a repeatable simulator/device flow (for example Maestro) for the core member path. Generated API/codegen drift and forbidden imports must fail CI. Shared/backend changes should trigger both clients' relevant checks.

Mobile binaries remain installed while Convex changes. Use additive optional fields/endpoints, expand/migrate/contract data changes, explicit support windows and contract fixtures for at least the current and previous supported client. Add a minimum-supported-version gate only with an owned forced-upgrade policy. Deploy compatible backend changes before dependent clients. Keep client capabilities/defaults explicit; don't assume generated types update already-installed apps.

EAS Update is optional after binary delivery works. Separate preview/production channels, use a deliberate runtime-version policy (evaluate fingerprint), stage rollouts and retain rollback/runbook ownership. OTA compatibility covers JS/native code compatibility, not backend contract compatibility; native module/entitlement changes require a new build. No EAS configuration or deployment was changed in this assessment.

## Execution plan and decision gates

| Stage | Concrete work | Exit evidence |
|---|---|---|
| 0: Resolve scope and prove the risky integrations | Confirm app brand/MVP/storefronts; current baseline; auth + secure storage/callback spike; workspace/API bridge/React compatibility spike; payment and deletion/moderation decisions | Written decisions, real iPhone auth/cold launch, Metro bundle with no server closure, reproducible clean install/build. Unknown credentials are surfaced early. |
| 1: Workspace foundation | Root pnpm orchestration/lockfile; keep `app/`; shared domain/client exports; expand drift/import guards; update CI/Cloudflare install assumptions | Existing web behavior passes, codegen is reproducible, native preview builds, neither consumer deep-imports the other app. |
| 2: One end-to-end native slice | Sign in -> current profile/onboarding -> event detail/free RSVP; useful deep link; cross-client sync | Same existing user/profile; native write visible on web; authorization/blocked/capacity refusals readable; foreground/network recovery; signed-out destination restored exactly once. |
| 3: Member beta | Discovery, messaging/inbox, push, basic profile, media if in scope; bounded queries; reporting/blocking/deletion; native analytics/crash coverage | Multiple-device push/logout tests; real HEIC upload if enabled; long-thread/large-list tests; accessibility/keyboard checks; old-client compatibility tests. |
| 4: TestFlight and store release | Store/account assets, support/moderation ownership, privacy declarations, reviewer access, payment decision enforcement, staged rollout/rollback | Signed reviewed candidate works on real supported iPhones; production smoke, monitoring and support process are owned. |

Planning estimate, not a commitment: timebox initial spikes to roughly 3–5 engineer-days, then re-estimate from the working slice. A focused companion beta may be a 6–10 engineer-week effort for an experienced developer with shared product/design support; payments, full web parity, missing moderation/deletion infrastructure or difficult identity issues can materially expand it. Store review and external account/payment decisions add calendar uncertainty. Do not interpret EAS availability as a short build-time estimate for the product.

Dependencies and concrete acceptance criteria live in the linked Beads epic. Reuse existing safety and payment issues rather than duplicating their implementations. The first implementation PR should prove package/auth feasibility and preserve the web app; do not start with a repository-wide move.

| Bead | Deliverable | Prerequisites |
|---|---|---|
| `wonderwall-jguo.1` | Brand, MVP, storefront and purchase-policy decisions | Product review; references existing Stripe/entity decisions |
| `wonderwall-jguo.2` | Expo/auth/API bridge/EAS device feasibility spike | Can start with explicit preview assumptions |
| `wonderwall-jguo.3` | Workspace, shared boundaries and CI foundation | `.2` |
| `wonderwall-jguo.4` | Auth -> profile -> event/free-RSVP vertical slice | `.1`, `.3` |
| `wonderwall-jguo.5` | Bounded messaging/event query readiness | Can proceed alongside feasibility |
| `wonderwall-jguo.6` | Member beta, push, media/settings and safety integration | `.4`, `.5` |
| `wonderwall-jguo.7` | Compatibility policy, TestFlight and store release gates | `.6`, existing report/moderation `wonderwall-33yf.1` and block-visibility `wonderwall-33yf.4` |

The assessment deliverable is complete when this proposal and backlog are reviewed and saved; the delivery epic remains open until its implementation and release evidence exist.

## Questions to investigate deeper

1. Which brand/community and primary member job justify the first iPhone app? Is Android a launch requirement or a later target?
2. Which exact authentication methods ship, how does Apple private relay link to existing users, and who controls production/preview callback domains and Apple credentials?
3. Which paid products and storefronts are included, and what purchase/entitlement rules apply to each? Are current Stripe/entity decisions ready to support those flows?
4. Which queries become costly at expected membership/message volume? What are target launch data sizes, supported iPhones and network expectations?
5. What happens to owned projects/Tables, messages, payout obligations and auth identities on account deletion? Who handles reports and moderation response?
6. Does the generated client bridge bundle and typecheck cleanly without runtime backend imports in both Vite and Metro? Can Expo's validated React version also support current web dependencies?
7. How much offline behavior and background media transfer is actually required? These change complexity substantially.
8. What installed-client support window, rollback owner, release cadence and native maintenance capacity can the team sustain?

## Official references checked

- [Convex React Native client](https://docs.convex.dev/client/react-native): uses the Convex React client; no separate backend API layer is required for basic native access.
- [Convex Auth React API](https://labs.convex.dev/auth/api_reference/react): custom token storage is required on native, with Expo router/code-handling hooks.
- [Convex OAuth](https://labs.convex.dev/auth/config/oauth): provider callback goes to the Convex HTTP endpoint; app return handling is separate.
- [Expo workspaces/monorepos](https://docs.expo.dev/guides/monorepos/): automatic Metro workspace configuration, isolated dependency support, and React/native-module duplication constraints.
- [EAS monorepo builds](https://docs.expo.dev/build-reference/build-with-monorepos/): app-directory EAS commands/config and shared build dependencies.
- [EAS build setup](https://docs.expo.dev/build/setup/): starter, development builds and binary build workflow.
- [Expo push delivery](https://docs.expo.dev/push-notifications/sending-notifications/): server dispatch, receipts, retries and token errors.
- [EAS runtime versions](https://docs.expo.dev/eas-update/runtime-versions/): native/update compatibility and new-binary requirements.
- [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/): product-specific store review gates described above; recheck at submission.
