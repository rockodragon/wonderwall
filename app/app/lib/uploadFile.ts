// One way to put a file in Convex storage: ask for an upload URL, POST the
// bytes, get the storage id back. Every upload goes through here — covers
// (docs/features/cover-4x5.md), portfolio pieces, avatars, logos, project and
// update images — so every image leaves without where it was taken
// (lib/imageLocation.ts). The drift guard keeps new uploads on this path.

import type { Id } from "../../convex/_generated/dataModel";
import { withoutLocation } from "./imageLocation";

export async function uploadToStorage(
  generateUploadUrl: () => Promise<string>,
  blob: Blob,
): Promise<Id<"_storage">> {
  const body = await withoutLocation(blob);
  const url = await generateUploadUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": body.type || "application/octet-stream" },
    body,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
  return storageId;
}
