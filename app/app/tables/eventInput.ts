/** Shared form-to-domain boundary. "In person" is a UI label; Events store venue. */
export function tableEventInput(
  input: {
    title: string;
    date: string;
    duration: string;
    location: string;
    locationType: "online" | "in_person";
  },
  now: number,
) {
  const datetime = new Date(input.date).getTime();
  const duration = Number(input.duration);
  if (
    !Number.isFinite(datetime) ||
    datetime <= now ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 1440
  ) {
    throw new Error(
      "Choose a future date and a duration from 1 to 1,440 minutes for every Event.",
    );
  }
  return {
    title: input.title.trim(),
    datetime,
    endTime: datetime + duration * 60_000,
    location: input.location.trim() || undefined,
    locationType:
      input.locationType === "in_person"
        ? ("venue" as const)
        : ("online" as const),
  };
}
