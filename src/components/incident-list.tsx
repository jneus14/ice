"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { IncidentCard } from "./incident-card";
import { TIME_RANGES } from "@/lib/constants";

type Incident = {
  id: number;
  url: string;
  date: string | null;
  location: string | null;
  headline: string | null;
  summary: string | null;
  incidentType: string | null;
  country: string | null;
};

export function IncidentList({
  incidents,
  total,
  totalAll,
  page,
  totalPages,
}: {
  incidents: Incident[];
  total: number;
  totalAll: number;
  page: number;
  totalPages: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const currentRange = searchParams.get("range") || "all";

  const setRange = (range: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (range === "all") {
      params.delete("range");
    } else {
      params.set("range", range);
    }
    startTransition(() => {
      router.push(`/?${params.toString()}`);
    });
  };

  return (
    <div>
      {/* Time range + count bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {TIME_RANGES.map((range) => (
            <button
              key={range.value}
              onClick={() => setRange(range.value)}
              className={`px-3 py-1 text-xs font-medium rounded-md border transition-colors ${
                currentRange === range.value
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-white text-warm-600 border-warm-300 hover:border-warm-400"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-warm-500">
          <span className="font-semibold text-warm-700">{total}</span> of{" "}
          <span className="font-semibold text-warm-700">{totalAll}</span>{" "}
          incidents
        </p>
      </div>

      {isPending && (
        <div className="text-xs text-warm-400 mb-3">Loading...</div>
      )}

      {incidents.length === 0 ? (
        <div className="py-12 text-center text-warm-400">
          No incidents found matching your filters.
        </div>
      ) : (
        <>
          <div>
            {incidents.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))}
          </div>
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} />
          )}
        </>
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  return (
    <div className="flex items-center justify-center gap-2 mt-8">
      {page > 1 && (
        <a
          href={`?page=${page - 1}`}
          className="px-3 py-1.5 rounded-md border border-warm-300 text-sm hover:bg-warm-100 transition-colors"
        >
          Previous
        </a>
      )}
      <span className="text-sm text-warm-500">
        Page {page} of {totalPages}
      </span>
      {page < totalPages && (
        <a
          href={`?page=${page + 1}`}
          className="px-3 py-1.5 rounded-md border border-warm-300 text-sm hover:bg-warm-100 transition-colors"
        >
          Next
        </a>
      )}
    </div>
  );
}
