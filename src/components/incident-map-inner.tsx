"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";

type MapIncident = {
  id: number;
  url: string;
  headline: string | null;
  date: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  incidentType: string | null;
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

export function MapInner({ incidents }: { incidents: MapIncident[] }) {
  return (
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
          >
            <Popup>
              <div className="text-sm max-w-[260px]">
                <a href={inc.url} target="_blank" rel="noopener noreferrer" className="font-semibold mb-1 leading-snug text-orange-600 hover:text-orange-800 hover:underline block">{inc.headline}</a>
                {inc.location && (
                  <p className="text-xs text-gray-500">{inc.location}</p>
                )}
                {inc.date && (
                  <p className="text-xs text-gray-500">{inc.date}</p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
