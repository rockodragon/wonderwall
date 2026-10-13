// "What are you working on?" on the signed-out front doors: the title comes
// before the account. Submitting stashes it (lib/shareProject.ts) and goes to
// signup; onboarding posts the project the moment the account exists.

import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router";
import { stashProjectTitle } from "../lib/shareProject";

export function ShareTitleBox({
  inputStyle,
  buttonClassName,
  buttonStyle,
  noteStyle,
}: {
  inputStyle?: CSSProperties;
  buttonClassName?: string;
  buttonStyle?: CSSProperties;
  noteStyle?: CSSProperties;
}) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (stashProjectTitle(title)) navigate("/signup");
      }}
      className="w-full"
    >
      <label htmlFor="share-title" className="block text-[15px] font-medium mb-1.5">
        What are you working on?
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          id="share-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-w-0 flex-1 px-3.5 py-2.5 rounded-lg border text-[15px]"
          style={inputStyle}
        />
        <button type="submit" disabled={!title.trim()} className={buttonClassName} style={buttonStyle}>
          Share it
        </button>
      </div>
      <p className="mt-1.5 text-[13.5px]" style={noteStyle}>
        Everyone can see it.
      </p>
    </form>
  );
}
