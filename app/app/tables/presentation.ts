/** Display-only Table helpers. Authorization always comes from the server. */
export type TableSummary = {
  _id: string;
  name: string;
  slug: string;
  format?: string;
  topic?: string;
  program?: string;
  blurb?: string;
  photoUrl?: string;
  hostName?: string;
  host?: { name: string; userId?: string } | null;
  hostLabel?: string;
  scheduleType?: string;
  membershipRequired?: boolean;
  priceCents?: number;
  currency?: string;
  capacity?: number;
  memberCount: number;
  spotsRemaining?: number | null;
  nextEventAt?: number;
  nextSessionAt?: number;
  nextEvent?: {
    id: string;
    title: string;
    datetime: number;
    endTime?: number;
    location?: string;
    locationType?: string;
  } | null;
  isOnline?: boolean;
  location?: string;
  community?: { name: string; slug: string } | null;
};

export function tablePrice(
  table: Pick<TableSummary, "priceCents" | "currency" | "membershipRequired">,
) {
  const price = table.priceCents
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: table.currency ?? "USD",
        maximumFractionDigits: 2,
      }).format(table.priceCents / 100)
    : "Free";
  return table.membershipRequired
    ? table.priceCents
      ? `Membership + ${price} one time`
      : "Included with membership"
    : table.priceCents
      ? `${price} one time`
      : price;
}

export function tableBadge(
  table: Pick<TableSummary, "scheduleType" | "format">,
) {
  if (table.scheduleType === "series") return "Series";
  if (table.scheduleType === "one_time") return "One time";
  return table.format || "Table";
}

/** "Hosted by", in the host's own title: an Instructor's Table is "Taught
 *  by". Older Tables stored the phrase itself ("Hosted by"), which stays. */
const BY_TITLE: Record<string, string> = {
  host: "Hosted by",
  instructor: "Taught by",
  facilitator: "Facilitated by",
  guide: "Guided by",
  convener: "Convened by",
};
export function hostedByWords(label: string | undefined): string {
  const title = (label ?? "").trim();
  if (/\sby$/i.test(title)) return title;
  return BY_TITLE[title.toLowerCase()] ?? "Hosted by";
}

/** Where someone stands, as a host reads it on their list. */
export function rosterStatusWords(
  person: { status: string; role: string; paymentStatus: string },
  paid: boolean,
): string {
  if (person.role === "host") return "Host";
  if (person.role === "co_host") return "Co-host";
  if (person.status === "pending") return "Asked to join";
  if (!paid) return "Joined";
  if (person.paymentStatus === "confirmed") return "Paid";
  if (person.paymentStatus === "external_unverified") return "Signed up on your page";
  return "Accepted · hasn't paid";
}

/** Ten fixed segments communicate rough fullness, never individual seats. */
export function fullnessSegments(memberCount: number, capacity?: number) {
  if (!capacity || capacity < 1) return 0;
  return Math.max(0, Math.min(10, Math.round((memberCount / capacity) * 10)));
}

export type TableFilters = {
  search: string;
  topic: string;
  free: boolean;
  online: boolean;
  month: boolean;
  location: string;
  community: string;
};
export function filterTables(
  tables: readonly TableSummary[],
  filters: TableFilters,
  now: number,
) {
  const start = new Date(now);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1).getTime();
  const search = filters.search.trim().toLowerCase();
  return tables.filter((table) => {
    const when =
      table.nextEvent?.datetime ?? table.nextEventAt ?? table.nextSessionAt;
    return (
      (!search ||
        [
          table.name,
          table.topic ?? table.format,
          table.host?.name ?? table.hostName,
          table.community?.name,
          table.blurb,
        ].some((value) => value?.toLowerCase().includes(search))) &&
      (filters.topic === "All" ||
        (table.topic ?? table.format) === filters.topic) &&
      (!filters.free || !table.priceCents) &&
      (!filters.online ||
        table.isOnline === true ||
        table.nextEvent?.locationType === "online") &&
      (!filters.month || (when !== undefined && when >= now && when < end)) &&
      (!filters.location ||
        (table.nextEvent?.location ?? table.location)
          ?.toLowerCase()
          .includes(filters.location.toLowerCase())) &&
      (filters.community === "all" ||
        table.community?.slug === filters.community)
    );
  });
}
