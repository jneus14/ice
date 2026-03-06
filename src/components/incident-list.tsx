import { IncidentCard } from "./incident-card";

type Incident = {
  id: number;
  url: string;
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
  page,
  totalPages,
}: {
  incidents: Incident[];
  total: number;
  page: number;
  totalPages: number;
}) {
  if (incidents.length === 0) {
    return (
      <div className="py-12 text-center text-warm-400">
        No incidents found matching your filters.
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-warm-400 mb-4">
        {total} incident{total !== 1 ? "s" : ""}
      </p>
      <div>
        {incidents.map((incident) => (
          <IncidentCard key={incident.id} incident={incident} />
        ))}
      </div>
      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} />
      )}
    </div>
  );
}

function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-8">
      {page > 1 && (
        <a
          href={`?page=${page - 1}`}
          className="px-3 py-1.5 border border-warm-300 text-sm hover:bg-warm-100 transition-colors"
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
          className="px-3 py-1.5 border border-warm-300 text-sm hover:bg-warm-100 transition-colors"
        >
          Next
        </a>
      )}
    </div>
  );
}
