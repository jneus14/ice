"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseAltSources } from "@/lib/sources";
import { INCIDENT_TYPE_TAGS, PERSON_IMPACTED_TAGS } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n";

type TimelineEvent = {
  date: string;
  event: string;
  source?: string;
  sources?: string[];
};

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
  imageUrl: string | null;
  timeline: string | null;
  approved?: boolean;
};

type CombineCandidate = {
  id: number;
  headline: string;
  date: string | null;
  location: string | null;
  score: number;
  approved: boolean;
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDate(dateStr: string | null): string | null {
  if (!dateStr || dateStr === "null") return null;
  // ISO format: YYYY-MM-DD
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
  }
  // YYYY-MM (month only, ISO)
  const isoMonthMatch = dateStr.match(/^(\d{4})-(\d{2})$/);
  if (isoMonthMatch) {
    const [, y, m] = isoMonthMatch;
    return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
  }
  // YYYY/M/D (reversed slash format)
  const reversedMatch = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (reversedMatch) {
    const [, y, m, d] = reversedMatch;
    return `${MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
  }
  // M/D/YYYY or M/D
  const parts = dateStr.split("/");
  if (parts.length >= 2) {
    const m = parseInt(parts[0], 10);
    const d = parseInt(parts[1], 10);
    const y = parts.length >= 3 ? parseInt(parts[2], 10) : null;
    // M/YYYY (month/year only, no day)
    if (m >= 1 && m <= 12 && y === null && d >= 1900) {
      return `${MONTHS[m - 1]} ${d}`;
    }
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return y ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${d}`;
    }
  }
  // YYYY alone
  if (/^\d{4}$/.test(dateStr)) return dateStr;
  // Unknown / unparseable — return null to skip display
  if (/unknown/i.test(dateStr)) return null;
  return dateStr;
}

const SOURCE_NAMES: Record<string, string> = {
  "nytimes.com": "New York Times",
  "washingtonpost.com": "Washington Post",
  "theguardian.com": "The Guardian",
  "bbc.com": "BBC",
  "bbc.co.uk": "BBC",
  "apnews.com": "Associated Press",
  "cnn.com": "CNN",
  "nbcnews.com": "NBC News",
  "msnbc.com": "MSNBC",
  "abcnews.go.com": "ABC News",
  "cbsnews.com": "CBS News",
  "reuters.com": "Reuters",
  "politico.com": "Politico",
  "axios.com": "Axios",
  "npr.org": "NPR",
  "thehill.com": "The Hill",
  "huffpost.com": "HuffPost",
  "propublica.org": "ProPublica",
  "usatoday.com": "USA Today",
  "latimes.com": "Los Angeles Times",
  "chicagotribune.com": "Chicago Tribune",
  "nypost.com": "New York Post",
  "foxnews.com": "Fox News",
  "democracynow.org": "Democracy Now",
  "thedailybeast.com": "The Daily Beast",
  "vice.com": "VICE",
  "aclu.org": "ACLU",
  "immigrant-rights.org": "Immigrant Rights",
  "nilc.org": "NILC",
  "cato.org": "Cato Institute",
  "migrationpolicy.org": "Migration Policy Institute",
  "instagram.com": "Instagram",
  "youtube.com": "YouTube",
  "twitter.com": "Twitter/X",
  "x.com": "Twitter/X",
  "facebook.com": "Facebook",
};

const SOCIAL_HOSTS = new Set(["instagram.com", "facebook.com", "tiktok.com", "twitter.com", "x.com"]);

function getSourceName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return SOURCE_NAMES[host] ?? host;
  } catch {
    return url;
  }
}

function isSocial(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return SOCIAL_HOSTS.has(host);
  } catch {
    return false;
  }
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

function serializeAltSources(urls: string[]): string | null {
  const f = urls.map((u) => u.trim()).filter(Boolean);
  return f.length > 0 ? JSON.stringify(f) : null;
}

