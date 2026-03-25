"use client";

import { useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";

type MapIncident = {
  id: number;
  url: string;
  headline: string | null;
  summary: string | null;
  date: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  incidentType: string | null;
  altSources: string | null;
};

// Custom orange dot marker
const dotIcon = L.divIcon({
  className: "",
  html: `<div style="width:10px;height:10px;border-radius:50%;background:#ea580c;border:2px solid #9a3412;opacity:0.9;"></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

// Custom cluster icon
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createClusterIcon(cluster: any) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 32 : count < 100 ? 38 : 46;
  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:#ea580c;color:#fff;font-weight:700;
      font-size:${size < 38 ? 12 : 13}px;font-family:sans-serif;
      display:flex;align-items:center;justify-content:center;
      border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.25);
    ">${count}</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function parseAltSources(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function MapClickHandler({ onMapClick }: { onMapClick: () => void }) {
  useMapEvents({
    click: () => onMapClick(),
  });
  return null;
}

function DetailPanel({ inc, onClose }: { inc: MapIncident; onClose: () => void }) {
  const altUrls = parseAltSources(inc.altSources);
  const allUrls = [inc.url, ...altUrls];

  return (
    <div className="absolute top-0 right-0 z-[1000] w-[340px] max-w-[90%] h-full bg-white border-l border-gray-200 shadow-xl overflow-y-auto">
      <div className="p-4">
        <button
          onClick={onClose}
          className="float-right ml-2 text-gray-400 hover:text-gray-700 text-lg leading-none cursor-pointer"
        >
          ✕
        </button>
        <h3 className="font-bold text-base leading-snug text-gray-900 mb-2 pr-6">
          {inc.headline || "Untitled"}
        </h3>
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
          {inc.date && <span>{inc.date}</span>}
          {inc.location && <span>· {inc.location}</span>}
        </div>
        {inc.summary && (
          <p className="text-sm text-gray-700 leading-relaxed mb-4">{inc.summary}</p>
        )}
        <div className="border-t border-gray-200 pt-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5 tracking-wide">Sources</p>
          {allUrls.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-blue-600 hover:text-blue-800 hover:underline truncate mb-1"
            >
              {getDomain(url)}
            </a>
          ))}
        </div>
        <button
          onClick={() => {
            const el = document.getElementById(`incident-${inc.id}`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              el.classList.add("ring-2", "ring-orange-400", "bg-orange-50/50", "rounded-lg");
              el.click();
              setTimeout(() => el.classList.remove("ring-2", "ring-orange-400", "bg-orange-50/50", "rounded-lg"), 4000);
            } else {
              window.location.href = `/?highlight=${inc.id}`;
            }
          }}
          className="mt-3 text-sm text-orange-600 hover:text-orange-800 hover:underline cursor-pointer"
        >
          ↓ View on page
        </button>
      </div>
    </div>
  );
}

export function MapInner({ incidents }: { incidents: MapIncident[] }) {
  const [selected, setSelected] = useState<MapIncident | null>(null);

  const handleMarkerClick = useCallback((inc: MapIncident) => {
    setSelected(inc);
  }, []);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[38.5, -96.5]}
        zoom={4}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          opacity={0.55}
        />
        <MapClickHandler onMapClick={() => setSelected(null)} />

        <MarkerClusterGroup
          iconCreateFunction={createClusterIcon}
          maxClusterRadius={50}
          showCoverageOnHover={false}
          chunkedLoading
        >
          {incidents.map((inc) => (
            <Marker
              key={inc.id}
              position={[inc.latitude!, inc.longitude!]}
              icon={dotIcon}
              eventHandlers={{
                click: () => handleMarkerClick(inc),
              }}
            />
          ))}
        </MarkerClusterGroup>
      </MapContainer>

      {selected && (
        <DetailPanel inc={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
