// One way to put a file in Convex storage: ask for an upload URL, POST the
// bytes, get the storage id back. Covers go through here
// (docs/features/cover-4x5.md).

import type { Id } from "../../convex/_generated/dataModel";

export async function uploadToStorage(
  generateUploadUrl: () => Promise<string>,
  blob: Blob,
): Promise<Id<"_storage">> {
  const url = await generateUploadUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
  return storageId;
}
