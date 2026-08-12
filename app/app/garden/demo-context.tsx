// Demo persona context — who you're "walking as" in the /demo flows.
// Persisted to localStorage so a demo survives a refresh mid-pitch.

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { GardenUser } from "./capabilities";
import { PERSONAS, PERSONA_TAGLINE, getPersona } from "./demo-data";

interface DemoState {
  persona: GardenUser;
  setPersonaId: (id: string) => void;
}

const DemoContext = createContext<DemoState | null>(null);

const STORAGE_KEY = "garden-demo-persona";

export function DemoProvider({ children }: { children: ReactNode }) {
  const [personaId, setPersonaId] = useState("maya");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setPersonaId(saved);
  }, []);

  const set = (id: string) => {
    setPersonaId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  return (
    <DemoContext.Provider value={{ persona: getPersona(personaId), setPersonaId: set }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo(): DemoState {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used inside DemoProvider");
  return ctx;
}

/** Fixed bottom bar — demo chrome, visibly not product. */
export function PersonaBar() {
  const { persona, setPersonaId } = useDemo();
  return (
    <div className="g-demo-bar">
      <span className="g-label" style={{ color: "var(--g-citron)" }}>
        Walking as
      </span>
      {PERSONAS.map((p) => (
        <button
          key={p.id}
          className="g-demo-chip"
          data-active={p.id === persona.id}
          onClick={() => setPersonaId(p.id)}
          title={PERSONA_TAGLINE[p.id]}
          aria-label={`Walk as ${p.name}`}
          aria-pressed={p.id === persona.id}
        >
          {p.name.split(" ")[0]}
        </button>
      ))}
    </div>
  );
}
