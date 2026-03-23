"use client";

import { useState, useRef } from "react";
import { Suspense } from "react";
import { SearchFilters } from "@/components/search-filters";
import { IncidentMap } from "@/components/incident-map";
import { IncidentList } from "@/components/incident-list";
import { useLanguage } from "@/lib/i18n";

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
  imageUrl: string | null;
  timeline: string | null;
  approved?: boolean;
};

export function PageLayout({
  mapIncidents,
  countries,
  incidents,
  total,
  totalAll,
  page,
  totalPages,
  pendingIncidents = [],
}: {
  mapIncidents: MapIncident[];
  countries: string[];
  incidents: Incident[];
  total: number;
  totalAll: number;
  page: number;
  totalPages: number;
  pendingIncidents?: Incident[];
}) {
  const [showMap, setShowMap] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [nearbyMode, setNearbyMode] = useState(false);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyIncidents, setNearbyIncidents] = useState<Incident[]>([]);
  const [nearbyRadius, setNearbyRadius] = useState(50);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();

  const hasMap = mapIncidents.length > 0;

  function handleNearMe() {
    if (nearbyMode) {
      setNearbyMode(false);
      setNearbyIncidents([]);
      return;
    }
    setNearbyLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `/api/incidents/nearby?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&radius=${nearbyRadius}`
          );
          if (res.ok) {
            const data = await res.json();
            setNearbyIncidents(data.incidents ?? []);
            setNearbyMode(true);
          }
        } catch {}
        setNearbyLoading(false);
      },
      () => {
        alert("Location access denied. Please enable location services.");
        setNearbyLoading(false);
      }
    );
  }

  function openPasswordModal() {
    setPasswordInput("");
    setPasswordError(false);
    setShowPasswordModal(true);
    setTimeout(() => passwordRef.current?.focus(), 50);
  }

  function submitPassword() {
    if (passwordInput === "acab") {
      setEditMode(true);
      setShowPasswordModal(false);
      setPasswordInput("");
      setPasswordError(false);
    } else {
      setPasswordError(true);
      setPasswordInput("");
      setTimeout(() => passwordRef.current?.focus(), 50);
    }
  }

  return (
    <>
      {/* Filters */}
      <Suspense fallback={null}>
        <SearchFilters countries={countries} />
      </Suspense>

      {/* Map toggle + Edit mode button row */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div>
          {editMode && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-300">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
                {t.editMode}
              </span>
              <button
                onClick={() => setEditMode(false)}
                className="text-xs text-warm-400 hover:text-warm-700 underline transition-colors"
              >
                {t.exit}
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {!editMode && (
            <button
              onClick={openPasswordModal}
              className="text-xs text-warm-300 hover:text-warm-500 transition-colors"
              title="Edit mode"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </button>
          )}
          <button
            onClick={handleNearMe}
            disabled={nearbyLoading}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors shadow-sm ${nearbyMode ? "bg-blue-600 text-white border-blue-600" : "text-warm-600 bg-white border-warm-300 hover:bg-warm-50"}`}
          >
            📍 {nearbyLoading ? "Locating…" : nearbyMode ? "Exit nearby" : "Near me"}
          </button>
          {hasMap && (
            <button
              onClick={() => setShowMap(!showMap)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-warm-600 bg-white border border-warm-300 rounded-md hover:bg-warm-50 hover:border-warm-400 hover:text-warm-800 transition-colors shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {showMap
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.159.69.159 1.006 0z" />
                }
              </svg>
              {showMap ? t.hideMap : t.showMap}
            </button>
          )}
        </div>
      </div>

      {hasMap && <IncidentMap incidents={mapIncidents} showMap={showMap} />}

      {/* Nearby results banner */}
      {nearbyMode && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-sm font-semibold text-blue-800">
              📍 {nearbyIncidents.length} incident{nearbyIncidents.length === 1 ? "" : "s"} within {nearbyRadius} miles
            </span>
            <span className="text-xs text-blue-500 ml-2">
              Sorted by distance
            </span>
          </div>
          <select
            value={nearbyRadius}
            onChange={(e) => { setNearbyRadius(parseInt(e.target.value)); handleNearMe(); }}
            onClick={(e) => e.stopPropagation()}
            className="text-xs border border-blue-300 rounded px-2 py-1 bg-white"
          >
            <option value="10">10 miles</option>
            <option value="25">25 miles</option>
            <option value="50">50 miles</option>
            <option value="100">100 miles</option>
          </select>
        </div>
      )}

      {/* Incident list */}
      <IncidentList
        incidents={nearbyMode ? nearbyIncidents as any : incidents}
        total={nearbyMode ? nearbyIncidents.length : total}
        totalAll={nearbyMode ? nearbyIncidents.length : totalAll}
        page={nearbyMode ? 1 : page}
        totalPages={nearbyMode ? 1 : totalPages}
        editMode={editMode}
        pendingIncidents={editMode ? pendingIncidents : []}
      />

      {/* Password modal */}
      {showPasswordModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPasswordModal(false);
              setPasswordInput("");
              setPasswordError(false);
            }
          }}
        >
          <div className="bg-white rounded-xl shadow-2xl p-6 w-80 mx-4">
            <h2 className="text-base font-semibold text-warm-900 mb-1">{t.enterPassword}</h2>
            <p className="text-xs text-warm-400 mb-4">{t.editDescription}</p>
            <input
              ref={passwordRef}
              type="password"
              value={passwordInput}
              onChange={(e) => {
                setPasswordInput(e.target.value);
                setPasswordError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitPassword();
                if (e.key === "Escape") {
                  setShowPasswordModal(false);
                  setPasswordInput("");
                  setPasswordError(false);
                }
              }}
              placeholder={t.password}
              className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none transition-colors ${
                passwordError
                  ? "border-red-400 focus:border-red-500 bg-red-50"
                  : "border-warm-300 focus:border-warm-500"
              }`}
            />
            {passwordError && (
              <p className="text-xs text-red-500 mt-1">{t.incorrectPassword}</p>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={submitPassword}
                className="flex-1 px-4 py-2 bg-warm-800 text-white text-sm rounded-lg hover:bg-warm-900 transition-colors font-medium"
              >
                {t.unlock}
              </button>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordInput("");
                  setPasswordError(false);
                }}
                className="px-4 py-2 border border-warm-300 text-warm-600 text-sm rounded-lg hover:bg-warm-50 transition-colors"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
