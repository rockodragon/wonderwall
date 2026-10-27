// Shared list of interests used across the app — the topic/subject-matter
// axis for People, Projects, and Offerings alike ("interested in
// Photography"), replacing the old role-noun JOB_FUNCTIONS axis ("is a
// Photographer"), which only made sense for a person, not a project or a
// class. Same word, same value, works for all three: a person, a project,
// and an offering can each be "interested in" / "about" Photography.
// Used in: onboarding, settings, search (People), projects, offerings.
//
// Lives in convex/ because the backend can't import from app/ (the speech
// picker in onboardingAssist.ts needs the list); app/app/constants/
// interests.ts re-exports it, so every page keeps importing from there.

export const INTERESTS = [
  "Design",
  "Illustration",
  "Animation",
  "Photography",
  "Videography",
  "Filmmaking",
  "Writing",
  "Poetry",
  "Art",
  "Craft",
  "Music",
  "Dance & Movement",
  "Acting",
  "Worship",
  "Production",
  "Audio",
  "Technology",
  "Software",
  "Product",
  "Content Creation",
  "Ministry",
  "Leadership",
  "Teaching",
  "Public Speaking",
  "Entrepreneurship",
  "Business",
  "Marketing",
  "Other",
] as const;

export type Interest = (typeof INTERESTS)[number];
