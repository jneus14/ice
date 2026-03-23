"use client";

import { useState, useEffect } from "react";

type Insight = {
  type: "spike" | "cluster" | "trend";
  title: string;
  description: string;
  count: number;
  linkParams: string;
};

export function InsightCards() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/patterns")
      .then((r) => r.json())
      .then((d) => setInsights(d.insights ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (insights.length === 0) return null;

  const icons = {
    spike: "📈",
    cluster: "📍",
    trend: "📊",
  };

  const colors = {
    spike: "border-red-200 bg-red-50/50",
    cluster: "border-amber-200 bg-amber-50/50",
    trend: "border-blue-200 bg-blue-50/50",
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-warm-900 mb-3">Trending Patterns</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {insights.map((insight, i) => (
          <a
            key={i}
            href={`/?${insight.linkParams}`}
            className={`block border rounded-lg p-3 hover:shadow-sm transition-shadow ${colors[insight.type]}`}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg">{icons[insight.type]}</span>
              <div>
                <p className="text-sm font-semibold text-warm-800">{insight.title}</p>
                <p className="text-xs text-warm-500 mt-0.5">{insight.description}</p>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
