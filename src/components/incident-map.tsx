"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

type MapIncident = {
  id: number;
  headline: string | null;
  date: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  incidentType: string | null;
};

const MapInner = dynamic(
  () => import("./incident-map-inner").then((mod) => mod.MapInner),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-warm-400 text-sm">
        Loading map...
      </div>
    ),
  }
);

export function IncidentMap({ incidents }: { incidents: MapIncident[] }) {
  const [showMap, setShowMap] = useState(true);

  return (
    <div className="mb-6">
      {showMap && (
        <>
          <link
            rel="stylesheet"
            href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          />
          <div className="rounded-lg overflow-hidden border border-warm-200 h-[420px] mb-2">
            <MapInner incidents={incidents} />
          </div>
        </>
      )}
      <div className="flex items-center justify-between">
        <p className="text-xs text-warm-400">
          {incidents.length} incidents with known locations
        </p>
        <button
          onClick={() => setShowMap(!showMap)}
          className="text-xs text-warm-400 hover:text-warm-700 underline"
        >
          {showMap ? "Hide map" : "Show map"}
        </button>
      </div>
    </div>
  );
}
