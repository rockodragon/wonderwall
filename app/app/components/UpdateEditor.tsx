// The Update editor on /admin/updates (docs/features/desk-updates.md, "Where
// it shows"): the fields on one side, the card as it will sit on the desk on
// the other. New and edit share it. An edit replaces the whole record on the
// server, so everything the form holds is sent, and a field left empty is
// cleared.
//
// The card preview is the desk's own card (DeskCardView), set down on a small
// piece of the desk and made inert.
//
// Admin pages in this app are light and plain (admin.showcase.tsx); this one
// follows them. Muted text is gray-700 and up.

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { updateCard } from "../desk/deskCards";
import { DeskCardView } from "../desk/DeskCard";
import type { Place } from "../desk/deskLayout";
import { DESK, deskSurfaceStyle, useDeskTint } from "../desk/tokens";
import { errorMessage } from "../lib/convexError";
import {
  ACTION_LABEL_MAX,
  BODY_MAX,
  NEW_FOR_DAYS_MAX,
  NEW_FOR_DAYS_MIN,
  TITLE_MAX,
  emptyForm,
  formFrom,
  peopleLabel,
  saveArgs,
  type UpdateAudience,
  type UpdateForm,
} from "../lib/updates";

export type AdminUpdate = FunctionReturnType<typeof api.updates.adminList>[number];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const fieldClass =
  "rounded-md border border-gray-400 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600";
const inputClass = `w-full ${fieldClass}`;
const labelClass = "mb-1 block text-[13px] font-medium text-gray-900";
const hintClass = "text-[13px] text-gray-700";
const buttonClass =
  "rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = `${buttonClass} bg-blue-700 text-white hover:bg-blue-800`;
const quietButton = `${buttonClass} border border-gray-400 bg-white text-gray-900 hover:border-gray-600`;

