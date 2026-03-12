"use client";

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

export function IncidentMap({
  incidents,
  showMap,
}: {
  incidents: MapIncident[];
  showMap: boolean;
}) {
  if (!showMap) return null;

  return (
    <div className="mb-6">
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      />
      <link
        rel="stylesheet"
        href="https://unpkg.com/react-leaflet-cluster@2.1.0/lib/index.css"
      />
      <div className="rounded-lg overflow-hidden border border-warm-200 h-[420px] mb-2">
        <MapInner incidents={incidents} />
      </div>
      <p className="text-xs text-warm-400">
        {incidents.length} incidents with known locations
      </p>
    </div>
  );
}
