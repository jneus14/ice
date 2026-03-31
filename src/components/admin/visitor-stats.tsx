"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Stats = {
  totalViews: number;
  viewsByPath: { path: string; count: number }[];
  viewsByDay: { date: string; count: number }[];
};

export function VisitorStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/pageviews?days=${days}`)
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="border border-warm-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-warm-900 mb-4">Visitor Analytics</h2>
        <p className="text-warm-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="border border-warm-200 rounded-lg p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-warm-900">Visitor Analytics</h2>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                days === d
                  ? "bg-warm-800 text-white border-warm-800"
                  : "border-warm-300 text-warm-600 hover:bg-warm-50"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Total views */}
      <div className="border border-warm-200 p-4 rounded-md">
        <div className="text-3xl font-bold text-warm-900">{stats.totalViews.toLocaleString()}</div>
        <div className="text-xs text-warm-500 uppercase tracking-wide">
          Page views (last {days} days)
        </div>
      </div>

      {/* Daily chart */}
      {stats.viewsByDay.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-warm-700 mb-3">Views per day</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={stats.viewsByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => {
                  const d = new Date(v);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#92400e"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top pages */}
      {stats.viewsByPath.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-warm-700 mb-3">Top pages</h3>
          <div className="divide-y divide-warm-100">
            {stats.viewsByPath.map((p) => (
              <div key={p.path} className="flex justify-between py-2 text-sm">
                <span className="text-warm-700 font-mono truncate mr-4">{p.path}</span>
                <span className="text-warm-500 font-medium whitespace-nowrap">
                  {p.count.toLocaleString()} views
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