export function IncidentCard({
  incident,
  editMode = false,
  translatedHeadline = null,
  translateSummary = false,
}: {
  incident: Incident;
  editMode?: boolean;
  translatedHeadline?: string | null;
  translateSummary?: boolean;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [translatedSummary, setTranslatedSummary] = useState<string | null>(null);
  const [translatingSum, setTranslatingSum] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [approving, setApproving] = useState(false);
  const [combining, setCombining] = useState(false);
  const [candidates, setCandidates] = useState<CombineCandidate[]>([]);
  const [showCandidates, setShowCandidates] = useState(false);
  const [combiningInto, setCombiningInto] = useState<number | null>(null);

  const isPending = editMode && incident.approved === false;

  async function handleApprove() {
    setApproving(true);
    try {
      const res = await fetch(`/api/incidents/${incident.id}/approve`, {
        method: "POST",
        headers: { "x-edit-password": "acab" },
      });
      if (res.ok) router.refresh();
    } catch {}
    setApproving(false);
  }

  async function handleFindCandidates() {
    setCombining(true);
    try {
      const res = await fetch(`/api/incidents/${incident.id}/combine`, {
        headers: { "x-edit-password": "acab" },
      });
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.candidates ?? []);
        setShowCandidates(true);
      }
    } catch {}
    setCombining(false);
  }

  async function handleCombineInto(existingId: number) {
    setCombiningInto(existingId);
    try {
      const res = await fetch(`/api/incidents/${incident.id}/combine`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-edit-password": "acab" },
        body: JSON.stringify({ existingId }),
      });
      if (res.ok) router.refresh();
    } catch {}
    setCombiningInto(null);
  }

  // Edit form state — initialized from incident
  const altSourcesList = parseAltSources(incident.altSources);
  const [form, setForm] = useState({
    headline: incident.headline ?? "",
    date: incident.date ?? "",
    location: incident.location ?? "",
    summary: incident.summary ?? "",
    incidentType: incident.incidentType ?? "",
    country: incident.country ?? "",
    url: incident.url ?? "",
    altSources: altSourcesList.join("\n"),
  });

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

  const allSources = [...new Set([incident.url, ...parseAltSources(incident.altSources)])];

  function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    // Lazily translate summary when expanding in Spanish mode
    if (next && translateSummary && incident.summary && !translatedSummary && !translatingSum) {
      const cacheKey = `summary:es:${incident.id}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) { setTranslatedSummary(cached); return; }
      setTranslatingSum(true);
      fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: incident.summary }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.text) {
            setTranslatedSummary(d.text);
            try { sessionStorage.setItem(cacheKey, d.text); } catch {}
          }
        })
        .catch(() => {})
        .finally(() => setTranslatingSum(false));
    }
  }

  // Best source to show prominently = first non-social URL
  const primarySource = allSources.find((s) => !isSocial(s)) ?? allSources[0];
  const hasMeta = incident.date || incident.location || incident.country;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // Serialize altSources from textarea (one URL per line)
      const altSourceUrls = form.altSources
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean)
        .filter((u) => u !== form.url.trim());

      const res = await fetch(`/api/incidents/${incident.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-edit-password": "acab",
        },
        body: JSON.stringify({
          headline: form.headline,
          date: form.date,
          location: form.location,
          summary: form.summary,
          incidentType: form.incidentType,
          country: form.country,
          url: form.url,
          altSources: serializeAltSources(altSourceUrls),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Save failed");
      } else {
        setEditing(false);
        router.refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/incidents/${incident.id}`, {
        method: "DELETE",
        headers: { "x-edit-password": "acab" },
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Delete failed");
        setDeleting(false);
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error");
      setDeleting(false);
    }
  }

  function startEditing() {
    // Re-initialize form from current incident data
    setForm({
      headline: incident.headline ?? "",
      date: incident.date ?? "",
      location: incident.location ?? "",
      summary: incident.summary ?? "",
      incidentType: incident.incidentType ?? "",
      country: incident.country ?? "",
      url: incident.url ?? "",
      altSources: parseAltSources(incident.altSources).join("\n"),
    });
    setConfirmDelete(false);
    setError(null);
    setEditing(true);
    setExpanded(false);
  }

  // ---- EDIT FORM VIEW ----
  if (editing) {
    return (
      <article className="border-b border-warm-200 py-4 px-3 -mx-3 bg-amber-50/60">
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-amber-700">
              Editing #{incident.id}
            </span>
            <button
              onClick={() => { setEditing(false); setError(null); setConfirmDelete(false); }}
              className="text-xs text-warm-400 hover:text-warm-700 transition-colors"
            >
              ✕ Cancel
            </button>
          </div>

          {/* Headline */}
          <div>
            <label className="block text-[11px] font-semibold text-warm-500 mb-0.5 uppercase tracking-wide">Headline</label>
            <input
              type="text"
              value={form.headline}
              onChange={(e) => setForm({ ...form, headline: e.target.value })}
              className="w-full px-3 py-1.5 rounded border border-warm-300 text-sm bg-white focus:outline-none focus:border-warm-500"
              placeholder="Headline"
            />
          </div>

          {/* Date + Location row */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-warm-500 mb-0.5 uppercase tracking-wide">Date</label>
              <input
                type="text"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-1.5 rounded border border-warm-300 text-sm bg-white focus:outline-none focus:border-warm-500"
                placeholder="YYYY-MM-DD"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-warm-500 mb-0.5 uppercase tracking-wide">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-3 py-1.5 rounded border border-warm-300 text-sm bg-white focus:outline-none focus:border-warm-500"
                placeholder="City, State"
              />
            </div>
          </div>

          {/* Country + Incident Type row */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-warm-500 mb-0.5 uppercase tracking-wide">Country</label>
              <input
                type="text"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="w-full px-3 py-1.5 rounded border border-warm-300 text-sm bg-white focus:outline-none focus:border-warm-500"
                placeholder="Country of origin"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-warm-500 mb-0.5 uppercase tracking-wide">Tags (comma-separated)</label>
              <input
                type="text"
                value={form.incidentType}
                onChange={(e) => setForm({ ...form, incidentType: e.target.value })}
                className="w-full px-3 py-1.5 rounded border border-warm-300 text-sm bg-white focus:outline-none focus:border-warm-500"
                placeholder="Detained, LPR"
              />
            </div>
          </div>

          {/* Summary */}
          <div>
            <label className="block text-[11px] font-semibold text-warm-500 mb-0.5 uppercase tracking-wide">Summary</label>
            <textarea
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              rows={4}
              className="w-full px-3 py-1.5 rounded border border-warm-300 text-sm bg-white focus:outline-none focus:border-warm-500 resize-y"
              placeholder="Summary of incident..."
            />
          </div>

          {/* Primary URL */}
          <div>
            <label className="block text-[11px] font-semibold text-warm-500 mb-0.5 uppercase tracking-wide">Primary URL</label>
            <input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="w-full px-3 py-1.5 rounded border border-warm-300 text-sm bg-white focus:outline-none focus:border-warm-500"
              placeholder="https://..."
            />
          </div>

          {/* Alt Sources */}
          <div>
            <label className="block text-[11px] font-semibold text-warm-500 mb-0.5 uppercase tracking-wide">Alt Sources (one URL per line)</label>
            <textarea
              value={form.altSources}
              onChange={(e) => setForm({ ...form, altSources: e.target.value })}
              rows={2}
              className="w-full px-3 py-1.5 rounded border border-warm-300 text-sm bg-white focus:outline-none focus:border-warm-500 resize-y"
              placeholder="https://..."
            />
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 bg-warm-800 text-white text-sm rounded-lg hover:bg-warm-900 transition-colors font-medium disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => { setEditing(false); setError(null); setConfirmDelete(false); }}
              className="px-4 py-1.5 border border-warm-300 text-warm-600 text-sm rounded-lg hover:bg-warm-50 transition-colors"
            >
              Cancel
            </button>
            <div className="flex-1" />
            {/* Delete */}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-3 py-1.5 border border-red-200 text-red-500 text-sm rounded-lg hover:bg-red-50 hover:border-red-400 transition-colors"
              >
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-red-600 font-medium">Sure?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors disabled:opacity-60"
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1.5 text-warm-400 text-sm hover:text-warm-700 transition-colors"
                >
                  No
                </button>
              </div>
            )}
          </div>
        </div>
      </article>
    );
  }

  // ---- NORMAL VIEW ----
  return (
    <article
      className={`group border-b border-warm-200 py-5 cursor-pointer transition-colors hover:bg-warm-50/70 px-3 -mx-3 ${isPending ? "border-l-4 border-l-amber-400 bg-amber-50/30" : ""}`}
      onClick={() => handleExpand()}
    >
      <div className="flex items-start gap-3">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Headline */}
          <h3 className="font-serif text-[1.05rem] font-semibold leading-snug text-warm-900 group-hover:text-warm-700 transition-colors">
            {translatedHeadline ?? incident.headline ?? "Untitled incident"}
          </h3>

          {/* Source, metadata, summary row with optional thumbnail */}
          <div className="mt-0.5 flex gap-3">
            {incident.imageUrl && (
              <div className="rounded-md overflow-hidden bg-warm-100 w-[4.5rem] self-stretch shrink-0 mt-0.5">
                <img
                  src={incident.imageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {/* Source name with +N badge */}
              <div className="flex items-center gap-1.5">
                <a
                  href={primarySource}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-block text-[0.72rem] font-medium text-orange-500 hover:text-orange-700 hover:underline transition-colors"
                >
                  {getSourceName(primarySource)}
                </a>
                {allSources.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setSourcesExpanded(!sourcesExpanded); }}
                    className="px-1.5 py-0 text-[0.65rem] font-semibold rounded-full bg-orange-100 text-orange-600 hover:bg-orange-200 transition-colors leading-[1.4]"
                  >
                    +{allSources.length - 1}
                  </button>
                )}
              </div>
              {sourcesExpanded && allSources.length > 1 && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                  {allSources.filter((s) => s !== primarySource).map((src) => (
                    <a
                      key={src}
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[0.72rem] font-medium text-orange-500 hover:text-orange-700 hover:underline transition-colors"
                    >
                      {getSourceName(src)}
                    </a>
                  ))}
                </div>
              )}

              {/* Date · Location · Country */}
              {hasMeta && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8rem] text-warm-400">
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

              {/* Summary preview (collapsed) */}
              {!expanded && incident.summary && (
                <p className="text-sm text-warm-500 mt-1 line-clamp-2 leading-relaxed">
                  {incident.summary}
                </p>
              )}
            </div>
          </div>

          {/* Expanded content */}
          {expanded && (
            <div className="mt-3 space-y-3">
              {incident.summary && (
                <p className="text-sm text-warm-700 leading-relaxed">
                  {translatingSum ? (
                    <span className="italic text-warm-400">Traduciendo…</span>
                  ) : (
                    translatedSummary ?? incident.summary
                  )}
                </p>
              )}
              {/* Timeline */}
              {(() => {
                let events: TimelineEvent[] = [];
                if (incident.timeline) {
                  try {
                    const parsed = JSON.parse(incident.timeline);
                    if (Array.isArray(parsed)) {
                      events = parsed.filter(
                        (e: any) => e && typeof e.date === "string" && typeof e.event === "string"
                      );
                    }
                  } catch {}
                }
                if (events.length === 0) return null;

                // Sort reverse chronological (most recent first)
                events.sort((a, b) => {
                  const parseD = (d: string) => {
                    const parts = d.split("/");
                    if (parts.length === 3) return new Date(`${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`);
                    return new Date(d);
                  };
                  return parseD(b.date).getTime() - parseD(a.date).getTime();
                });

                // Collect sources attributed to timeline events
                const attributedSources = new Set<string>();
                events.forEach((evt) => {
                  if (evt.sources) evt.sources.forEach((s) => attributedSources.add(s));
                  if (evt.source) attributedSources.add(evt.source);
                });
                // Sources not attributed to any event
                const unattributed = allSources.filter((s) => !attributedSources.has(s));

                return (
                  <div className="border-l-2 border-warm-200 pl-4 space-y-3 ml-1">
                    {events.map((evt, i) => {
                      const displayDate = formatDate(evt.date) ?? evt.date;
                      const evtSources = evt.sources ?? (evt.source ? [evt.source] : []);
                      return (
                        <div key={i} className="relative">
                          <div className="absolute -left-[1.35rem] top-1.5 w-2 h-2 rounded-full bg-warm-400" />
                          <div>
                            <div className="text-sm">
                              <span className="font-semibold text-warm-600">
                                {displayDate}
                              </span>
                              <span className="text-warm-300 mx-1.5">—</span>
                              <span className="text-warm-700">{evt.event}</span>
                            </div>
                            {evtSources.length > 0 && (
                              <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 mt-0.5">
                                {evtSources.map((src) => (
                                  <a
                                    key={src}
                                    href={src}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-[0.65rem] text-orange-500/80 hover:text-orange-700 hover:underline font-medium"
                                  >
                                    {getSourceName(src)}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {/* Unattributed sources */}
                    {unattributed.length > 0 && (
                      <div className="pt-0.5">
                        <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                          <span className="text-[0.65rem] text-warm-400 font-medium">Also covered by:</span>
                          {unattributed.map((src) => (
                            <a
                              key={src}
                              href={src}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[0.65rem] text-orange-500/80 hover:text-orange-700 hover:underline font-medium"
                            >
                              {getSourceName(src)}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              {rawTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {incidentTypeTags.map((tag) => (
                    <span
                      key={`it:${tag}`}
                      className="px-2 py-0.5 text-[0.7rem] font-medium rounded-full bg-blue-50 text-blue-600 border border-blue-200"
                    >
                      {t.tags.incidentTypes[tag] ?? getTagLabel(tag)}
                    </span>
                  ))}
                  {personImpactedTags.map((tag) => (
                    <span
                      key={`pi:${tag}`}
                      className="px-2 py-0.5 text-[0.7rem] font-medium rounded-full bg-purple-50 text-purple-600 border border-purple-200"
                    >
                      {t.tags.personImpacted[tag] ?? getTagLabel(tag)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right side: expand chevron + edit tools */}
        <div className="flex items-center gap-1.5 pt-1 shrink-0">
          {editMode && (
            <button
              onClick={(e) => { e.stopPropagation(); startEditing(); }}
              title="Edit incident"
              className="p-1.5 rounded-md text-warm-300 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
              </svg>
            </button>
          )}
          <div className="text-warm-300 group-hover:text-warm-400 transition-colors">
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
      </div>
      {/* Edit mode actions */}
      {editMode && (
        <div className="mt-2 flex items-center gap-2 ml-0">
          {isPending && (
            <button
              onClick={(e) => { e.stopPropagation(); handleApprove(); }}
              disabled={approving}
              className="px-3 py-1 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-60"
            >
              {approving ? "Approving…" : "✓ Approve"}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleFindCandidates(); }}
            disabled={combining}
            className="px-3 py-1 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {combining ? "Searching…" : "⊕ Add to existing"}
          </button>
          {isPending && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                className="px-3 py-1 text-xs font-medium rounded-md border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-400 transition-colors"
              >
                ✕ Delete
              </button>
              {confirmDelete && (
                <div className="flex items-center gap-1.5 ml-1">
                  <span className="text-xs text-red-600 font-medium">Sure?</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                    disabled={deleting}
                    className="px-2 py-1 bg-red-500 text-white text-xs rounded-md hover:bg-red-600 disabled:opacity-60"
                  >
                    {deleting ? "…" : "Yes"}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                    className="px-2 py-1 text-warm-400 text-xs hover:text-warm-700"
                  >
                    No
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Combine candidates panel */}
      {showCandidates && (
        <div className="mt-2 border border-blue-200 rounded-lg bg-blue-50/50 p-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-blue-800">
              {candidates.length > 0 ? `${candidates.length} matching incident${candidates.length === 1 ? "" : "s"} found` : "No matching incidents found"}
            </span>
            <button
              onClick={() => setShowCandidates(false)}
              className="text-xs text-blue-400 hover:text-blue-700"
            >
              ✕ Close
            </button>
          </div>
          {candidates.map((c) => (
            <div key={c.id} className="flex items-center gap-2 py-1.5 border-t border-blue-100">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-warm-800 truncate">{c.headline}</p>
                <p className="text-xs text-warm-400">
                  {c.date ?? "No date"} · {c.location ?? "No location"}
                  {c.approved ? "" : " · (pending)"}
                  <span className="text-blue-500 ml-1">score: {c.score}</span>
                </p>
              </div>
              <button
                onClick={() => handleCombineInto(c.id)}
                disabled={combiningInto === c.id}
                className="px-2.5 py-1 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-60 shrink-0"
              >
                {combiningInto === c.id ? "Merging…" : "Merge into this"}
              </button>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
