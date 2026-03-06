"use client";

import { useState } from "react";

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

export function IncidentCard({ incident }: { incident: Incident }) {
  const [expanded, setExpanded] = useState(false);
  const tags = incident.incidentType
    ?.split(",")
    .map((t) => t.trim())
    .filter(Boolean) || [];

  return (
    <article
      className="border-b border-warm-200 py-5 cursor-pointer hover:bg-warm-100/50 transition-colors px-2 -mx-2"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-serif text-lg font-semibold leading-tight">
            {incident.headline || "Untitled incident"}
          </h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm text-warm-500">
            {incident.date && <span>{incident.date}</span>}
            {incident.location && (
              <>
                {incident.date && <span aria-hidden>&middot;</span>}
                <span>{incident.location}</span>
              </>
            )}
            {incident.country && (
              <>
                <span aria-hidden>&middot;</span>
                <span>{incident.country}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs bg-warm-100 text-warm-600 border border-warm-200"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="mt-3 space-y-3">
          {incident.summary && (
            <p className="text-sm text-warm-700 leading-relaxed">
              {incident.summary}
            </p>
          )}
          <a
            href={incident.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-block text-sm text-warm-900 underline hover:text-warm-600"
          >
            Read source article →
          </a>
        </div>
      )}

      {!expanded && incident.summary && (
        <p className="text-sm text-warm-500 mt-2 line-clamp-2">
          {incident.summary}
        </p>
      )}
    </article>
  );
}
