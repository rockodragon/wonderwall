import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Link, useNavigate, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TableCard } from "../tables/TableCard";
import { tableEventInput } from "../tables/eventInput";
import "../tables/tables.css";

export function meta() {
  return [{ title: "Set a Table — Creative Exchange" }];
}
export function ErrorBoundary() {
  useRouteError();
  return (
    <main className="tables-page">
      <h1 className="tables-heading">Set a Table</h1>
      <p role="alert" className="tables-error">
        We couldn't load the creation form. Refresh to try again.
      </p>
    </main>
  );
}

export default function NewTablePage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();
  const createTable = useMutation(api.garden.tables.createTable);
  const [hostOrgId, setHostOrgId] = useState<Id<"hostOrgs"> | undefined>();
  const policy = useQuery(
    api.garden.tables.getCreatorPolicy,
    isAuthenticated ? { hostOrgId } : "skip",
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState("Community");
  const [photoUrl, setPhotoUrl] = useState("");
  const [hostRoleLabel, setHostRoleLabel] = useState("Host");
  const [scheduleType, setScheduleType] = useState<"one_time" | "series">(
    "one_time",
  );
  const [pricingType, setPricingType] = useState<"free" | "fixed">("free");
  const [price, setPrice] = useState("");
  const [capacity, setCapacity] = useState("12");
  const [membershipRequired, setMembershipRequired] = useState(false);
  const [access, setAccess] = useState<"open" | "approval">("open");
  const [allowsExternalGuests, setAllowsExternalGuests] = useState(false);
  const [locationType, setLocationType] = useState<"in_person" | "online">(
    "in_person",
  );
  const [location, setLocation] = useState("");
  const [events, setEvents] = useState([
    { title: "", date: "", duration: "90" },
  ]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const canCommercial = policy?.canCreatePaidOrSeries === true;
  const invalidPolicy =
    (scheduleType === "series" || pricingType === "fixed") && !canCommercial;
  const selectedCommunity = policy?.communities.find(
    (community) => community._id === hostOrgId,
  );
  const updateEvent = (
    index: number,
    field: "title" | "date" | "duration",
    value: string,
  ) =>
    setEvents((current) =>
      current.map((event, i) =>
        i === index ? { ...event, [field]: value } : event,
      ),
    );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (invalidPolicy) {
      setError(
        "Charging money or hosting a series requires membership in the selected community.",
      );
      return;
    }
    if (membershipRequired && !hostOrgId) {
      setError("Choose a community for a members-only Table.");
      return;
    }
    const priceCents = Math.round(Number(price) * 100);
    if (
      pricingType === "fixed" &&
      (!Number.isFinite(priceCents) ||
        priceCents < 100 ||
        priceCents > 1_000_000)
    ) {
      setError("Enter a fixed price from $1 to $10,000.");
      return;
    }
    setPending(true);
    try {
      const prepared = events
        .slice(0, scheduleType === "one_time" ? 1 : events.length)
        .map((session, index) =>
          tableEventInput(
            {
              ...session,
              title:
                session.title.trim() ||
                `${name.trim()}${scheduleType === "series" ? ` · Session ${index + 1}` : ""}`,
              location,
              locationType,
            },
            Date.now(),
          ),
        );
      const result = await createTable({
        name: name.trim(),
        description: description.trim(),
        format,
        photoUrl: photoUrl.trim() || undefined,
        hostOrgId,
        hostRoleLabel,
        scheduleType,
        pricingType,
        priceCents: pricingType === "fixed" ? priceCents : undefined,
        capacity: capacity ? Number(capacity) : undefined,
        membershipRequired,
        access,
        allowsExternalGuests:
          membershipRequired || pricingType !== "free" || access !== "open"
            ? false
            : allowsExternalGuests,
        events: prepared,
      });
      navigate(`/tables/${result.slug}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't set your Table. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  if (isLoading)
    return (
      <main className="tables-page">
        <p role="status">Loading…</p>
      </main>
    );
  if (!isAuthenticated)
    return (
      <main className="tables-page">
        <h1 className="tables-heading">Set a Table</h1>
        <div className="tables-empty" style={{ marginTop: 24 }}>
          <p>
            A free account can host a free one-time gathering. Sign in to start.
          </p>
          <Link
            className="tables-button tables-button-primary"
            to="/login?redirect=%2Ftables%2Fnew"
          >
            Sign in to set a Table
          </Link>
        </div>
      </main>
    );
  return (
    <main className="tables-page">
      <Link className="tables-note" to="/tables">
        ← Tables
      </Link>
      <header style={{ marginTop: 24 }}>
        <span className="tables-eyebrow">Set a Table</span>
        <h1 className="tables-heading" style={{ marginTop: 12 }}>
          What are you gathering people around?
        </h1>
        <p className="tables-intro">
          Start with one gathering. A free account can host a free one-time
          Table.
        </p>
      </header>
      {policy === undefined ? (
        <p className="tables-note" role="status">
          Checking hosting options…
        </p>
      ) : (
        <div className="tables-create">
          <form className="tables-form" onSubmit={submit}>
            <fieldset>
              <legend>The Table</legend>
              <div className="tables-inline-fields">
                <label className="tables-field">
                  Host in
                  <select
                    className="tables-input"
                    value={hostOrgId ?? ""}
                    onChange={(event) => {
                      setHostOrgId(
                        event.target.value
                          ? (event.target.value as Id<"hostOrgs">)
                          : undefined,
                      );
                      setMembershipRequired(false);
                    }}
                  >
                    <option value="">As myself · independent Table</option>
                    {policy.communities.map((community) => (
                      <option key={community._id} value={community._id}>
                        {community.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="tables-field">
                  Title
                  <input
                    className="tables-input"
                    required
                    maxLength={120}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Give people something to gather around"
                  />
                </label>
                <label className="tables-field">
                  Description
                  <textarea
                    className="tables-input"
                    required
                    maxLength={5000}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What will you do together, and who is it for?"
                  />
                </label>
                <div className="tables-fields">
                  <label className="tables-field">
                    Topic / format
                    <select
                      className="tables-input"
                      value={format}
                      onChange={(event) => setFormat(event.target.value)}
                    >
                      {[
                        "Community",
                        "Writing",
                        "Music",
                        "Visual art",
                        "Film",
                        "Faith & art",
                        "Workshop",
                        "Critique",
                        "Service",
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label className="tables-field">
                    Your host label
                    <select
                      className="tables-input"
                      value={hostRoleLabel}
                      onChange={(event) => setHostRoleLabel(event.target.value)}
                    >
                      {[
                        "Host",
                        "Instructor",
                        "Facilitator",
                        "Guide",
                        "Convener",
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="tables-field">
                  Cover image URL{" "}
                  <span className="tables-note">
                    Optional. Use an image you have permission to share.
                  </span>
                  <input
                    className="tables-input"
                    type="url"
                    value={photoUrl}
                    onChange={(event) => setPhotoUrl(event.target.value)}
                    placeholder="https://…"
                  />
                </label>
              </div>
            </fieldset>
            <fieldset>
              <legend>Schedule</legend>
              <div className="tables-filter-row">
                <button
                  type="button"
                  className="tables-chip"
                  aria-pressed={scheduleType === "one_time"}
                  onClick={() => setScheduleType("one_time")}
                >
                  One time
                </button>
                <button
                  type="button"
                  className="tables-chip"
                  aria-pressed={scheduleType === "series"}
                  disabled={!canCommercial}
                  onClick={() => {
                    setScheduleType("series");
                    if (events.length === 1)
                      setEvents([
                        ...events,
                        { title: "", date: "", duration: "90" },
                      ]);
                  }}
                >
                  Manual series
                </button>
              </div>
              <p className="tables-note" style={{ margin: "12px 0" }}>
                Dates use your device's time zone. Every session becomes an
                Event.
              </p>
              {events
                .slice(0, scheduleType === "one_time" ? 1 : events.length)
                .map((session, index) => (
                  <div className="tables-form-session" key={index}>
                    <div className="tables-form-session-header">
                      <span>Event {index + 1}</span>
                      {index > 0 && (
                        <button
                          type="button"
                          className="tables-button tables-button-small"
                          onClick={() =>
                            setEvents(events.filter((_, i) => i !== index))
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <label className="tables-field" style={{ marginTop: 12 }}>
                      Event title
                      <input
                        className="tables-input"
                        maxLength={120}
                        value={session.title}
                        placeholder={name || "Uses the Table title"}
                        onChange={(event) =>
                          updateEvent(index, "title", event.target.value)
                        }
                      />
                    </label>
                    <div className="tables-fields">
                      <label className="tables-field">
                        Date and start time
                        <input
                          className="tables-input"
                          required
                          type="datetime-local"
                          value={session.date}
                          onChange={(event) =>
                            updateEvent(index, "date", event.target.value)
                          }
                        />
                      </label>
                      <label className="tables-field">
                        Duration in minutes
                        <input
                          className="tables-input"
                          required
                          type="number"
                          min="1"
                          max="1440"
                          value={session.duration}
                          onChange={(event) =>
                            updateEvent(index, "duration", event.target.value)
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}
              {scheduleType === "series" && (
                <button
                  type="button"
                  className="tables-button"
                  onClick={() =>
                    setEvents([
                      ...events,
                      { title: "", date: "", duration: "90" },
                    ])
                  }
                >
                  + Add an Event
                </button>
              )}
              <div className="tables-fields" style={{ marginTop: 16 }}>
                <label className="tables-field">
                  Where
                  <select
                    className="tables-input"
                    value={locationType}
                    onChange={(event) =>
                      setLocationType(
                        event.target.value as "in_person" | "online",
                      )
                    }
                  >
                    <option value="in_person">In person</option>
                    <option value="online">Online</option>
                  </select>
                </label>
                <label className="tables-field">
                  {locationType === "online"
                    ? "Location label (no private meeting links)"
                    : "City or venue"}
                  <input
                    className="tables-input"
                    value={location}
                    maxLength={200}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder={
                      locationType === "online"
                        ? "Online gathering"
                        : "Pasadena · Community studio"
                    }
                  />
                </label>
              </div>
            </fieldset>
            <fieldset>
              <legend>Chairs and participation</legend>
              <div className="tables-inline-fields">
                <label className="tables-field">
                  Chairs available
                  <input
                    className="tables-input"
                    type="number"
                    min="1"
                    max="1000"
                    required
                    value={capacity}
                    onChange={(event) => setCapacity(event.target.value)}
                  />
                </label>
                <label className="tables-field">
                  Who can join
                  <select
                    className="tables-input"
                    value={access}
                    onChange={(event) =>
                      setAccess(event.target.value as "open" | "approval")
                    }
                  >
                    <option value="open">Open enrollment</option>
                    <option value="approval">Host approves requests</option>
                  </select>
                </label>
                <label className="tables-check">
                  <input
                    type="checkbox"
                    checked={membershipRequired}
                    disabled={!hostOrgId}
                    onChange={(event) => {
                      setMembershipRequired(event.target.checked);
                      if (event.target.checked) setAllowsExternalGuests(false);
                    }}
                  />
                  Require membership in{" "}
                  {selectedCommunity?.name ?? "the selected community"}
                </label>
                <label className="tables-check">
                  <input
                    type="checkbox"
                    checked={
                      allowsExternalGuests &&
                      !membershipRequired &&
                      pricingType === "free" &&
                      access === "open"
                    }
                    disabled={
                      membershipRequired ||
                      pricingType !== "free" ||
                      access !== "open"
                    }
                    onChange={(event) =>
                      setAllowsExternalGuests(event.target.checked)
                    }
                  />
                  Allow external guests to RSVP to Events. Guest RSVP does not
                  reveal the Table roster.
                </label>
                <p className="tables-note">
                  The roster stays private until a participant joins, is
                  accepted, and meets any membership and payment requirements.
                </p>
              </div>
            </fieldset>
            <fieldset>
              <legend>Price</legend>
              <div className="tables-filter-row">
                <button
                  type="button"
                  className="tables-chip"
                  aria-pressed={pricingType === "free"}
                  onClick={() => setPricingType("free")}
                >
                  Free
                </button>
                <button
                  type="button"
                  className="tables-chip"
                  aria-pressed={pricingType === "fixed"}
                  disabled={!canCommercial}
                  onClick={() => setPricingType("fixed")}
                >
                  Fixed one-time price
                </button>
              </div>
              {pricingType === "fixed" && (
                <label className="tables-field" style={{ marginTop: 16 }}>
                  Price in USD, covering all included Events
                  <input
                    className="tables-input"
                    type="number"
                    min="1"
                    max="10000"
                    step="0.01"
                    required
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </label>
              )}
              <p className="tables-note" style={{ marginTop: 12 }}>
                {canCommercial
                  ? "Membership eligibility and Table price are independent. Members still pay an additional Table price when one is set."
                  : "Charging money or hosting a series requires membership in that Table's community. Choose an eligible community above to unlock these options."}
              </p>
            </fieldset>
            {invalidPolicy && (
              <p className="tables-error" role="alert">
                Your selected community does not allow you to charge or host a
                series. Choose an eligible community, or return to a free
                one-time Table.
              </p>
            )}
            {error && (
              <p className="tables-error" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="tables-button tables-button-primary"
              disabled={pending || invalidPolicy}
            >
              {pending ? "Setting the Table…" : "Set the Table"}
            </button>
          </form>
          <aside
            className="tables-create-preview"
            aria-label="Table card preview"
          >
            <span className="tables-eyebrow">How it will look</span>
            <TableCard
              preview
              table={{
                _id: "preview",
                slug: "preview",
                name: name || "Your Table",
                format,
                photoUrl: photoUrl || undefined,
                scheduleType,
                membershipRequired,
                priceCents:
                  pricingType === "fixed"
                    ? Math.round(Number(price) * 100) || undefined
                    : undefined,
                capacity: Number(capacity) || undefined,
                memberCount: 0,
                community: selectedCommunity
                  ? {
                      name: selectedCommunity.name,
                      slug: selectedCommunity.slug,
                    }
                  : null,
                nextEventAt: events[0].date
                  ? new Date(events[0].date).getTime()
                  : undefined,
                isOnline: locationType === "online",
                location,
              }}
            />
          </aside>
        </div>
      )}
    </main>
  );
}
