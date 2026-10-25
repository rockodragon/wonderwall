// Saving something the page made (a calendar file, a guest list, a QR code)
// as a file on the visitor's device: a link with `download`, clicked.

/** Saves `blob` as `filename`. The object URL lives a moment past the
 *  click: Safari reads it after. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
