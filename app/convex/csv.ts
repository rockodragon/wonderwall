// The one CSV cell escaper, for every CSV we hand out (an event's guest
// list, the crawler's lead export). Pure, so pages can import it too.

/** One CSV cell. A missing value is blank. A value with a comma, a quote or
 * a line break (\n or \r) is wrapped in quotes with its quotes doubled, so a
 * spreadsheet keeps it in one cell. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
