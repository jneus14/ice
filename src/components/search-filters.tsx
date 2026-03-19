"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import {
  INCIDENT_TYPE_TAGS,
  PERSON_IMPACTED_TAGS,
} from "@/lib/constants";
import { useLanguage } from "@/lib/i18n";

export function SearchFilters({ countries }: { countries: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const { t } = useLanguage();

  const currentSearch = searchParams.get("q") || "";
  const currentTags = searchParams.getAll("tag");
  const currentTagMode = (searchParams.get("tagMode") || "all") as "all" | "any";
  const currentCountry = searchParams.get("country") || "";
  const currentLocation = searchParams.get("location") || "";
  const currentDateFrom = searchParams.get("from") || "";
  const currentDateTo = searchParams.get("to") || "";
  const currentRange = searchParams.get("range") || "";

  const hasFilters =
    currentSearch ||
    currentTags.length > 0 ||
    currentCountry ||
    currentLocation ||
    currentDateFrom ||
    currentDateTo ||
    currentRange;

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
      // Auto-clear tagMode when back to 0 or 1 tag — mode is only meaningful with 2+
      ...(newTags.length <= 1 ? { tagMode: null } : {}),
    });
  };

  return (
    <div className="mb-6 space-y-4">
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
          defaultValue={currentSearch}
          onChange={(e) => {
            const value = e.target.value;
            const timeout = setTimeout(() => {
              updateFilters({ q: value || null });
            }, 300);
            return () => clearTimeout(timeout);
          }}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-warm-300 bg-white text-sm text-warm-900 placeholder:text-warm-400 focus:outline-none focus:border-warm-500 transition-colors"
        />
      </div>


      {/* Location + custom date range row */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder={t.locationPlaceholder}
          defaultValue={currentLocation}
          onChange={(e) => {
            const value = e.target.value;
            const timeout = setTimeout(() => {
              updateFilters({ location: value || null });
            }, 300);
            return () => clearTimeout(timeout);
          }}
          className="px-3 py-2 rounded-lg border border-warm-300 bg-white text-warm-700 text-sm focus:outline-none focus:border-warm-500 w-44"
        />
        <div className="flex items-center gap-2">
          <span className="text-sm text-warm-500">{t.from}</span>
          <input
            type="date"
            value={currentDateFrom}
            onChange={(e) =>
              updateFilters({ from: e.target.value || null, range: null })
            }
            className="px-3 py-2 rounded-lg border border-warm-300 bg-white text-warm-700 text-sm focus:outline-none focus:border-warm-500"
          />
          <span className="text-sm text-warm-500">{t.to}</span>
          <input
            type="date"
            value={currentDateTo}
            onChange={(e) =>
              updateFilters({ to: e.target.value || null, range: null })
            }
            className="px-3 py-2 rounded-lg border border-warm-300 bg-white text-warm-700 text-sm focus:outline-none focus:border-warm-500"
          />
        </div>
        <button
          onClick={() =>
            updateFilters({
              q: null,
              tag: null,
              tagMode: null,
              country: null,
              location: null,
              from: null,
              to: null,
              range: null,
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
      </div>

      {/* Incident Type */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-warm-500 mb-2">
          {t.incidentType}
        </p>
        <div className="flex flex-wrap gap-2">
          {INCIDENT_TYPE_TAGS.map((tag) => {
            const active = currentTags.includes(tag.value);
            return (
              <button
                key={tag.value}
                onClick={() => toggleTag(tag.value)}
                className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                  active
                    ? "bg-blue-500 text-white border-blue-500"
                    : "bg-white text-blue-600 border-blue-300 hover:border-blue-400"
                }`}
              >
                {t.tags.incidentTypes[tag.value] ?? tag.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Person(s) Impacted */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-warm-500 mb-2">
          {t.personImpacted}
        </p>
        <div className="flex flex-wrap gap-2">
          {PERSON_IMPACTED_TAGS.map((tag) => {
            const active = currentTags.includes(tag.value);
            return (
              <button
                key={tag.value}
                onClick={() => toggleTag(tag.value)}
                className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                  active
                    ? "bg-purple-500 text-white border-purple-500"
                    : "bg-white text-purple-600 border-purple-300 hover:border-purple-400"
                }`}
              >
                {t.tags.personImpacted[tag.value] ?? tag.label}
              </button>
            );
          })}
        </div>
      </div>

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
          className="px-3 py-2 rounded-lg border border-warm-300 bg-white text-warm-700 text-sm focus:outline-none focus:border-warm-500 min-w-48"
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
