"use client";

import { useState } from "react";
import { Suspense } from "react";
import { SearchFilters } from "@/components/search-filters";
import { IncidentMap } from "@/components/incident-map";
import { IncidentList } from "@/components/incident-list";

type MapIncident = {
  id: number;
  headline: string | null;
  date: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  incidentType: string | null;
};

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

export function PageLayout({
  mapIncidents,
  countries,
  incidents,
  total,
  totalAll,
  page,
  totalPages,
}: {
  mapIncidents: MapIncident[];
  countries: string[];
  incidents: Incident[];
  total: number;
  totalAll: number;
  page: number;
  totalPages: number;
}) {
  const [showMap, setShowMap] = useState(true);
  const hasMap = mapIncidents.length > 0;

  return (
    <>
      {/* Filters */}
      <Suspense fallback={null}>
        <SearchFilters countries={countries} />
      </Suspense>

      {hasMap && (
        <div className="flex justify-end mb-2">
          <button
            onClick={() => setShowMap(!showMap)}
            className="text-xs text-warm-400 hover:text-warm-700 underline transition-colors"
          >
            {showMap ? "Hide map" : "Show map"}
          </button>
        </div>
      )}

      {hasMap && <IncidentMap incidents={mapIncidents} showMap={showMap} />}

      {/* Incident list */}
      <IncidentList
        incidents={incidents}
        total={total}
        totalAll={totalAll}
        page={page}
        totalPages={totalPages}
      />
    </>
  );
}
