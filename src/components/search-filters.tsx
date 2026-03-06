"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { INCIDENT_TAGS } from "@/lib/constants";

export function SearchFilters({
  countries,
}: {
  countries: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentSearch = searchParams.get("q") || "";
  const currentTags = searchParams.getAll("tag");
  const currentCountry = searchParams.get("country") || "";
  const currentDateFrom = searchParams.get("from") || "";
  const currentDateTo = searchParams.get("to") || "";

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
    <div className="space-y-4 mb-8">
      <div>
        <input
          type="text"
          placeholder="Search incidents..."
          defaultValue={currentSearch}
          onChange={(e) => {
            const value = e.target.value;
            const timeout = setTimeout(() => {
              updateFilters({ q: value || null });
            }, 300);
            return () => clearTimeout(timeout);
          }}
          className="w-full px-4 py-2.5 border border-warm-300 bg-white text-warm-900 placeholder:text-warm-400 focus:outline-none focus:border-warm-900 transition-colors"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {INCIDENT_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => toggleTag(tag)}
            className={`px-3 py-1 text-xs font-medium border transition-colors ${
              currentTags.includes(tag)
                ? "bg-warm-900 text-white border-warm-900"
                : "bg-white text-warm-600 border-warm-300 hover:border-warm-500"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={currentCountry}
          onChange={(e) => updateFilters({ country: e.target.value || null })}
          className="px-3 py-2 border border-warm-300 bg-white text-warm-700 text-sm focus:outline-none focus:border-warm-900"
        >
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={currentDateFrom}
          onChange={(e) => updateFilters({ from: e.target.value || null })}
          className="px-3 py-2 border border-warm-300 bg-white text-warm-700 text-sm focus:outline-none focus:border-warm-900"
        />
        <input
          type="date"
          value={currentDateTo}
          onChange={(e) => updateFilters({ to: e.target.value || null })}
          className="px-3 py-2 border border-warm-300 bg-white text-warm-700 text-sm focus:outline-none focus:border-warm-900"
        />

        {(currentSearch || currentTags.length > 0 || currentCountry || currentDateFrom || currentDateTo) && (
          <button
            onClick={() =>
              updateFilters({ q: null, tag: null, country: null, from: null, to: null })
            }
            className="px-3 py-2 text-sm text-warm-500 hover:text-warm-900 underline"
          >
            Clear all
          </button>
        )}
      </div>

      {isPending && (
        <div className="text-sm text-warm-400">Loading...</div>
      )}
    </div>
  );
}