export function UpdateEditor({
  update,
  order,
  communities,
  onClose,
  onSaved,
}: {
  /** The Update being edited; none for a new one. */
  update: AdminUpdate | null;
  /** The order a new Update starts at. */
  order: number;
  communities: readonly { _id: string; name: string }[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState<UpdateForm>(() => (update ? formFrom(update) : emptyForm(Date.now(), order)));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // A picture picked in this editor is previewed from the file until it is saved.
  const localUrl = useRef<string | null>(null);

  const save = useMutation(api.updates.save);
  const generateUploadUrl = useMutation(api.updates.generateImageUploadUrl);

  useEffect(
    () => () => {
      if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    },
    [],
  );

  const set = <K extends keyof UpdateForm>(key: K, value: UpdateForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  // ——— Audience count ———

  const days = Number(form.newForDays);
  const daysOk = form.newForDays.trim() !== "" && Number.isInteger(days) && days >= NEW_FOR_DAYS_MIN && days <= NEW_FOR_DAYS_MAX;
  const countArgs =
    form.audience === "everyone"
      ? ({ audience: "everyone" } as const)
      : form.audience === "community"
        ? form.hostOrgId
          ? ({ audience: "community", hostOrgId: form.hostOrgId as Id<"hostOrgs"> } as const)
          : "skip"
        : daysOk
          ? ({ audience: "new", newForDays: days } as const)
          : "skip";
  const count = useQuery(api.updates.audienceCount, countArgs);

  // ——— The picture ———

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Pick an image file.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("The picture must be under 5MB.");
      return;
    }
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!result.ok) throw new Error("Upload failed");
      const { storageId } = (await result.json()) as { storageId: Id<"_storage"> };
      if (localUrl.current) URL.revokeObjectURL(localUrl.current);
      localUrl.current = URL.createObjectURL(file);
      setForm((f) => ({ ...f, imageStorageId: storageId, imageUrl: localUrl.current }));
    } catch (err) {
      setError(err instanceof Error && err.message === "Upload failed" ? "Couldn't upload that. Try again." : errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  function removePicture() {
    if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    localUrl.current = null;
    setForm((f) => ({ ...f, imageStorageId: null, imageUrl: null }));
  }

  // ——— Save ———

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving || uploading) return;
    setError("");
    const built = saveArgs(form, update?._id);
    if (!built.ok) {
      setError(built.message);
      return;
    }
    setSaving(true);
    try {
      await save(built.args);
      onSaved(update ? "Saved." : "Saved as a draft.");
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  // A community that isn't in the public list (a private one) still shows,
  // so editing never silently swaps it.
  const known = communities.some((c) => c._id === form.hostOrgId);

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" noValidate>
      <div className="space-y-5 rounded-lg bg-white p-5 shadow-sm sm:p-6">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="update-title" className={labelClass}>
              Title
            </label>
            <Count n={form.title.length} max={TITLE_MAX} />
          </div>
          <input
            id="update-title"
            value={form.title}
            maxLength={TITLE_MAX}
            onChange={(e) => set("title", e.target.value)}
            className={inputClass}
            autoFocus={!update}
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="update-body" className={labelClass}>
              Text
            </label>
            <Count n={form.body.length} max={BODY_MAX} />
          </div>
          <textarea
            id="update-body"
            value={form.body}
            maxLength={BODY_MAX}
            rows={7}
            onChange={(e) => set("body", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <span className={labelClass}>Picture</span>
          <div className="flex flex-wrap items-center gap-3">
            {form.imageUrl && <img src={form.imageUrl} alt="" className="h-16 w-16 rounded-md border border-gray-300 object-cover" />}
            <input ref={fileRef} type="file" accept="image/*" onChange={onPick} className="sr-only" id="update-picture" />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className={quietButton}>
              {uploading ? "Uploading…" : form.imageUrl ? "Change picture" : "Add a picture"}
            </button>
            {form.imageUrl && (
              <button type="button" onClick={removePicture} disabled={uploading} className={quietButton}>
                Remove
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="update-action-label" className={labelClass}>
                Button label
              </label>
              <Count n={form.actionLabel.length} max={ACTION_LABEL_MAX} />
            </div>
            <input
              id="update-action-label"
              value={form.actionLabel}
              maxLength={ACTION_LABEL_MAX}
              onChange={(e) => set("actionLabel", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="update-action-url" className={labelClass}>
              Button link
            </label>
            <input
              id="update-action-url"
              value={form.actionUrl}
              onChange={(e) => set("actionUrl", e.target.value)}
              placeholder="/events or https://…"
              className={inputClass}
              inputMode="url"
              autoCapitalize="off"
              spellCheck={false}
            />
          </div>
          <p className={`${hintClass} sm:col-span-2`}>Both or neither.</p>
        </div>

        <div>
          <label htmlFor="update-audience" className={labelClass}>
            Who sees it
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <select
              id="update-audience"
              value={form.audience}
              onChange={(e) => set("audience", e.target.value as UpdateAudience)}
              className={fieldClass}
            >
              <option value="everyone">Everyone</option>
              <option value="community">A community</option>
              <option value="new">New members</option>
            </select>
            {form.audience === "community" && (
              <select
                aria-label="Community"
                value={form.hostOrgId}
                onChange={(e) => set("hostOrgId", e.target.value)}
                className={fieldClass}
              >
                <option value="">Pick one</option>
                {form.hostOrgId && !known && <option value={form.hostOrgId}>This community</option>}
                {communities.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {form.audience === "new" && (
              <label className="flex items-center gap-2 text-sm text-gray-900">
                First
                <input
                  type="number"
                  min={NEW_FOR_DAYS_MIN}
                  max={NEW_FOR_DAYS_MAX}
                  step={1}
                  value={form.newForDays}
                  onChange={(e) => set("newForDays", e.target.value)}
                  className={`${fieldClass} w-20`}
                  aria-label="Days"
                />
                days
              </label>
            )}
          </div>
          <p className={`${hintClass} mt-1`} aria-live="polite">
            {countArgs === "skip" ? (form.audience === "community" ? "Pick a community." : `Days: ${NEW_FOR_DAYS_MIN} to ${NEW_FOR_DAYS_MAX}.`) : count === undefined ? "Counting…" : peopleLabel(count)}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="update-starts" className={labelClass}>
              Starts
            </label>
            <input
              id="update-starts"
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => set("startsAt", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="update-ends" className={labelClass}>
              Ends (optional)
            </label>
            <input
              id="update-ends"
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => set("endsAt", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="update-order" className={labelClass}>
              Order
            </label>
            <input
              id="update-order"
              type="number"
              step={1}
              value={form.order}
              onChange={(e) => set("order", e.target.value)}
              className={inputClass}
            />
            <p className={`${hintClass} mt-1`}>Lower comes first.</p>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={saving || uploading} className={primaryButton}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} disabled={saving} className={quietButton}>
            Cancel
          </button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start" aria-label="Preview">
        <p className={`${labelClass} mb-2`}>On the canvas</p>
        <Preview update={update} form={form} />
      </aside>
    </form>
  );
}

function Count({ n, max }: { n: number; max: number }) {
  return (
    <span className={`text-[13px] ${n >= max ? "font-medium text-red-800" : "text-gray-700"}`}>
      {n}/{max}
    </span>
  );
}

// ——————————————————————————————————————————————————————————————
// The card, as it will sit on the desk
// ——————————————————————————————————————————————————————————————

const STAGE_W = 278;
const STAGE_H = 358;
const PLACE: Place = { x: 24, y: 24, w: 230, h: 310, r: -2, opacity: 1, z: 1 };
const noop = () => {};

/** The desk's own card on a piece of the desk. It can't be reached: the
 * button on it would do nothing here. */
function Preview({ update, form }: { update: AdminUpdate | null; form: UpdateForm }) {
  const card = useMemo(
    () =>
      updateCard(
        {
          _id: update?._id ?? "new",
          title: form.title.trim() || "Title",
          body: form.body,
          imageUrl: form.imageUrl,
          actionLabel: form.actionLabel.trim() || null,
          actionUrl: form.actionUrl.trim() || null,
        },
        ["all"],
      ),
    [update?._id, form.title, form.body, form.imageUrl, form.actionLabel, form.actionUrl],
  );
  const tint = useDeskTint();
  return (
    <div
      className="relative mx-auto overflow-hidden rounded-lg"
      style={{
        width: STAGE_W,
        height: STAGE_H,
        ...deskSurfaceStyle(tint),
      }}
    >
      {/* vh below the card puts it in place at once, with no rise. */}
      <DeskCardView card={card} place={PLACE} open={false} inert vh={-100} onOpen={noop} onClose={noop} />
    </div>
  );
}
