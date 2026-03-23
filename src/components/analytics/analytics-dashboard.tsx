"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { TimeSeriesChart } from "./time-series-chart";
import { TypeBreakdownChart } from "./type-breakdown-chart";
import { StateChart } from "./state-chart";
import { InsightCards } from "./insight-cards";

type AnalyticsData = {
  total: number;
  timeSeries: Array<{ period: string; count: number }>;
  byIncidentType: Array<{ type: string; count: number }>;
  byPersonImpacted: Array<{ type: string; count: number }>;
  byState: Array<{ state: string; count: number }>;
  byCountry: Array<{ country: string; count: number }>;
};

function Dashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const granularity = searchParams.get("granularity") ?? "month";

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(searchParams.toString());
      const res = await fetch(`/api/analytics?${params.toString()}`);
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }, [searchParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function setGranularity(g: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("granularity", g);
    router.push(`/analytics?${params.toString()}`);
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-8">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-md border border-warm-300 overflow-hidden text-xs shadow-sm">
          <button
            onClick={() => setGranularity("week")}
            className={`px-3 py-1.5 font-medium transition-colors ${granularity === "week" ? "bg-warm-800 text-white" : "bg-white text-warm-600 hover:bg-warm-50"}`}
          >
            Weekly
          </button>
          <button
            onClick={() => setGranularity("month")}
            className={`px-3 py-1.5 font-medium border-l border-warm-300 transition-colors ${granularity === "month" ? "bg-warm-800 text-white" : "bg-white text-warm-600 hover:bg-warm-50"}`}
          >
            Monthly
          </button>
        </div>
        <button
          onClick={copyLink}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-warm-300 text-warm-600 hover:bg-warm-50 transition-colors"
        >
          {copied ? "✓ Link copied" : "🔗 Share this view"}
        </button>
        <a
          href="/"
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-warm-300 text-warm-600 hover:bg-warm-50 transition-colors"
        >
          ← Back to tracker
        </a>
        {data && (
          <span className="text-sm text-warm-500 ml-auto">
            <span className="font-semibold text-warm-700">{data.total}</span> incidents
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-20 text-center text-warm-400">Loading analytics…</div>
      ) : data ? (
        <>
          {/* Trending Patterns */}
          <InsightCards />

          {/* Time Series */}
          <div className="bg-white border border-warm-200 rounded-lg p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-warm-900 mb-4">
              Incidents Over Time
            </h2>
            <TimeSeriesChart data={data.timeSeries} granularity={granularity} />
          </div>

          {/* Two column: Incident Type + Person Impacted */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-warm-200 rounded-lg p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-warm-900 mb-4">
                By Incident Type
              </h2>
              <TypeBreakdownChart data={data.byIncidentType} />
            </div>
            <div className="bg-white border border-warm-200 rounded-lg p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-warm-900 mb-4">
                By Person Impacted
              </h2>
              <TypeBreakdownChart data={data.byPersonImpacted} color="#a855f7" />
            </div>
          </div>

          {/* State */}
          <div className="bg-white border border-warm-200 rounded-lg p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-warm-900 mb-4">
              By State
            </h2>
            <StateChart data={data.byState.slice(0, 15)} />
          </div>

          {/* Country */}
          {data.byCountry.length > 0 && (
            <div className="bg-white border border-warm-200 rounded-lg p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-warm-900 mb-4">
                By Country of Origin
              </h2>
              <TypeBreakdownChart data={data.byCountry.map((c) => ({ type: c.country, count: c.count }))} />
            </div>
          )}
        </>
      ) : (
        <div className="py-20 text-center text-warm-400">Failed to load analytics</div>
      )}
    </div>
  );
}

export function AnalyticsDashboard() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-warm-400">Loading…</div>}>
      <Dashboard />
    </Suspense>
  );
}
