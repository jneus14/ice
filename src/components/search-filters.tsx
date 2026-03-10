"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import {
  INCIDENT_TYPE_TAGS,
  PERSON_IMPACTED_TAGS,
} from "@/lib/constants";

export function SearchFilters({ countries }: { countries: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentSearch = searchParams.get("q") || "";
  const currentTags = searchParams.getAll("tag");
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
    updateFilters({ tag: newTags.length > 0 ? newTags : null });
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
          placeholder="Search incidents by keyword, location, or name..."
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

      {/* Quick date range buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { label: "Past week", value: "week" },
          { label: "Past month", value: "month" },
          { label: "Past 3 months", value: "3months" },
          { label: "Past year", value: "year" },
        ].map(({ label, value }) => {
          const active = currentRange === value;
          return (
            <button
              key={value}
              onClick={() =>
                updateFilters({ range: active ? null : value, from: null, to: null })
              }
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                active
                  ? "bg-warm-800 text-white border-warm-800"
                  : "bg-white text-warm-600 border-warm-300 hover:border-warm-500"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Location + custom date range row */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Filter by location..."
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
          <span className="text-sm text-warm-500">From</span>
          <input
            type="date"
            value={currentDateFrom}
            onChange={(e) =>
              updateFilters({ from: e.target.value || null, range: null })
            }
            className="px-3 py-2 rounded-lg border border-warm-300 bg-white text-warm-700 text-sm focus:outline-none focus:border-warm-500"
          />
          <span className="text-sm text-warm-500">To</span>
          <input
            type="date"
            value={currentDateTo}
            onChange={(e) =>
              updateFilters({ to: e.target.value || null, range: null })
            }
            className="px-3 py-2 rounded-lg border border-warm-300 bg-white text-warm-700 text-sm focus:outline-none focus:border-warm-500"
          />
        </div>
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
            className="text-sm text-warm-400 hover:text-warm-700 underline"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Incident Type */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-warm-500 mb-2">
          Incident Type
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
                {tag.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Person(s) Impacted */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-warm-500 mb-2">
          Person(s) Impacted
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
                {tag.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Country of Origin */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-warm-500 mb-2">
          Country of Origin (Person(s) Impacted)
        </p>
        <select
          value={currentCountry}
          onChange={(e) => updateFilters({ country: e.target.value || null })}
          className="px-3 py-2 rounded-lg border border-warm-300 bg-white text-warm-700 text-sm focus:outline-none focus:border-warm-500 min-w-48"
        >
          <option value="">All Countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {isPending && (
        <div className="text-xs text-warm-400">Loading...</div>
      )}
    </div>
  );
}
