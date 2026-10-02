import { useState } from "react";
import { GigSeriesForm } from "./GigSeriesForm";
import type { HireDraft, HireWhen } from "./HireWhenToggle";
import { PaidProjectForm } from "./PaidProjectForm";

// "Hire someone": one job, or a recurring gig. The two forms share a toggle
// at the top (HireWhenToggle) and hand the title and description across when
// it flips, so nothing typed is lost. /projects mounts this from its Hire
// someone button and the desk from /today?create=hire; both are a card on the
// FocusBackdrop, one at a time.

export function HireFlow({
  onClose,
  onCreated,
  onSwitchToProject,
}: {
  onClose: () => void;
  /** The new posting's id, once it exists. */
  onCreated: (projectId: string) => void;
  /** "Making something of your own? Start a project instead." */
  onSwitchToProject: () => void;
}) {
  const [when, setWhen] = useState<HireWhen>("job");
  const [draft, setDraft] = useState<HireDraft | undefined>(undefined);

  if (when === "dates") {
    return (
      <GigSeriesForm
        key="dates"
        initial={draft}
        onSwitchToJob={(next) => {
          setDraft(next);
          setWhen("job");
        }}
        onClose={onClose}
        onCreated={onCreated}
      />
    );
  }
  return (
    <PaidProjectForm
      key="job"
      initial={draft}
      onSwitchToDates={(next) => {
        setDraft(next);
        setWhen("dates");
      }}
      onClose={onClose}
      onCreated={onCreated}
      onSwitchToProject={onSwitchToProject}
    />
  );
}
