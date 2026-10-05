// Text whose names link to their pages: "Dana Lee cheered on Small Acts",
// with Dana Lee going to their profile and Small Acts to the project
// (lib/celebrations.ts linkParts decides where). Text with no links comes
// out as it went in.

import { Fragment } from "react";
import { Link } from "react-router";
import { linkParts, type TextLink } from "../lib/celebrations";

export function LinkedText({ text, links, className }: { text: string; links?: readonly TextLink[]; className: string }) {
  if (!links?.length) return <>{text}</>;
  return (
    <>
      {linkParts(text, links).map((part, i) =>
        part.href ? (
          <Link key={i} to={part.href} className={className}>
            {part.text}
          </Link>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
