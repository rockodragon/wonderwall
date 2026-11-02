// The parts of a project drawn as a feed post, shared by Today's Open
// projects (routes/today.tsx ProjectRow) and the Projects tab's cards
// (routes/projects.tsx ProjectCard), so a post is one layout and not two
// (Rick, 2026-11-02: make the Projects tab match Today).
//
// Top to bottom a post is: who made it (PostMaker), the picture in a square
// (ProjectCover), the title (PostTitle: under the picture, or set large on
// the abstract cover when there is none), the words, and the actions as its
// last row (PostActions: Cheer, Back this, and Save by canSaveProject).
//
// The posts are stretched links: the project link's ::after covers the
// whole article, and the maker and the actions sit above it (`z-10`), so a
// tap anywhere else opens the project and nothing is nested in a link. What
// lays the pieces out (a wide grid on Today, a column on the Projects tab) is
// the caller's, passed in as `className`.

import type { CSSProperties } from "react";
import { bylineOf } from "../lib/byline";
import { isRaising } from "../lib/browse/projectsFilter";
import { canSaveProject, type PostViewer } from "../lib/projectPick";
import { AbstractCover } from "./AbstractCover";
import { Byline } from "./Byline";
import { CoverFrame } from "./CoverFrame";
import { FavoriteButton } from "./FavoriteButton";
import { SupportButtons, type SupportMode } from "./ProjectSupport";

/** A project's picture in the 4:5 cover shape (docs/features/cover-4x5.md),
    shown whole; `square` is a list's picture, cropped to fill. Without one,
    the abstract cover in the same box so the page doesn't jump when a
    picture arrives. */
export function ProjectCover({
  cover,
  seed,
  className = "",
  square = false,
}: {
  cover: string | null;
  seed: string;
  className?: string;
  square?: boolean;
}) {
  if (cover) return <CoverFrame src={cover} alt="" className={className} square={square} />;
  return (
    <div className={`relative ${square ? "aspect-square" : "aspect-[4/5]"} overflow-hidden ${className}`}>
      <div className="absolute inset-0">
        <AbstractCover seed={seed} />
      </div>
    </div>
  );
}

/** The post's header: the maker's square photo (an organization's logo when
    it was posted as one), the name, and "in {community}" under it, linking to
    their page. It sits above the stretched link (`z-10`); only the header
    itself is lifted, the space around it still opens the project. Nothing if
    the project has no maker. */
export function PostMaker({
  project,
  className = "",
}: {
  project: Parameters<typeof bylineOf>[0] & { community?: { name: string } | null };
  className?: string;
}) {
  const byline = bylineOf(project);
  if (!byline) return null;
  return (
    <div className={`relative z-10 w-fit max-w-full mb-1${className ? ` ${className}` : ""}`}>
      <Byline byline={byline} size="post" linked>
        {project.community ? `in ${project.community.name}` : undefined}
      </Byline>
    </div>
  );
}

const TITLE_STYLE: CSSProperties = { fontFamily: "var(--garden-font-display)", color: "var(--app-text)" };

/** The post's title. With a picture it is the first line of the words, under
    it at 17px. Without one it lies over the bottom of the abstract cover (the
    same grid cell as the picture: the caller's link is a one-column grid with
    the cover in column 1, row 1), set large on a scrim so it reads over any
    of the shapes, and the words below don't say it twice. `className` places
    the block. `wide` is Today's wide layout (from md up the post is a grid
    with the picture beside the words): the title leaves the picture for the
    words column at 30px, margins and scrim gone. The link it sits in must be
    a `group`, for the underline on hover and keyboard focus. */
export function PostTitle({
  title,
  hasCover,
  className = "",
  wide = false,
}: {
  title: string;
  hasCover: boolean;
  className?: string;
  wide?: boolean;
}) {
  const place = hasCover
    ? `mt-3${wide ? " md:mt-0" : ""}`
    : "relative z-10 col-start-1 row-start-1 self-end -mx-4 sm:mx-0 px-4 pb-4 pt-20 bg-[linear-gradient(to_top,rgba(18,18,18,0.92),rgba(18,18,18,0.6)_55%,transparent)]";
  const look = hasCover
    ? "text-[17px] leading-snug font-semibold line-clamp-2"
    : "text-[34px] leading-[1.05] font-bold line-clamp-4";
  return (
    <div className={className ? `${className} ${place}` : place}>
      <h3
        className={`tracking-[-0.01em] group-hover:underline group-focus-visible:underline ${
          wide ? "md:text-[30px] md:leading-tight md:line-clamp-none " : ""
        }${look}${wide ? " md:font-semibold" : ""}`}
        style={TITLE_STYLE}
      >
        {title}
      </h3>
    </div>
  );
}

/** The post's last row, outside the link: the heart (with how many cheered or
    backed it), Back this while the project is raising, and Save at the far
    right. 44px targets; the margins pull the icons' own edges level with the
    words. `support` is whether the post offers Cheer and Back this at all (a
    job or a gig is paid, not backed). Save is for a member who doesn't lead
    the project (canSaveProject). Each group sits above the link's cover; the
    empty space between them is the cover, so it opens the project. Each
    button is named for the project, so a page of posts isn't a row of
    identical Cheers.

    A post led by one of its roles (the Jobs and gigs list shows a project as
    "Drummer", the role) passes that `role`: Save then saves the role, as on
    the project's own page, under the same rule, and is named for it. */
export function PostActions({
  project,
  viewer,
  support,
  onSupport,
  role,
  className = "",
}: {
  project: {
    _id: string;
    title: string;
    status: string;
    userId?: string;
    supportCount?: number;
    // What isRaising reads.
    gig?: unknown;
    raising?: boolean;
    goal?: number | null;
    stage?: string | null;
  };
  viewer: PostViewer;
  support: boolean;
  onSupport: (mode: SupportMode) => void;
  /** The open role the post leads with, when its title is the role's. */
  role?: { roleId: string; title: string } | null;
  className?: string;
}) {
  const canSave = canSaveProject(viewer, project);
  return (
    <div className={`mt-1 flex items-center${className ? ` ${className}` : ""}`}>
      {support && (
        <div className="relative z-10 -ml-[9px]">
          <SupportButtons
            raising={isRaising(project)}
            count={project.supportCount}
            onSupport={onSupport}
            size="post"
            name={project.title}
          />
        </div>
      )}
      {canSave && (
        <div className="ml-auto relative z-10 -mr-2.5 flex items-center">
          {role ? (
            <FavoriteButton targetType="role" targetId={role.roleId} name={role.title} look="icon" />
          ) : (
            <FavoriteButton targetType="project" targetId={project._id} name={project.title} look="icon" />
          )}
        </div>
      )}
    </div>
  );
}
