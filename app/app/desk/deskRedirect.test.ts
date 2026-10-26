import { describe, expect, it } from "vitest";
import { deskHrefForPage } from "./deskRedirect";

const to = (url: string) => {
  const [pathname, search = ""] = url.split("?");
  return deskHrefForPage(pathname, search ? `?${search}` : "");
};

describe("deskHrefForPage", () => {
  it("answers People, its old /search address, Projects and Events, and nothing else", () => {
    expect(to("/people")).toBe("/today?view=people");
    expect(to("/search")).toBe("/today?view=people");
    expect(to("/people/")).toBe("/today?view=people");
    expect(to("/projects")).toBe("/today?view=projects");
    expect(to("/events")).toBe("/today?view=events");
    for (const page of ["/today", "/favorites", "/projects/abc", "/events/abc", "/orgs", "/profile/abc", "/peoples"]) {
      expect(to(page)).toBeNull();
    }
  });

  it("carries People's tab, search, Discipline and Near me", () => {
    expect(to("/people?tab=orgs&q=abiding")).toBe("/today?view=people&q=abiding&tab=orgs");
    expect(to("/people?q=maya&interests=Music,Film&near=1")).toBe("/today?view=people&q=maya&interests=Music%2CFilm&near=1");
  });

  it("drops what the desk doesn't read on People: a community, Discipline and Near me on Organizations", () => {
    expect(to("/people?community=the-garden")).toBe("/today?view=people");
    expect(to("/people?tab=orgs&interests=Music&near=1")).toBe("/today?view=people&tab=orgs");
    expect(to("/people?tab=following")).toBe("/today?view=people");
    expect(to("/people?q=%20%20")).toBe("/today?view=people");
  });

  it("carries the Projects chip and Stage, old links included, and the start form", () => {
    expect(to("/projects?show=work")).toBe("/today?view=projects&show=work");
    expect(to("/projects?show=funding&stage=planning")).toBe("/today?view=projects&show=funding&stage=planning");
    expect(to("/projects?view=work")).toBe("/today?view=projects&show=work");
    expect(to("/projects?seek=people")).toBe("/today?view=projects&show=people");
    expect(to("/projects?new=project")).toBe("/today?view=projects&create=project");
    expect(to("/projects?new=project&stage=completed")).toBe("/today?view=projects&create=project&stage=completed");
  });

  it("drops what the desk doesn't read on Projects", () => {
    expect(to("/projects?interests=Music&location=San+Diego&community=the-garden&title=Mural")).toBe("/today?view=projects");
    expect(to("/projects?show=work&stage=planning")).toBe("/today?view=projects&show=work");
  });

  it("carries the Events tab, search and the host form, and drops tags and a community", () => {
    expect(to("/events?tab=past&q=open+mic")).toBe("/today?view=events&q=open+mic&tab=past");
    expect(to("/events?tab=favorites")).toBe("/today?view=events&tab=favorites");
    expect(to("/events?tab=nonsense&tags=Music&community=the-garden")).toBe("/today?view=events");
    expect(to("/events?new=event")).toBe("/today?view=events&create=event");
  });
});
