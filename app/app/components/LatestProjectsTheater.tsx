// Admins only: every listed project in theater mode, newest first (Rick,
// 2026-11-04), say for a screen at an event. It plays them all, whatever
// the filters show. The list is listProjects, the one the Projects view
// already reads, so this adds no query; for anyone else it reads nothing
// and draws nothing.

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { useIsAdmin } from "../lib/useIsAdmin";
import { latestSlides } from "../lib/theaterSlides";
import { Theater, TheaterButton } from "./Theater";

export function LatestProjectsTheater({ buttonClassName, iconOnPhone }: { buttonClassName?: string; iconOnPhone?: boolean }) {
  const isAdmin = useIsAdmin();
  const projects = useQuery(api.garden.projects.listProjects, isAdmin ? {} : "skip");
  const slides = useMemo(() => (projects ? latestSlides(projects) : []), [projects]);
  const [open, setOpen] = useState(false);
  if (!isAdmin || slides.length === 0) return null;
  return (
    <>
      <TheaterButton onClick={() => setOpen(true)} className={buttonClassName} iconOnPhone={iconOnPhone} />
      {open && <Theater slides={slides} ordered label="The latest projects" onClose={() => setOpen(false)} />}
    </>
  );
}
