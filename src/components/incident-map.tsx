"use client";

import { useEffect, useState } from "react";
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

function MapInner({ incidents }: { incidents: MapIncident[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const L = require("leaflet");
  const { MapContainer, TileLayer, CircleMarker, Popup } = require("react-leaflet");

  // Fix default icon path issues with webpack
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });

  return (
    <MapContainer
      center={[39.8, -98.5]}
      zoom={4}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {incidents.map((inc) => (
        <CircleMarker
          key={inc.id}
          center={[inc.latitude!, inc.longitude!]}
          radius={7}
          pathOptions={{
            color: "#c2410c",
            fillColor: "#ea580c",
            fillOpacity: 0.8,
            weight: 2,
          }}
        >
          <Popup>
            <div className="text-sm max-w-[250px]">
              <p className="font-semibold text-warm-900 mb-1">{inc.headline}</p>
              {inc.location && (
                <p className="text-warm-500 text-xs">{inc.location}</p>
              )}
              {inc.date && (
                <p className="text-warm-500 text-xs">{inc.date}</p>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

export function IncidentMap({ incidents }: { incidents: MapIncident[] }) {
  const [showMap, setShowMap] = useState(false);

  return (
    <div className="mb-6">
      <button
        onClick={() => setShowMap(!showMap)}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-warm-300 bg-white text-warm-700 hover:border-warm-400 transition-colors mb-3"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        {showMap ? "Hide Map" : `Show Map (${incidents.length} located)`}
      </button>

      {showMap && (
        <>
          <link
            rel="stylesheet"
            href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          />
          <div className="rounded-lg overflow-hidden border border-warm-200 h-[400px]">
            <MapInner incidents={incidents} />
          </div>
        </>
      )}
    </div>
  );
}
