import { useMutation, useQuery } from "convex/react";
import { usePostHog } from "@posthog/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useNavigate } from "react-router";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "../lib/convexError";
import { initialsOf } from "../lib/initials";

// How long to wait after the last key before searching.
const DEBOUNCE_MS = 150;

// The server looks past the people you follow from this many characters
// (messaging.ts PEOPLE_SEARCH_MIN_CHARS). Shorter, it only narrows the follows.
const MIN_SEARCH_CHARS = 2;

type Person = NonNullable<ReturnType<typeof useSearchResults>>[number];

function useSearchResults(query: string) {
  return useQuery(api.messaging.searchPeopleToMessage, { query });
}

/**
 * "New message" on the inbox: a "To" box that suggests people as you type,
 * the ones you follow first. Picking one opens (or reopens) your conversation
 * with them. Up and down move, Enter picks, Escape closes.
 *
 * `onClose(true)` asks the page to put focus back on its button (Escape,
 * Cancel); `onClose(false)` is a click elsewhere. `anchorRef` is that button:
 * a click on it isn't "outside", so it can close the box itself.
 */
export function NewMessage({
  onClose,
  anchorRef,
}: {
  onClose: (restoreFocus: boolean) => void;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const getOrCreateConversation = useMutation(api.messaging.getOrCreateConversation);

  const inputId = useId();
  const listId = useId();
  const cardRef = useRef<HTMLDivElement>(null);

  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  // Keep the last answer on screen while the next one loads, so the list
  // doesn't blink empty between keystrokes.
  const results = useSearchResults(debounced);
  const lastResults = useRef<Person[] | undefined>(undefined);
  if (results !== undefined) lastResults.current = results;
  const people = results ?? lastResults.current;

  // Once a person is picked there is no backing out: the conversation is
  // already opening.
  const close = (restoreFocus: boolean) => {
    if (starting === null) onClose(restoreFocus);
  };

  // A click anywhere else closes the box.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (cardRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      if (starting === null) onClose(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [anchorRef, onClose, starting]);

  const count = people?.length ?? 0;
  const open = count > 0;
  const current = open ? Math.min(active, count - 1) : -1;
  const optionId = (i: number) => `${listId}-option-${i}`;

  useEffect(() => {
    if (current >= 0) document.getElementById(optionId(current))?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const pick = async (person: Person) => {
    if (starting) return;
    setStarting(person.userId);
    setError(null);
    try {
      const conversation = await getOrCreateConversation({ otherUserId: person.userId });
      if (!conversation) throw new Error("No conversation");
      posthog?.capture("conversation_started", {
        profileId: person.profileId,
        profileName: person.name,
        source: "messages_new",
      });
      navigate(`/messages/${conversation._id}`);
    } catch (err) {
      setError(errorMessage(err));
      setStarting(null);
    }
  };

  // Escape closes from anywhere in the box (the input or Cancel).
  const onCardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && open) {
      e.preventDefault();
      setActive((current + 1) % count);
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      setActive((current - 1 + count) % count);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.nativeEvent.isComposing) return;
      const person = people?.[current];
      if (person) void pick(person);
    }
  };

  // What to say when there is nobody to list. Only once an answer is in.
  const hint =
    people && people.length === 0
      ? debounced.trim().length < MIN_SEARCH_CHARS
        ? "Type a name to find someone."
        : "No one by that name."
      : null;

  return (
    <div
      ref={cardRef}
      onKeyDown={onCardKeyDown}
      className="rounded-2xl border mb-4 overflow-hidden transition-colors focus-within:border-[var(--app-accent)]"
      style={{ backgroundColor: "var(--app-surface-raised)", borderColor: "var(--app-hairline)" }}
    >
      <div className="flex items-center gap-3 px-4 py-2.5">
        <label
          htmlFor={inputId}
          className="text-[13.5px] font-semibold flex-shrink-0"
          style={{ color: "var(--app-text-muted)" }}
        >
          To
        </label>
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={current >= 0 ? optionId(current) : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          readOnly={starting !== null}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search people you follow"
          className="flex-1 min-w-0 bg-transparent outline-none text-base py-1 placeholder:text-[var(--app-text-dim)]"
          style={{ color: "var(--app-text)" }}
        />
        <button
          type="button"
          onClick={() => close(true)}
          className="text-[13.5px] font-medium px-3 py-1.5 rounded-lg border flex-shrink-0 transition-colors hover:bg-[var(--app-hairline-raised)]"
          style={{ color: "var(--app-text-muted)", borderColor: "var(--app-hairline)" }}
        >
          Cancel
        </button>
      </div>

      {error && (
        <p role="alert" className="px-4 pb-2.5 text-sm text-red-300">
          {error}
        </p>
      )}

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="People"
          aria-busy={starting !== null}
          className="border-t"
          style={{ borderColor: "var(--app-hairline)" }}
        >
          {people?.map((person, i) => (
            <li
              key={person.userId}
              id={optionId(i)}
              role="option"
              aria-selected={i === current}
              aria-disabled={starting !== null}
              // Keep focus in the box so a click doesn't blur it first.
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => starting === null && setActive(i)}
              onClick={() => void pick(person)}
              className={`flex items-center gap-3 px-4 py-2.5 ${starting !== null ? "cursor-wait" : "cursor-pointer"}`}
              style={{ backgroundColor: i === current ? "var(--app-hairline-raised)" : undefined }}
            >
              <Face person={person} />
              <span className="flex-1 min-w-0 text-sm font-medium truncate" style={{ color: "var(--app-text)" }}>
                {person.name}
              </span>
              {starting === person.userId ? (
                <span
                  className="w-4 h-4 flex-shrink-0 animate-spin rounded-full border-2 border-t-transparent"
                  style={{ borderColor: "var(--app-accent)", borderTopColor: "transparent" }}
                  aria-hidden
                />
              ) : (
                person.following && (
                  <span className="text-xs flex-shrink-0" style={{ color: "var(--app-text-muted)" }}>
                    Following
                  </span>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      {hint && (
        <p
          role="status"
          className="px-4 py-3 text-sm border-t"
          style={{ color: "var(--app-text-muted)", borderColor: "var(--app-hairline)" }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

// Round photo, or their initials. Decorative: the name is next to it.
function Face({ person }: { person: Person }) {
  const [failed, setFailed] = useState(false);
  return person.imageUrl && !failed ? (
    <img
      src={person.imageUrl}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
    />
  ) : (
    <span
      aria-hidden
      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[13px] font-semibold"
      style={{ backgroundColor: "var(--app-accent-wash)", color: "var(--app-text)" }}
    >
      {initialsOf(person.name)}
    </span>
  );
}
