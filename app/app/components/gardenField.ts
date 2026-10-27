// A text field on a Garden sheet, drawn for a phone: the label is 14px and
// plain (no uppercase, no tracking), the box and its text are 17px (16 or
// more, so iOS doesn't zoom the page on focus), the hint under it is 14px.
// MediaLinkField's garden variant, the start-a-project sheet and its pickers
// all draw from here, so they can't drift apart.
//
// The older garden forms (Hire someone, the event and class forms) still
// carry their own 12px uppercase labels and 14px boxes; they move here as
// they are reworked.

export const gardenField = {
  label: "block text-sm mb-2",
  labelStyle: { color: "var(--garden-dim)" },
  input: "w-full px-4 py-3 rounded-lg border text-[17px] outline-none",
  inputStyle: {
    backgroundColor: "var(--garden-ink)",
    borderColor: "var(--garden-hairline-raised)",
    color: "var(--garden-paper)",
  },
  hint: "text-sm mt-2",
  hintStyle: { color: "var(--garden-dim)" },
} as const;
