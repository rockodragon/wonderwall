// "At a glance" on /admin: people, projects and events — how many there are,
// and how many are new in the last 7 days — three small tables side by side.
// The numbers come from convex/garden/operatorCounts.ts, which also says
// what "last 7 days" means (new in that row, never "touched").

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { admin } from "./adminStyles";

const TH =
  "pb-2 text-left align-bottom text-[12.5px] font-semibold uppercase tracking-wider text-[color:var(--app-text-muted)]";
const LABEL = "py-1.5 pr-3 text-left text-[14px] font-normal text-[color:var(--app-text-muted)]";
const NUMBER = "py-1.5 pl-3 text-right text-[14px] tabular-nums text-[color:var(--app-text)]";

export function CountsPanel() {
  const counts = useQuery(api.garden.operatorCounts.getCounts, {});

  return (
    <section className={admin.panel} aria-labelledby="counts-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="counts-title" className={admin.h2}>
          At a glance
        </h2>
        <p className={admin.hint}>7 days = new this week. Sample postings left out.</p>
      </div>
      {!counts ? (
        <p className={`mt-3 ${admin.meta}`}>Counting…</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-3">
          {counts.groups.map((group) => (
            <table key={group.title} className="w-full">
              <thead className="border-b border-[color:var(--app-hairline)]">
                <tr>
                  <th scope="col" className={TH}>
                    {group.title}
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    All
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    7 days
                  </th>
                </tr>
              </thead>
              <tbody className={admin.divide}>
                {group.rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row" className={`${LABEL} ${row.sub ? "pl-4" : ""}`}>
                      {row.label}
                    </th>
                    <td className={NUMBER}>{row.all}</td>
                    <td className={NUMBER}>{row.recent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      )}
    </section>
  );
}
