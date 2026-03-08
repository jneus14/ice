"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";

type MapIncident = {
  id: number;
  headline: string | null;
  date: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  incidentType: string | null;
};

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

      {/* Heat glow layer — large semi-transparent blobs that accumulate into hotspots */}
      {incidents.map((inc) => (
        <CircleMarker
          key={`heat-${inc.id}`}
          center={[inc.latitude!, inc.longitude!]}
          radius={28}
          pathOptions={{
            color: "transparent",
            fillColor: "#ea580c",
            fillOpacity: 0.055,
            weight: 0,
          }}
        />
      ))}

      {/* Precise dot layer — small clickable markers */}
      {incidents.map((inc) => (
        <CircleMarker
          key={`dot-${inc.id}`}
          center={[inc.latitude!, inc.longitude!]}
          radius={5}
          pathOptions={{
            color: "#9a3412",
            fillColor: "#ea580c",
            fillOpacity: 0.8,
            weight: 1.5,
          }}
        >
          <Popup>
            <div className="text-sm max-w-[260px]">
              <p className="font-semibold mb-1 leading-snug">{inc.headline}</p>
              {inc.location && (
                <p className="text-xs text-gray-500">{inc.location}</p>
              )}
              {inc.date && (
                <p className="text-xs text-gray-500">{inc.date}</p>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
