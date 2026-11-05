import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { FINISHED_STAGE } from "../lib/shareProject";
import { PersonAvatar } from "./PersonAvatar";
import { ProjectModal } from "./ProjectModal";

// "Share something you've made" on the works page. Sharing work is starting
// a finished project (docs/features/project-ia.md), so the prompt opens the
// same sheet as everywhere else (ProjectModal), whose "Show it" takes the
// work as a piece (components/piece/PieceFields.tsx). This used to be a form
// of its own; the project form couldn't take an upload and this one
// couldn't take a cover, so the same work came out two ways (Rick,
// 2026-11-04).
export function CreateWorkComposer() {
  const profile = useQuery(api.profiles.getMyProfile);
  const [open, setOpen] = useState(false);
  if (!profile) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        onClick={() => setOpen(true)}
        className="w-full p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left"
      >
        <PersonAvatar
          name={profile.name}
          imageUrl={profile.imageUrl}
          size="mdBase"
          tone="gray"
          className="ring-2 ring-gray-100 dark:ring-gray-600"
        />
        <div className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400 text-sm">
          Share something you've made...
        </div>
      </button>
      {open && <ProjectModal initialStage={FINISHED_STAGE} onClose={() => setOpen(false)} />}
    </div>
  );
}
