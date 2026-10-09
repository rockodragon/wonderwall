# Event limit, waitlist, hidden address, "Can't make it"

Written 2026-10-08. Rick asked for the four Luma-style basics after the PayPal
ticket links (same PR). Modeled on Luma: the host lets people in from the
waitlist; nothing moves up on its own.

## Event limit (`events.capacity`)

- The host sets "Limit" in the event form (Tickets row). Empty = no limit.
- Counts what `events.ts loadGoingCount` counts: accepted requests, RSVPs
  (each RSVP's ticket count), paid on-site tickets. One person once.
- An RSVP made through a PayPal event's Get tickets counts as going. It holds
  a spot even though we can't see the payment.
- Enforced on the server for everything this site takes:
  - RSVP (`garden/eventRsvps.ts rsvpToEvent`), Join and Apply (`events.ts apply`),
  - PayPal Get tickets (`startPayPalTicket`),
  - on-site tickets (`getEventForTicketCheckout`, before the Stripe checkout opens).
- NOT enforced on a Stripe Payment Link or any other ticket link: those sell
  from their own stock. Set the same limit there. (No competitor solves this;
  Partiful bans linking out for that reason.)
- Table events ignore it: a Table has chairs (`tablePolicy.ts`).
- Someone already going is never refused (pressing again, a second purchase).
- The host can let people in past the limit from the waitlist.

## Waitlist (`events.waitlist`, table `eventWaitlist`)

- On by default once there's a limit. The host can turn it off; then a full
  event just says Full.
- Full event + waitlist on: the event card says "Join the waitlist". It needs an
  account, same as an RSVP (signed-out visitors get the emailed code first).
- On the waitlist: the card says so, with "Leave the waitlist".
- Host: Guests tab, "Waitlist" filter, oldest first, each with "Let in" and
  "Remove". Let in makes an RSVP (`upsertEventRsvp`), deletes the waitlist row,
  and notifies the person (in-app + email): "You're in".
- A PayPal event: being let in puts them on the list; the event page then shows
  "Pay on PayPal". They still pay the organizer on PayPal.
- An on-site ticket event: the waitlist is for the free RSVP next to the
  tickets. Sold-out tiers stay sold out.
- No automatic moving up, no timed offers (Posh/Eventbrite do that; later).
- A spot that opens is open to anyone. The host is told when someone can't make
  it and how many are waiting.

## Hidden address (`events.hideAddress`)

- Event form checkbox: "Show the address only to people going".
- Full address (location, street, zip, map pin, place id) shows to: the
  organizer, co-hosts, admins, and anyone going (accepted request, RSVP, paid
  ticket). Everyone else sees the city and "Address shared with guests".
- Done on the server (`events.ts redactHiddenAddress`) in every query that
  returns an event: get, list, search, and the community/desk/shortlist feeds.
  Lists always show the city only (cards don't need the street).
- The calendar file and Google Calendar link use whatever the page has, so a
  visitor's calendar entry has the city; a guest's has the address.
- Reminder emails go only to people going, so they can carry the address.

## "Can't make it" (`garden/eventRsvps.ts cancelMyRsvp`)

- Shown to anyone going (RSVP, accepted request) and anyone waiting (request
  pending, waitlist).
- Free RSVP or a PayPal "Sent to PayPal" RSVP: the row is deleted. Requests
  (pending or accepted) are deleted, so they can ask again later.
- Paid tickets (on-site or Stripe link): not cancelled here. "Paid tickets:
  ask the host." The money is a record.
- The organizer gets an in-app note: "Ana can't make it to …", plus "3 on the
  waitlist" when anyone is waiting. For a PayPal RSVP it is also emailed: they
  may need to refund on PayPal.

## Not in this batch

Custom questions (spec: `docs/features/event-questions.md`), +1s on free
RSVPs, check-in/QR, timed waitlist offers, auto-promote, ticket transfer.
