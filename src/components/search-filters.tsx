"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import {
  INCIDENT_TYPE_TAGS,
  PERSON_IMPACTED_TAGS,
  ENFORCEMENT_SETTING_TAGS,
  SOURCE_TYPE_TAGS,
} from "@/lib/constants";
import { useLanguage } from "@/lib/i18n";

function TagSection({
  label,
  tags,
  activeTags,
  onToggle,
  colorActive,
  colorInactive,
  translate,
}: {
  label: string;
  tags: readonly { value: string; label: string }[];
  activeTags: string[];
  onToggle: (tag: string) => void;
  colorActive: string;
  colorInactive: string;
  translate: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = tags.filter((t) => activeTags.includes(t.value)).length;

  const tagButtons = tags.map((tag) => {
    const active = activeTags.includes(tag.value);
    return (
      <button
        key={tag.value}
        onClick={() => onToggle(tag.value)}
        className={`px-2.5 py-1 text-xs rounded-full border transition-colors whitespace-nowrap ${
          active
            ? `${colorActive} text-white border-transparent`
            : `bg-white ${colorInactive} hover:border-current`
        }`}
      >
        {translate(tag.value) ?? tag.label}
      </button>
    );
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-warm-500">
          {label}
        </p>
        {activeCount > 0 && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${colorActive} text-white`}>
            {activeCount}
          </span>
        )}
      </div>
      {/* Always show tags — single line when collapsed, all when expanded */}
      <div className="flex items-center gap-1.5">
        <div className={`flex flex-wrap gap-1.5 ${open ? "" : "max-h-[30px] overflow-hidden"} flex-1 min-w-0`}>
          {tagButtons}
        </div>
        <button
          onClick={() => setOpen(!open)}
          className={`flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full border-2 transition-transform ${open ? "rotate-180 bg-warm-600 border-warm-600" : "border-warm-400 bg-warm-100 hover:bg-warm-200"}`}
          title={open ? "Show less" : "Show all"}
        >
          <svg
            className={`w-3 h-3 ${open ? "text-white" : "text-warm-600"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function SearchFilters({ countries }: { countries: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const { t } = useLanguage();

  const currentSearch = searchParams.get("q") || "";
  const currentTags = searchParams.getAll("tag");
  const currentTagMode = (searchParams.get("tagMode") || "all") as "all" | "any";
  const currentSourceTypes = searchParams.getAll("sourceType");
  const currentCountry = searchParams.get("country") || "";
  const currentLocation = searchParams.get("location") || "";
  const currentDateFrom = searchParams.get("from") || "";
  const currentDateTo = searchParams.get("to") || "";
  const currentRange = searchParams.get("range") || "";

  const [localSearch, setLocalSearch] = useState(currentSearch);
  const [localLocation, setLocalLocation] = useState(currentLocation);
  const prevSearchRef = useRef(currentSearch);
  const prevLocationRef = useRef(currentLocation);

  // Sync local state when URL params change externally (e.g. clear filters)
  if (prevSearchRef.current !== currentSearch) {
    prevSearchRef.current = currentSearch;
    if (localSearch !== currentSearch) setLocalSearch(currentSearch);
  }
  if (prevLocationRef.current !== currentLocation) {
    prevLocationRef.current = currentLocation;
    if (localLocation !== currentLocation) setLocalLocation(currentLocation);
  }

  const hasFilters =
    currentSearch ||
    currentTags.length > 0 ||
    currentSourceTypes.length > 0 ||
    currentCountry ||
    currentLocation ||
    currentDateFrom ||
    currentDateTo ||
    currentRange ||
    searchParams.has("n");

  const updateFilters = useCallback(
    (updates: Record<string, string | string[] | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        params.delete(key);
        if (value === null || value === "") continue;
        if (Array.isArray(value)) {
          value.forEach((v) => params.append(key, v));
        } else {
          params.set(key, value);
        }
      }
      params.delete("page");
      startTransition(() => {
        router.push(`/?${params.toString()}`);
      });
    },
    [router, searchParams, startTransition]
  );

  const toggleTag = (tag: string) => {
    const newTags = currentTags.includes(tag)
      ? currentTags.filter((t) => t !== tag)
      : [...currentTags, tag];
    updateFilters({
      tag: newTags.length > 0 ? newTags : null,
      ...(newTags.length <= 1 ? { tagMode: null } : {}),
    });
  };

  const toggleSourceType = (st: string) => {
    const newTypes = currentSourceTypes.includes(st)
      ? currentSourceTypes.filter((t) => t !== st)
      : [...currentSourceTypes, st];
    updateFilters({
      sourceType: newTypes.length > 0 ? newTypes : null,
    });
  };

  return (
    <div className="mb-6 space-y-3">
      {/* Search bar */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          placeholder={t.searchPlaceholder}
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              updateFilters({ q: localSearch || null });
            }
          }}
          onBlur={() => {
            if (localSearch !== currentSearch) {
              updateFilters({ q: localSearch || null });
            }
          }}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-warm-300 bg-white text-sm text-warm-900 placeholder:text-warm-400 focus:outline-none focus:border-warm-500 transition-colors"
        />
      </div>

      {/* Location + date range row */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
        <input
          type="text"
          placeholder={t.locationPlaceholder}
          value={localLocation}
          onChange={(e) => setLocalLocation(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              updateFilters({ location: localLocation || null });
            }
          }}
          onBlur={() => {
            if (localLocation !== currentLocation) {
              updateFilters({ location: localLocation || null });
            }
          }}
          className="px-3 py-2 rounded-lg border border-warm-300 bg-white text-warm-700 text-sm focus:outline-none focus:border-warm-500 w-full sm:w-44"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-warm-500">{t.from}</span>
          <input
            type="date"
            value={currentDateFrom}
            onChange={(e) =>
              updateFilters({ from: e.target.value || null, range: null })
            }
            className="px-3 py-2 rounded-lg border border-warm-300 bg-white text-warm-700 text-sm focus:outline-none focus:border-warm-500 max-w-[150px]"
          />
          <span className="text-sm text-warm-500">{t.to}</span>
          <input
            type="date"
            value={currentDateTo}
            onChange={(e) =>
              updateFilters({ to: e.target.value || null, range: null })
            }
            className="px-3 py-2 rounded-lg border border-warm-300 bg-white text-warm-700 text-sm focus:outline-none focus:border-warm-500 max-w-[150px]"
          />
        </div>
        <button
          onClick={() =>
            updateFilters({
              q: null,
              tag: null,
              tagMode: null,
              sourceType: null,
              country: null,
              location: null,
              from: null,
              to: null,
              range: null,
              n: null,
              s: null,
              e: null,
              w: null,
            })
          }
          disabled={!hasFilters}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-500 border border-red-500 rounded-lg hover:bg-red-600 transition-colors shadow-sm disabled:opacity-30 disabled:cursor-default disabled:bg-warm-300 disabled:border-warm-300 disabled:text-warm-500"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          {t.clearFilters}
        </button>
        <a
          href={`/api/export?format=csv&${searchParams.toString()}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-warm-600 border border-warm-300 rounded-lg hover:bg-warm-50 transition-colors shadow-sm"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </a>
      </div>

      {/* Collapsible tag sections */}
      <TagSection
        label={t.incidentType}
        tags={INCIDENT_TYPE_TAGS}
        activeTags={currentTags}
        onToggle={toggleTag}
        colorActive="bg-blue-500"
        colorInactive="text-blue-600 border-blue-300"
        translate={(v) => t.tags.incidentTypes[v]}
      />

      <TagSection
        label={t.personImpacted}
        tags={PERSON_IMPACTED_TAGS}
        activeTags={currentTags}
        onToggle={toggleTag}
        colorActive="bg-purple-500"
        colorInactive="text-purple-600 border-purple-300"
        translate={(v) => t.tags.personImpacted[v]}
      />

      <TagSection
        label={t.enforcementSetting}
        tags={ENFORCEMENT_SETTING_TAGS}
        activeTags={currentTags}
        onToggle={toggleTag}
        colorActive="bg-green-600"
        colorInactive="text-green-700 border-green-300"
        translate={(v) => t.tags.enforcementSettings[v]}
      />

      <TagSection
        label={t.sourceType}
        tags={SOURCE_TYPE_TAGS}
        activeTags={currentSourceTypes}
        onToggle={toggleSourceType}
        colorActive="bg-orange-500"
        colorInactive="text-orange-600 border-orange-300"
        translate={(v) => t.tags.sourceTypes[v]}
      />

      {/* ALL / ANY toggle — only shown when 2+ tags are active */}
      {currentTags.length >= 2 && (
        <div className="flex items-center gap-2.5 py-1">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-warm-500">
            {t.showIncidentsMatching}
          </span>
          <div className="flex rounded-md border border-warm-300 overflow-hidden text-xs shadow-sm">
            <button
              onClick={() => updateFilters({ tagMode: null })}
              className={`px-3 py-1.5 font-medium transition-colors ${
                currentTagMode === "all"
                  ? "bg-warm-800 text-white"
                  : "bg-white text-warm-600 hover:bg-warm-50"
              }`}
            >
              {t.allSelectedTags}
            </button>
            <button
              onClick={() => updateFilters({ tagMode: "any" })}
              className={`px-3 py-1.5 font-medium border-l border-warm-300 transition-colors ${
                currentTagMode === "any"
                  ? "bg-warm-800 text-white"
                  : "bg-white text-warm-600 hover:bg-warm-50"
              }`}
            >
              {t.anySelectedTag}
            </button>
          </div>
          <span className="text-[11px] text-warm-400">
            {currentTagMode === "any"
              ? t.showingUnion(currentTags.length)
              : t.showingIntersection(currentTags.length)}
          </span>
        </div>
      )}

      {/* Country of Origin */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-warm-500 mb-2">
          {t.countryOfOrigin}
        </p>
        <select
          value={currentCountry}
          onChange={(e) => updateFilters({ country: e.target.value || null })}
          className="px-3 py-2 rounded-lg border border-warm-300 bg-white text-warm-700 text-sm focus:outline-none focus:border-warm-500 w-full sm:min-w-48 sm:w-auto"
        >
          <option value="">{t.allCountries}</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {isPending && (
        <div className="text-xs text-warm-400">{t.loading}</div>
      )}
    </div>
  );
}
