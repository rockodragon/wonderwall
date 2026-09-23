// The Support form on /story/:slug — what has to be filled in before it can
// hand off to Stripe. Pulled out of the route so the rules can be tested.
//
// Three shapes:
//   - signed in: an amount is enough (their profile names them).
//   - signed out, once: an amount, and a name unless they stay anonymous.
//   - signed out, monthly: monthly needs an account (Rick, 2026-09-18), so
//     the form makes one on the spot — name, email, password. The server
//     refuses a signed-out monthly backing either way (guestBackingRefusal
//     in convex/garden/stripeHandlers.ts).

/** @convex-dev/auth's Password provider rejects anything shorter
    (validateDefaultPasswordRequirements). Checked here so the backer is
    told why instead of getting a generic failure from the server. */
export const MIN_PASSWORD_LENGTH = 8;

// Deliberately loose: the only thing worth catching here is a typo with no
// @ or no dot. Stripe and the sign-in flow are the real checks.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SupportFormFields = {
  amountCents: number;
  minCents: number;
  signedIn: boolean;
  monthly: boolean;
  anonymous: boolean;
  name: string;
  email: string;
  password: string;
};

/** True when this submit has to create an account before checkout. */
export function needsAccount(fields: { signedIn: boolean; monthly: boolean }): boolean {
  return !fields.signedIn && fields.monthly;
}

/** The first thing stopping this form from going to checkout, or null when
    it's ready. One message at a time — the backer fixes it and moves on. */
export function supportFormProblem(f: SupportFormFields): string | null {
  if (!Number.isFinite(f.amountCents) || f.amountCents < f.minCents) {
    return `The smallest amount is $${(f.minCents / 100).toFixed(0)}.`;
  }
  if (f.signedIn) return null;

  if (needsAccount(f)) {
    // The name goes on their account, so an anonymous monthly backer still
    // gives one — "anonymous" is about this page, not about who they are.
    if (!f.name.trim()) return "Add your name for your account.";
    if (!EMAIL_SHAPE.test(f.email.trim())) return "Add an email you can sign in with.";
    if (f.password.length < MIN_PASSWORD_LENGTH) {
      return `Use a password of ${MIN_PASSWORD_LENGTH} characters or more.`;
    }
    return null;
  }

  if (!f.anonymous && !f.name.trim()) return "Add your name, or check the box to stay anonymous.";
  return null;
}
