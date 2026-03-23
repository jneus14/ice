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
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [approving, setApproving] = useState(false);
  const [combining, setCombining] = useState(false);
  const [candidates, setCandidates] = useState<CombineCandidate[]>([]);
  const [showCandidates, setShowCandidates] = useState(false);
  const [combiningInto, setCombiningInto] = useState<number | null>(null);
  const [searchingSources, setSearchingSources] = useState(false);
  const [keywordSearch, setKeywordSearch] = useState("");
  const [keywordSearching, setKeywordSearching] = useState(false);
  const [inlineEditing, setInlineEditing] = useState<"headline" | "summary" | null>(null);
  const [inlineValue, setInlineValue] = useState("");
  const [inlineSaving, setInlineSaving] = useState(false);
  const [relatedStories, setRelatedStories] = useState<Array<{ id: number; headline: string; date: string | null; location: string | null }> | null>(null);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [relatedExpanded, setRelatedExpanded] = useState(false);

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

  function startInlineEdit(field: "headline" | "summary") {
    setInlineValue(field === "headline" ? (incident.headline ?? "") : (incident.summary ?? ""));
    setInlineEditing(field);
  }

  async function saveInlineEdit() {
    if (!inlineEditing || inlineSaving) return;
    setInlineSaving(true);
    try {
      const body: Record<string, string> = {};
      body[inlineEditing] = inlineValue;
      const res = await fetch(`/api/incidents/${incident.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-edit-password": "acab" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setInlineEditing(null);
        router.refresh();
      }
    } catch {}
    setInlineSaving(false);
  }

  async function removeTag(tag: string) {
    const currentTags = (incident.incidentType ?? "").split(",").map(t => t.trim()).filter(Boolean);
    const newTags = currentTags.filter(t => t !== tag);
    try {
      await fetch(`/api/incidents/${incident.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-edit-password": "acab" },
        body: JSON.stringify({ incidentType: newTags.join(", ") }),
      });
      router.refresh();
    } catch {}
  }

  async function handleKeywordSearch() {
    if (!keywordSearch.trim()) return;
    setKeywordSearching(true);
    try {
      const res = await fetch(`/api/incidents/${incident.id}/combine?keyword=${encodeURIComponent(keywordSearch.trim())}`, {
        headers: { "x-edit-password": "acab" },
      });
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.candidates ?? []);
      }
    } catch {}
    setKeywordSearching(false);
  }

  async function handleSearchSources() {
    setSearchingSources(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/incidents/${incident.id}/search-sources`, {
        method: "POST",
        headers: { "x-edit-password": "acab" },
      });
      const data = await res.json();
      if (res.ok) {
        if (data.added > 0) {
          setSuccessMsg(`Found ${data.added} new source${data.added === 1 ? "" : "s"}`);
          router.refresh();
        } else {
          setError("No new sources found");
        }
      } else {
        setError(data.error ?? "Search failed");
      }
    } catch {
      setError("Network error");
    }
    setSearchingSources(false);
  }

  async function handleCombineInto(existingId: number) {
    setCombiningInto(existingId);
    try {
      const res = await fetch(`/api/incidents/${incident.id}/combine`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-edit-password": "acab" },
        body: JSON.stringify({ existingId }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        if (data.mismatch) {
          setError("Cannot merge: sources describe different incidents");
        } else {
          setError(data.error ?? "Merge failed");
        }
      }
    } catch {
      setError("Network error during merge");
    }
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
    // Lazily fetch related stories
    if (next && relatedStories === null && !loadingRelated) {
      setLoadingRelated(true);
      fetch(`/api/incidents/${incident.id}/related`)
        .then((r) => r.json())
        .then((d) => setRelatedStories(d.related ?? []))
        .catch(() => setRelatedStories([]))
        .finally(() => setLoadingRelated(false));
    }
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
      className={`group border-b border-warm-200 py-5 cursor-pointer transition-colors hover:bg-warm-50/70 px-3 -mx-3`}
      onClick={() => handleExpand()}
    >
      <div className="flex items-stretch gap-3">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Headline */}
          {editMode && inlineEditing === "headline" ? (
            <div className="flex gap-1.5 items-start" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={inlineValue}
                onChange={(e) => setInlineValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveInlineEdit(); if (e.key === "Escape") setInlineEditing(null); }}
                autoFocus
                className="flex-1 font-serif text-[1.05rem] font-semibold leading-snug text-warm-900 border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-500"
              />
              <button onClick={saveInlineEdit} disabled={inlineSaving} className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                {inlineSaving ? "…" : "Save"}
              </button>
              <button onClick={() => setInlineEditing(null)} className="px-2 py-1 text-xs text-warm-400 hover:text-warm-700">✕</button>
            </div>
          ) : (
            <h3
              className={`font-serif text-[1.05rem] font-semibold leading-snug text-warm-900 group-hover:text-warm-700 transition-colors ${editMode ? "cursor-text hover:bg-blue-50/50 rounded px-0.5 -mx-0.5" : ""}`}
              onDoubleClick={editMode ? (e) => { e.stopPropagation(); startInlineEdit("headline"); } : undefined}
            >
              {translatedHeadline ?? incident.headline ?? "Untitled incident"}
              <svg
                className={`w-3.5 h-3.5 inline-block ml-1.5 text-warm-300 group-hover:text-warm-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </h3>
          )}

          {/* Source, metadata, summary */}
          <div className="mt-0.5">
            <div>
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
                <p
                  className={`text-sm text-warm-500 mt-1 line-clamp-2 leading-relaxed ${editMode ? "cursor-text hover:bg-blue-50/50 rounded px-0.5 -mx-0.5" : ""}`}
                  onDoubleClick={editMode ? (e) => { e.stopPropagation(); setExpanded(true); startInlineEdit("summary"); } : undefined}
                >
                  {incident.summary}
                </p>
              )}
            </div>
          </div>

          {/* Expanded content */}
          {expanded && (
            <div className="mt-3 space-y-3">
              {incident.summary && (
                editMode && inlineEditing === "summary" ? (
                  <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      value={inlineValue}
                      onChange={(e) => setInlineValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Escape") setInlineEditing(null); }}
                      autoFocus
                      rows={4}
                      className="w-full text-sm text-warm-700 leading-relaxed border border-blue-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 resize-y"
                    />
                    <div className="flex gap-1.5">
                      <button onClick={saveInlineEdit} disabled={inlineSaving} className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                        {inlineSaving ? "…" : "Save"}
                      </button>
                      <button onClick={() => setInlineEditing(null)} className="px-2 py-1 text-xs text-warm-400 hover:text-warm-700">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p
                    className={`text-sm text-warm-700 leading-relaxed ${editMode ? "cursor-text hover:bg-blue-50/50 rounded px-0.5 -mx-0.5" : ""}`}
                    onDoubleClick={editMode ? (e) => { e.stopPropagation(); startInlineEdit("summary"); } : undefined}
                  >
                    {translatingSum ? (
                      <span className="italic text-warm-400">Traduciendo…</span>
                    ) : (
                      translatedSummary ?? incident.summary
                    )}
                  </p>
                )
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
                      className="px-2 py-0.5 text-[0.7rem] font-medium rounded-full bg-blue-50 text-blue-600 border border-blue-200 inline-flex items-center gap-1"
                    >
                      {t.tags.incidentTypes[tag] ?? getTagLabel(tag)}
                      {editMode && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                          className="text-blue-400 hover:text-red-500 ml-0.5 leading-none"
                        >✕</button>
                      )}
                    </span>
                  ))}
                  {personImpactedTags.map((tag) => (
                    <span
                      key={`pi:${tag}`}
                      className="px-2 py-0.5 text-[0.7rem] font-medium rounded-full bg-purple-50 text-purple-600 border border-purple-200 inline-flex items-center gap-1"
                    >
                      {t.tags.personImpacted[tag] ?? getTagLabel(tag)}
                      {editMode && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                          className="text-purple-400 hover:text-red-500 ml-0.5 leading-none"
                        >✕</button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {/* Related stories */}
              {relatedStories && relatedStories.length > 0 && (
                <div className="mt-3 pt-3 border-t border-warm-100">
                  <button
                    onClick={(e) => { e.stopPropagation(); setRelatedExpanded(!relatedExpanded); }}
                    className="flex items-center gap-2 w-full text-left group/related"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-warm-400">Related stories</p>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-warm-200 text-warm-500">
                      {relatedStories.length}
                    </span>
                    <svg
                      className={`w-3 h-3 text-warm-400 transition-transform duration-200 ${relatedExpanded ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {relatedExpanded && (
                    <div className="space-y-1 mt-2">
                      {relatedStories.map((rs) => (
                        <a
                          key={rs.id}
                          href={`/?q=${encodeURIComponent(rs.headline?.split(" ").slice(0, 4).join(" ") ?? "")}`}
                          onClick={(e) => e.stopPropagation()}
                          className="block text-sm text-warm-600 hover:text-warm-900 hover:underline transition-colors"
                        >
                          {rs.headline}
                          {rs.date && <span className="text-warm-400 text-xs ml-1.5">· {rs.date}</span>}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {loadingRelated && (
                <p className="text-xs text-warm-400 italic mt-2">Loading related stories…</p>
              )}
            </div>
          )}
        </div>

        {/* Thumbnail — right side, hidden when expanded */}
        {incident.imageUrl && !expanded && (
          <div className="rounded-md overflow-hidden bg-warm-100 w-[5rem] shrink-0 self-stretch">
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

        {/* Right side: edit tools only */}
        {editMode && (
          <div className="flex items-center pt-1 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); startEditing(); }}
              title="Edit incident"
              className="p-1.5 rounded-md text-warm-300 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {/* Edit mode actions */}
      {editMode && (error || successMsg) && (
        <p className={`mt-2 ml-0 text-xs ${error ? "text-red-500" : "text-green-600"}`}>{error || successMsg}</p>
      )}
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
          <button
            onClick={(e) => { e.stopPropagation(); handleSearchSources(); }}
            disabled={searchingSources}
            className="px-3 py-1 text-xs font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-60"
          >
            {searchingSources ? "Searching…" : "🔍 Find sources"}
          </button>
          {!confirmDelete ? (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              className="px-3 py-1 text-xs font-medium rounded-md border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-400 transition-colors"
            >
              ✕ Delete
            </button>
          ) : (
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
          {/* Keyword search */}
          <div className="flex gap-1.5 mb-2">
            <input
              type="text"
              value={keywordSearch}
              onChange={(e) => setKeywordSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleKeywordSearch(); }}
              placeholder="Search by keyword..."
              className="flex-1 px-2 py-1 text-xs rounded border border-blue-200 bg-white focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={handleKeywordSearch}
              disabled={keywordSearching || !keywordSearch.trim()}
              className="px-2 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {keywordSearching ? "…" : "Search"}
            </button>
          </div>
          {candidates.map((c) => (
            <div key={c.id} className="flex items-center gap-2 py-1.5 border-t border-blue-100">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-warm-800 truncate">{c.headline}</p>
                <p className="text-xs text-warm-400">
                  {c.date ?? "No date"} · {c.location ?? "No location"}
                  {c.approved ? "" : " · (pending)"}
                  <span className="text-blue-500 ml-1">score: {Math.round(c.score * 100)}%</span>
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
