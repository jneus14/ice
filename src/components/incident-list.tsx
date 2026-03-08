"use client";

import { IncidentCard } from "./incident-card";

type Incident = {
  id: number;
  url: string;
  altSources: string | null;
  date: string | null;
  location: string | null;
  headline: string | null;
  summary: string | null;
  incidentType: string | null;
  country: string | null;
};

export function IncidentList({
  incidents,
  total,
  totalAll,
  page,
  totalPages,
}: {
  incidents: Incident[];
  total: number;
  totalAll: number;
  page: number;
  totalPages: number;
}) {
  return (
    <div>
      {/* Count bar */}
      <div className="flex justify-end mb-4">
        <p className="text-xs text-warm-500">
          <span className="font-semibold text-warm-700">{total}</span> of{" "}
          <span className="font-semibold text-warm-700">{totalAll}</span>{" "}
          incidents
        </p>
      </div>

      {incidents.length === 0 ? (
        <div className="py-12 text-center text-warm-400">
          No incidents found matching your filters.
        </div>
      ) : (
        <>
          <div>
            {incidents.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))}
          </div>
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} />
          )}
        </>
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  return (
    <div className="flex items-center justify-center gap-2 mt-8">
      {page > 1 && (
        <a
          href={`?page=${page - 1}`}
          className="px-3 py-1.5 rounded-md border border-warm-300 text-sm hover:bg-warm-100 transition-colors"
        >
          Previous
        </a>
      )}
      <span className="text-sm text-warm-500">
        Page {page} of {totalPages}
      </span>
      {page < totalPages && (
        <a
          href={`?page=${page + 1}`}
          className="px-3 py-1.5 rounded-md border border-warm-300 text-sm hover:bg-warm-100 transition-colors"
        >
          Next
        </a>
      )}
    </div>
  );
}
