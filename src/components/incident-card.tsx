"use client";

import { useState } from "react";
import { parseAltSources } from "@/lib/sources";
import { INCIDENT_TYPE_TAGS, PERSON_IMPACTED_TAGS } from "@/lib/constants";

type Incident = {
  id: number;
  url: string;
  altSources: string | null;
  date: string | null;
  location: string | null;
  headline: string | null;
  summary: string | null;
  incidentType: string | null;
  country: string | null;
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDate(dateStr: string | null): string | null {
  if (!dateStr || dateStr === "null") return null;
  // ISO format: YYYY-MM-DD
  const iso = new Date(dateStr + "T12:00:00Z");
  if (!isNaN(iso.getTime())) {
    return `${MONTHS[iso.getUTCMonth()]} ${iso.getUTCDate()}, ${iso.getUTCFullYear()}`;
  }
  // M/D/YYYY or M/D
  const parts = dateStr.split("/");
  if (parts.length >= 2) {
    const m = parseInt(parts[0], 10);
    const d = parseInt(parts[1], 10);
    const y = parts.length >= 3 ? parseInt(parts[2], 10) : null;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return y ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${d}`;
    }
  }
  return dateStr;
}

const incidentTypeSet = new Set<string>(INCIDENT_TYPE_TAGS.map((t) => t.value));
const personImpactedSet = new Set<string>(PERSON_IMPACTED_TAGS.map((t) => t.value));

function getTagLabel(value: string): string {
  return (
    INCIDENT_TYPE_TAGS.find((t) => t.value === value)?.label ??
    PERSON_IMPACTED_TAGS.find((t) => t.value === value)?.label ??
    value
  );
}

export function IncidentCard({ incident }: { incident: Incident }) {
  const [expanded, setExpanded] = useState(false);

  const rawTags = [...new Set(
    incident.incidentType
      ?.split(",")
      .map((t) => t.trim())
      .filter(Boolean) ?? []
  )];

  const incidentTypeTags = rawTags.filter((t) => incidentTypeSet.has(t));
  const personImpactedTags = rawTags.filter((t) => personImpactedSet.has(t));
  const otherTags = rawTags.filter(
    (t) => !incidentTypeSet.has(t) && !personImpactedSet.has(t)
  );

  const allSources = [incident.url, ...parseAltSources(incident.altSources)];
  const hasMeta = incident.date || incident.location || incident.country;

  return (
    <article
      className="group border-b border-warm-200 py-5 cursor-pointer transition-colors hover:bg-warm-50/70 px-3 -mx-3"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Headline */}
          <h3 className="font-serif text-[1.05rem] font-semibold leading-snug text-warm-900 group-hover:text-warm-700 transition-colors">
            {incident.headline || "Untitled incident"}
          </h3>

          {/* Date · Location · Country */}
          {hasMeta && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[0.8rem] text-warm-400">
              {incident.date && (
                <span className="font-medium text-warm-500">{formatDate(incident.date)}</span>
              )}
              {incident.date && incident.location && (
                <span aria-hidden className="text-warm-300">·</span>
              )}
              {incident.location && <span>{incident.location}</span>}
              {incident.country && (
                <>
                  <span aria-hidden className="text-warm-300">·</span>
                  <span>{incident.country}</span>
                </>
              )}
            </div>
          )}

          {/* Tags */}
          {rawTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {incidentTypeTags.map((tag) => (
                <span
                  key={`it:${tag}`}
                  className="px-2 py-0.5 text-[0.7rem] font-medium rounded-full bg-blue-50 text-blue-600 border border-blue-200"
                >
                  {getTagLabel(tag)}
                </span>
              ))}
              {personImpactedTags.map((tag) => (
                <span
                  key={`pi:${tag}`}
                  className="px-2 py-0.5 text-[0.7rem] font-medium rounded-full bg-purple-50 text-purple-600 border border-purple-200"
                >
                  {getTagLabel(tag)}
                </span>
              ))}
              {otherTags.map((tag) => (
                <span
                  key={`ot:${tag}`}
                  className="px-2 py-0.5 text-[0.7rem] font-medium rounded-full bg-warm-100 text-warm-500 border border-warm-200"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Summary preview (collapsed) */}
          {!expanded && incident.summary && (
            <p className="text-sm text-warm-500 mt-2 line-clamp-2 leading-relaxed">
              {incident.summary}
            </p>
          )}

          {/* Expanded content */}
          {expanded && (
            <div className="mt-3 space-y-3">
              {incident.summary && (
                <p className="text-sm text-warm-700 leading-relaxed">
                  {incident.summary}
                </p>
              )}
              <div className="flex flex-col gap-1">
                {[...new Set(allSources)].map((src, i) => (
                  <a
                    key={src}
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-sm text-warm-700 hover:text-orange-600 underline underline-offset-2 transition-colors"
                  >
                    {i === 0 ? "Read source" : `Additional source ${i}`}
                    <span aria-hidden>→</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Expand chevron */}
        <div className="pt-1 text-warm-300 group-hover:text-warm-400 transition-colors shrink-0">
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </article>
  );
}
