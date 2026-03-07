"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import {
  INCIDENT_TYPE_TAGS,
  PERSON_IMPACTED_TAGS,
} from "@/lib/constants";

export function SearchFilters({ countries }: { countries: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const currentSearch = searchParams.get("q") || "";
  const currentTags = searchParams.getAll("tag");
  const currentCountry = searchParams.get("country") || "";
  const currentLocation = searchParams.get("location") || "";
  const currentDateFrom = searchParams.get("from") || "";
  const currentDateTo = searchParams.get("to") || "";

  const activeFilterCount =
    currentTags.length +
    (currentCountry ? 1 : 0) +
    (currentLocation ? 1 : 0) +
    (currentDateFrom ? 1 : 0) +
    (currentDateTo ? 1 : 0);

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
    updateFilters({ tag: newTags.length > 0 ? newTags : null });
  };

  const hasFilters =
    currentSearch || activeFilterCount > 0;

  return (
    <div className="mb-6 space-y-3">
      {/* Search bar + filter toggle row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
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
            placeholder="Search by keyword, location, or name..."
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
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${
            filtersOpen || activeFilterCount > 0
              ? "bg-warm-800 text-white border-warm-800"
              : "bg-white text-warm-600 border-warm-300 hover:border-warm-400"
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="8" y1="12" x2="20" y2="12" />
            <line x1="12" y1="18" x2="20" y2="18" />
          </svg>
          Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
        </button>
        {hasFilters && (
          <button
            onClick={() =>
              updateFilters({
                q: null,
                tag: null,
                country: null,
                location: null,
                from: null,
                to: null,
                range: null,
              })
            }
            className="px-3 py-2.5 rounded-lg border border-warm-300 text-sm text-warm-500 hover:text-warm-700 hover:border-warm-400 transition-colors whitespace-nowrap"
          >
            Clear
          </button>
        )}
      </div>

      {/* Expandable filter panel */}
      {filtersOpen && (
        <div className="rounded-lg border border-warm-200 bg-warm-50 p-4 space-y-3">
          {/* Top row: location, dates, country */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Location..."
              defaultValue={currentLocation}
              onChange={(e) => {
                const value = e.target.value;
                const timeout = setTimeout(() => {
                  updateFilters({ location: value || null });
                }, 300);
                return () => clearTimeout(timeout);
              }}
              className="px-2.5 py-1.5 rounded-md border border-warm-300 bg-white text-warm-700 text-sm focus:outline-none focus:border-warm-500 w-36"
            />
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={currentDateFrom}
                onChange={(e) =>
                  updateFilters({ from: e.target.value || null })
                }
                className="px-2.5 py-1.5 rounded-md border border-warm-300 bg-white text-warm-700 text-sm focus:outline-none focus:border-warm-500"
              />
              <span className="text-warm-400 text-xs">to</span>
              <input
                type="date"
                value={currentDateTo}
                onChange={(e) =>
                  updateFilters({ to: e.target.value || null })
                }
                className="px-2.5 py-1.5 rounded-md border border-warm-300 bg-white text-warm-700 text-sm focus:outline-none focus:border-warm-500"
              />
            </div>
            <select
              value={currentCountry}
              onChange={(e) =>
                updateFilters({ country: e.target.value || null })
              }
              className="px-2.5 py-1.5 rounded-md border border-warm-300 bg-white text-warm-700 text-sm focus:outline-none focus:border-warm-500"
            >
              <option value="">All Countries</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Tag rows — compact pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-warm-400 mr-1">
              Type
            </span>
            {INCIDENT_TYPE_TAGS.map((tag) => (
              <button
                key={tag.value}
                onClick={() => toggleTag(tag.value)}
                className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                  currentTags.includes(tag.value)
                    ? "bg-orange-100 text-orange-800 border-orange-300"
                    : "bg-white text-warm-600 border-warm-300 hover:border-warm-400"
                }`}
              >
                {tag.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-warm-400 mr-1">
              Person
            </span>
            {PERSON_IMPACTED_TAGS.map((tag) => (
              <button
                key={tag.value}
                onClick={() => toggleTag(tag.value)}
                className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                  currentTags.includes(tag.value)
                    ? "bg-orange-100 text-orange-800 border-orange-300"
                    : "bg-white text-warm-600 border-warm-300 hover:border-warm-400"
                }`}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isPending && (
        <div className="text-xs text-warm-400">Loading...</div>
      )}
    </div>
  );
}
