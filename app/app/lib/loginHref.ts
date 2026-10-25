// The sign-in page, with the way back. login.tsx reads ?redirect= and, after
// sign-in or sign-up, returns the person to it (a same-origin path only;
// signup.tsx keeps it as the pending intent, lib/pendingIntent.ts). The one
// way to write the link, so every Sign in on a public page comes back to the
// same place.

export function loginHref(returnTo: string): string {
  return `/login?redirect=${encodeURIComponent(returnTo)}`;
}
