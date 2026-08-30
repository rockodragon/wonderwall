import { useQuery } from "convex/react";
import { Link } from "react-router";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";

const KIND_FILTERS = [
  { label: "All", value: "" },
  { label: "Passion", value: "passion" },
  { label: "Paid", value: "paid" },
];

export default function Projects() {
  const projects = useQuery(api.garden.projects.listProjects);
  const [kindFilter, setKindFilter] = useState("");

  const filtered = useMemo(() => {
    if (!projects) return [];
    if (!kindFilter) return projects;
    return projects.filter((p) => p.kind === kindFilter);
  }, [projects, kindFilter]);

  if (!projects) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        Projects
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        Creative work seeking support, and paid work seeking creatives.
      </p>

      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex gap-2">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setKindFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                kindFilter === f.value
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Link
          to="/works"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          + Start a project
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <p className="text-lg font-medium mb-1">No projects yet</p>
          <p className="text-sm">Be the first to post something you're making</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project) => {
            const thumb = project.media.find((m) => m.resolvedMediaUrl)?.resolvedMediaUrl;
            const detailArtifact = project.media[0];

            const card = (
              <div className="group rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-500 dark:hover:border-blue-500 transition-colors h-full flex flex-col">
                <div className="aspect-[16/10] bg-gray-100 dark:bg-gray-900 overflow-hidden">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={project.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
                      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <span
                    className={`self-start px-2 py-0.5 rounded-full text-xs font-medium mb-2 ${
                      project.kind === "paid"
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        : "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
                    }`}
                  >
                    {project.kind === "paid"
                      ? `Paid${project.budget ? ` · $${project.budget.toLocaleString()}` : ""}`
                      : "Passion"}
                  </span>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1 line-clamp-2">
                    {project.title}
                  </h3>
                  {project.blurb && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
                      {project.blurb}
                    </p>
                  )}
                  {project.creator && (
                    <div className="mt-auto flex items-center gap-2 pt-2">
                      {project.creator.imageUrl ? (
                        <img
                          src={project.creator.imageUrl}
                          alt={project.creator.name}
                          className="w-5 h-5 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold">
                          {project.creator.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {project.creator.name}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );

            return detailArtifact ? (
              <Link key={project._id} to={`/works/${detailArtifact._id}`}>
                {card}
              </Link>
            ) : (
              <div key={project._id}>{card}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
