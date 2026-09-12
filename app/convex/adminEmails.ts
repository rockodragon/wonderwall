/**
 * The standing admin group. Listed here rather than only as data (a
 * profiles.isAdmin flag someone toggled once) so the group is visible in
 * a diff and re-derivable: auth.ts grants isAdmin automatically to any of
 * these emails at signup, and admin.ts's syncAdminGroup mutation backfills
 * it — and generates each admin's waitlist-approval code — for accounts
 * that already existed when this list changed. Edit this array and re-run
 * syncAdminGroup (button on /admin) to add or grow the group; removing an
 * email here does NOT revoke existing admin access, since neither hook
 * ever un-sets isAdmin — do that by hand via admin.ts's setAdminStatus.
 */
export const ADMIN_EMAILS = [
  "rickmoy@gmail.com",
  "haley@thetableartsociety.com",
  "patricia@cistrategies.org",
  "david@abidingpractice.com",
] as const;

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return (ADMIN_EMAILS as readonly string[]).includes(email.toLowerCase());
}
