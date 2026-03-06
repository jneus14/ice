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
}: {
  incidents: Incident[];
  total: number;
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
    </div>
  );
}
