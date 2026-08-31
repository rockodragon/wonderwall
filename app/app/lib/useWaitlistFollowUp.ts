import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Role } from "../constants/roles";

// Shared logic behind the "move up the list" waitlist follow-up — used by
// both the homepage and /join, which render it with different styling.
export function useWaitlistFollowUp(email: string) {
  const answerQuestions = useMutation(api.waitlist.answerWaitlistQuestions);

  const [role, setRole] = useState<Role | null>(null);
  const [projectDescription, setProjectDescription] = useState("");
  const [projectUrl, setProjectUrl] = useState("");
  const [hasLaunchProject, setHasLaunchProject] = useState(false);
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [interestedInHosting, setInterestedInHosting] = useState(false);
  const [hearAboutUs, setHearAboutUs] = useState("");
  const [hearAboutUsOther, setHearAboutUsOther] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState<number | null>(null);

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const result = await answerQuestions({
        email,
        role: role ?? undefined,
        projectDescription: projectDescription.trim() || undefined,
        projectUrl: projectUrl.trim() || undefined,
        hasLaunchProject,
        portfolioUrl: hasLaunchProject ? portfolioUrl.trim() || undefined : undefined,
        interestedInHosting,
        hearAboutUs: hearAboutUs || undefined,
        hearAboutUsOther:
          hearAboutUs === "Other" ? hearAboutUsOther.trim() || undefined : undefined,
      });
      setPosition(result.position ?? null);
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "That didn't go through — try again.",
      );
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return {
    role,
    setRole,
    projectDescription,
    setProjectDescription,
    projectUrl,
    setProjectUrl,
    hasLaunchProject,
    setHasLaunchProject,
    portfolioUrl,
    setPortfolioUrl,
    interestedInHosting,
    setInterestedInHosting,
    hearAboutUs,
    setHearAboutUs,
    hearAboutUsOther,
    setHearAboutUsOther,
    submitting,
    error,
    position,
    submit,
  };
}
