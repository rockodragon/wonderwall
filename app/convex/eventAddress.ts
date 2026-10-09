// "Show the address only to people going" (events.hideAddress,
// docs/features/event-capacity-waitlist.md). Every query that hands an event
// to a client runs it through redactHiddenAddress unless the viewer is a
// host or going (events.ts get). Pure, so the event page can share the label.

type AddressParts = {
  street?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  zip?: string;
  country?: string;
  countryCode?: string;
};

export type AddressFields = {
  hideAddress?: boolean;
  tableId?: unknown;
  location?: string;
  venueAddress?: string;
  address?: AddressParts;
  coordinates?: { lat: number; lng: number };
  placeId?: string;
};

/** A Table's event follows its Table's own location rules, so the setting
 * is ignored there. */
export function addressIsHidden(e: Pick<AddressFields, "hideAddress" | "tableId">): boolean {
  return !!e.hideAddress && !e.tableId;
}

/** "Encinitas, CA": what anyone may see of a hidden address. Undefined
 * when the event has no city on file. */
export function publicPlace(e: Pick<AddressFields, "address">): string | undefined {
  const city = e.address?.city?.trim();
  if (!city) return undefined;
  const region = (e.address?.stateCode || e.address?.state)?.trim();
  return region ? `${city}, ${region}` : city;
}

/** The event as a visitor sees it: street, venue, map pin and place id
 * removed, the city kept, and `addressHidden` set so the page can say the
 * address goes to guests. An event without the setting comes back as is. */
export function redactHiddenAddress<T extends AddressFields>(e: T): T & { addressHidden?: true } {
  if (!addressIsHidden(e)) return e;
  const { address } = e;
  return {
    ...e,
    location: publicPlace(e),
    venueAddress: undefined,
    address: address
      ? { city: address.city, state: address.state, stateCode: address.stateCode, country: address.country, countryCode: address.countryCode }
      : undefined,
    coordinates: undefined,
    placeId: undefined,
    addressHidden: true,
  };
}

/** The location line a feed shows (shortlist, favorites, community page):
 * the city when the address is hidden. */
export function feedLocation(e: AddressFields): string | undefined {
  return addressIsHidden(e) ? publicPlace(e) : e.location;
}
