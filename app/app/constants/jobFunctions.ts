// Shared list of job functions used across the app
// Used in: onboarding, settings, jobs creation/editing

export const JOB_FUNCTIONS = [
  // Creative roles
  "Designer",
  "Illustrator",
  "Animator",
  "Photographer",
  "Videographer",
  "Filmmaker",
  "Writer",
  "Poet",
  "Artist",
  "Craftsman",

  // Performing arts
  "Musician",
  "Dancer",
  "Actor",
  "Worship Leader",

  // Production & Tech
  "Producer",
  "Sound Engineer",
  "Developer",
  "Content Creator",

  // Leadership & Teaching
  "Pastor",
  "Leader",
  "Teacher",
  "Speaker",

  // Business roles
  "Entrepreneur",
  "Marketer",
  "Product Manager",

  // Support roles
  "Roadie",

  // Catch-all
  "Other",
] as const;

export type JobFunction = (typeof JOB_FUNCTIONS)[number];
