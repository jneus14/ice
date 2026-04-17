"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IncidentCard } from "./incident-card";
import { useLanguage } from "@/lib/i18n";
import { clusterIncidents, type ClusterableIncident } from "@/lib/cluster";

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
  duplicateOfId?: number | null;
  lastCombinedAt?: Date | string | null;
};

type TranslationMap = Record<number, { headline: string | null }>;

function cacheKey(ids: number[]) {
  return `translations:es:${ids.sort((a, b) => a - b).join(",")}`;
}

function useTranslations(incidents: Incident[], lang: string): { map: TranslationMap; loading: boolean } {
  const [map, setMap] = useState<TranslationMap>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (lang !== "es" || incidents.length === 0) {
      setMap({});
      return;
    }

    const ids = incidents.map((i) => i.id);
    const key = cacheKey(ids);

    try {
      const cached = sessionStorage.getItem(key);
      if (cached) {
        setMap(JSON.parse(cached));
        return;
      }
    } catch {}

    setLoading(true);
    const toTranslate = incidents.map((i) => ({ id: i.id, headline: i.headline }));

    const CHUNK = 15;
    const chunks: typeof toTranslate[] = [];
    for (let i = 0; i < toTranslate.length; i += CHUNK) {
      chunks.push(toTranslate.slice(i, i + CHUNK));
    }

    Promise.all(
      chunks.map((chunk) =>
        fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ incidents: chunk }),
        }).then((r) => r.json())
      )
    )
      .then((results) => {
        const result: TranslationMap = {};
        for (const data of results) {
          if (!data.translations) continue;
          for (const t of data.translations) {
            result[t.id] = { headline: t.headline };
          }
        }
        setMap(result);
        try {
          sessionStorage.setItem(key, JSON.stringify(result));
        } catch {}
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [lang, incidents.map((i) => i.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return { map, loading };
}

function BulkToolbar({
  items,
  selected,
  setSelected,
  label,
}: {
  items: Incident[];
  selected: Set<number>;
  setSelected: (s: Set<number>) => void;
  label: string;
}) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const allSelected = items.length > 0 && selected.size === items.length;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  }

  async function bulkApprove() {
    if (selected.size === 0) return;
    setActing(true);
    try {
      const promises = Array.from(selected).map((id) =>
        fetch(`/api/incidents/${id}/approve`, {
          method: "POST",
          headers: { "x-edit-password": "acab" },
        })
      );
      await Promise.all(promises);
      setSelected(new Set());
      router.refresh();
    } catch {}
    setActing(false);
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} incident(s)? This cannot be undone.`)) return;
    setActing(true);
    try {
      const promises = Array.from(selected).map((id) =>
        fetch(`/api/incidents/${id}`, {
          method: "DELETE",
          headers: { "x-edit-password": "acab" },
        })
      );
      await Promise.all(promises);
      setSelected(new Set());
      router.refresh();
    } catch {}
    setActing(false);
  }

  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-3 mb-2 px-1">
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="w-4.5 h-4.5 rounded border-warm-400 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />
        <span className="text-xs text-warm-500 font-medium">
          {allSelected ? "Deselect all" : `Select all ${label}`}
        </span>
      </label>
      {selected.size > 0 && (
        <>
          <span className="text-xs text-warm-400">
            {selected.size} selected
          </span>
          <button
            onClick={bulkApprove}
            disabled={acting}
            className="px-2.5 py-1 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-60"
          >
            {acting ? "…" : `✓ Approve ${selected.size}`}
          </button>
          <button
            onClick={bulkDelete}
            disabled={acting}
            className="px-2.5 py-1 text-xs font-medium rounded-md border border-red-300 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-60"
          >
            {acting ? "…" : `✕ Delete ${selected.size}`}
          </button>
        </>
      )}
    </div>
  );
}

function PendingSection({
  pendingIncidents,
  pendingSelected,
  setPendingSelected,
  editMode,
}: {
  pendingIncidents: Incident[];
  pendingSelected: Set<number>;
  setPendingSelected: (s: Set<number>) => void;
  editMode: boolean;
}) {
  const router = useRouter();
  const [mergingCluster, setMergingCluster] = useState<number | null>(null);

  // Cluster pending incidents by similarity
  const clusters = useMemo(() => {
    const result = clusterIncidents(
      pendingIncidents.map((i) => ({
        id: i.id,
        headline: i.headline,
        date: i.date,
        location: i.location,
        summary: i.summary,
      }))
    );
    return result;
  }, [pendingIncidents]);

  // Build a map: incidentId → cluster index
  const idToCluster = useMemo(() => {
    const map = new Map<number, number>();
    clusters.forEach((c, idx) => {
      for (const id of c.ids) map.set(id, idx);
    });
    return map;
  }, [clusters]);

  // Separate: clustered vs unclustered
  const clusteredIds = new Set(clusters.flatMap((c) => c.ids));
  const unclustered = pendingIncidents.filter((i) => !clusteredIds.has(i.id));

  async function handleMergeCluster(clusterIdx: number, approve: boolean) {
    const cluster = clusters[clusterIdx];
    if (!cluster) return;
    setMergingCluster(clusterIdx);
    try {
      const res = await fetch("/api/incidents/cluster-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-edit-password": "acab" },
        body: JSON.stringify({ ids: cluster.ids, approve }),
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {}
    setMergingCluster(null);
  }

  async function handleApproveSeparately(clusterIdx: number) {
    const cluster = clusters[clusterIdx];
    if (!cluster) return;
    setMergingCluster(clusterIdx);
    try {
      // Approve each incident individually without merging
      for (const id of cluster.ids) {
        await fetch(`/api/incidents/${id}/approve`, {
          method: "POST",
          headers: { "x-edit-password": "acab" },
        });
      }
      router.refresh();
    } catch {}
    setMergingCluster(null);
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-300">
          ⏳ {pendingIncidents.length} pending review
        </span>
        <span className="text-xs text-warm-400">
          These stories are not yet visible to the public.
        </span>
      </div>

      {/* Clustered stories — groups of stories about the same incident */}
      {clusters.map((cluster, idx) => {
        const clusterIncidents_ = cluster.ids
          .map((id) => pendingIncidents.find((i) => i.id === id))
          .filter(Boolean) as Incident[];
        const isMerging = mergingCluster === idx;

        return (
          <div key={`cluster-${idx}`} className="mb-4 border-2 border-blue-300 rounded-lg overflow-hidden bg-blue-50/30">
            <div className="px-3 py-2 bg-blue-100/50 border-b border-blue-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-blue-800">
                  🔗 {clusterIncidents_.length} stories about the same incident
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleMergeCluster(idx, true)}
                  disabled={isMerging}
                  className="px-3 py-1 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-60"
                >
                  {isMerging ? "Merging…" : "✓ Merge & Approve"}
                </button>
                <button
                  onClick={() => handleMergeCluster(idx, false)}
                  disabled={isMerging}
                  className="px-3 py-1 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                  {isMerging ? "Merging…" : "Merge (keep pending)"}
                </button>
                <button
                  onClick={() => handleApproveSeparately(idx)}
                  disabled={isMerging}
                  className="px-3 py-1 text-xs font-medium rounded-md border border-warm-300 text-warm-600 hover:bg-warm-50 transition-colors disabled:opacity-60"
                >
                  {isMerging ? "…" : "Approve separately"}
                </button>
              </div>
            </div>
            {clusterIncidents_.map((incident) => (
              <div key={incident.id} className="flex items-start">
                <div className="pt-12 pl-3 pr-2 shrink-0">
                  <input
                    type="checkbox"
                    checked={pendingSelected.has(incident.id)}
                    onChange={(e) => {
                      const next = new Set(pendingSelected);
                      if (e.target.checked) next.add(incident.id);
                      else next.delete(incident.id);
                      setPendingSelected(next);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-5 h-5 rounded border-warm-400 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <IncidentCard incident={incident} editMode={editMode} />
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {/* Unclustered stories — unique incidents */}
      {unclustered.length > 0 && (
        <div className="border border-amber-200 rounded-lg overflow-hidden bg-amber-50/20">
          <div className="px-3 pt-2">
            <BulkToolbar
              items={unclustered}
              selected={pendingSelected}
              setSelected={setPendingSelected}
              label="pending"
            />
          </div>
          {unclustered.map((incident) => (
            <div key={incident.id} className="flex items-start">
              <div className="pt-12 pl-3 pr-0 shrink-0">
                <input
                  type="checkbox"
                  checked={pendingSelected.has(incident.id)}
                  onChange={(e) => {
                    const next = new Set(pendingSelected);
                    if (e.target.checked) next.add(incident.id);
                    else next.delete(incident.id);
                    setPendingSelected(next);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-5 h-5 rounded border-warm-400 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                />
              </div>
              <div className="flex-1 min-w-0">
                <IncidentCard incident={incident} editMode={editMode} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function isPosterEligible(inc: Incident): boolean {
  const tags = (inc.incidentType ?? "").split(",").map(t => t.trim());
  const posterTags = new Set(["Disappearance/Detention", "Deported", "3rd Country Deportation"]);
  const hasPosterTag = tags.some(t => posterTags.has(t));
  if (!hasPosterTag || tags.includes("Policy") || tags.includes("Analysis") || tags.includes("no-poster")) return false;
  // Check for named individual in headline or first 2 sentences of summary
  const text = (inc.headline || "") + " " + (inc.summary || "").split(".").slice(0, 2).join(".");
  const namePattern = /\b[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:-[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+)?(?:\s+(?:['"][A-Za-z]+['"]\s+)?(?:de\s+la\s+|de\s+|del\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:-[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+)?){1,3}\b/g;
  const excludeWords = /^(Federal|Supreme|Trump|Biden|President|Judge|Officer|Agent|Senator|Governor|Mayor|Immigration|Customs|Border|Patrol|Department|Homeland|Security|National|Guard|Police|Sheriff|United|States|San\s|Los\s|New\s|North\s|South\s|El\s|La\s|Las\s|Human\s|Rights|According|American)/;
  const matches = text.match(namePattern) || [];
  return matches.some(m => !excludeWords.test(m));
}

export function IncidentList({
  incidents,
  total,
  totalAll,
  page,
  totalPages,
  editMode = false,
  pendingIncidents = [],
  posterMode = false,
}: {
  incidents: Incident[];
  total: number;
  totalAll: number;
  page: number;
  totalPages: number;
  editMode?: boolean;
  pendingIncidents?: Incident[];
  posterMode?: boolean;
}) {
  const { t, lang } = useLanguage();
  const searchParams = useSearchParams();
  const { map: translations, loading: translating } = useTranslations(incidents, lang);
  const [pendingSelected, setPendingSelected] = useState<Set<number>>(new Set());

  // Filter for poster mode
  const displayIncidents = posterMode
    ? incidents.filter(isPosterEligible)
    : incidents;

  // Handle ?highlight=ID — scroll to and expand the incident
  useEffect(() => {
    const highlightId = searchParams.get("highlight");
    if (!highlightId) return;
    const el = document.getElementById(`incident-${highlightId}`);
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-orange-400", "bg-orange-50/50", "rounded-lg");
        // Click to expand
        el.click();
        // Remove highlight after a few seconds
        setTimeout(() => {
          el.classList.remove("ring-2", "ring-orange-400", "bg-orange-50/50", "rounded-lg");
        }, 4000);
      }, 300);
    }
  }, [searchParams]);

  return (
    <div>
      {/* Count bar */}
      <div className="flex justify-end items-center mb-4 gap-3">
        {translating && (
          <span className="text-xs text-warm-400 italic">Traduciendo…</span>
        )}
        <p className="text-xs text-warm-500">
          <span className="font-semibold text-warm-700">{total}</span> {t.of}{" "}
          <span className="font-semibold text-warm-700">{totalAll}</span>{" "}
          {t.incidents}
        </p>
      </div>

      {/* Pending incidents - only shown in edit mode */}
      {editMode && pendingIncidents.length > 0 && (
        <PendingSection
          pendingIncidents={pendingIncidents}
          pendingSelected={pendingSelected}
          setPendingSelected={setPendingSelected}
          editMode={editMode}
        />
      )}

      <MonthNavigator compact />

      {incidents.length === 0 ? (
        <div className="py-12 text-center text-warm-400">
          {t.noIncidents}
        </div>
      ) : (
        <>
          <div>
            {displayIncidents.map((incident) => (
              <IncidentCard
                key={incident.id}
                incident={incident}
                editMode={editMode}
                translatedHeadline={translations[incident.id]?.headline ?? null}
                translateSummary={lang === "es"}
              />
            ))}
            {posterMode && displayIncidents.length === 0 && (
              <p className="text-center text-warm-400 py-8 text-sm">
                No poster-eligible stories found in this view. Try navigating to a different month.
              </p>
            )}
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} total={total} />
          )}
          <MonthNavigator />
        </>
      )}
    </div>
  );
}

function Pagination({ page, totalPages, total }: { page: number; totalPages: number; total: number }) {
  const searchParams = useSearchParams();

  function pageUrl(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(p));
    }
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  }

  return (
    <div className="flex items-center justify-center gap-4 py-6">
      {page > 1 && (
        <a
          href={pageUrl(page - 1)}
          className="px-4 py-2 rounded-lg border border-warm-300 text-sm text-warm-600 hover:bg-warm-100 transition-colors"
        >
          ← Previous
        </a>
      )}
      <span className="text-sm text-warm-500">
        Page {page} of {totalPages} ({total} results)
      </span>
      {page < totalPages && (
        <a
          href={pageUrl(page + 1)}
          className="px-4 py-2 rounded-lg border border-warm-300 text-sm font-medium text-warm-700 hover:bg-warm-100 transition-colors"
        >
          More →
        </a>
      )}
    </div>
  );
}

function MonthNavigator({ compact = false }: { compact?: boolean }) {
  const searchParams = useSearchParams();
  const now = new Date();
  const hasSearchFilters = searchParams.get("q") || searchParams.get("tag") || searchParams.get("location") || searchParams.get("country") || searchParams.get("range") || searchParams.get("sourceType");
  const currentFrom = searchParams.get("from") || "";
  const currentTo = searchParams.get("to") || "";

  // Don't show month navigation when search/filter results span all dates
  if (hasSearchFilters && !currentFrom && !currentTo) {
    return null;
  }

  // Generate months from Jan 2025 to current month
  const months: Array<{ label: string; from: string; to: string }> = [];
  const startYear = 2025;
  const startMonth = 0; // January

  for (let y = startYear; ; y++) {
    const endM = y === now.getFullYear() ? now.getMonth() : 11;
    for (let m = (y === startYear ? startMonth : 0); m <= endM; m++) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const label = `${monthNames[m]} ${y}`;
      const fromDate = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const toDate = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      months.push({ label, from: fromDate, to: toDate });
    }
    if (y === now.getFullYear()) break;
  }

  // Reverse so newest is first
  months.reverse();

  // Find current active month index
  const activeIdx = months.findIndex((m) => currentFrom === m.from && currentTo === m.to);

  function monthUrl(from: string, to: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    params.delete("range");
    params.set("from", from);
    params.set("to", to);
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  }

  // Prev = newer month (lower index), Next = older month (higher index)
  const prevMonth = activeIdx > 0 ? months[activeIdx - 1] : null;
  const nextMonth = activeIdx >= 0 && activeIdx < months.length - 1 ? months[activeIdx + 1] : null;

  return (
    <div className={compact ? "mb-4" : "mt-8"}>
      {/* Prev/Next arrows */}
      <div className="flex items-center justify-center gap-3 mb-3">
        {prevMonth ? (
          <a
            href={monthUrl(prevMonth.from, prevMonth.to)}
            className="px-3 py-1.5 rounded-md border border-warm-300 text-sm text-warm-600 hover:bg-warm-100 transition-colors"
          >
            ← {prevMonth.label}
          </a>
        ) : (
          <span className="px-3 py-1.5 text-sm text-warm-300">← Newer</span>
        )}
        <span className="text-sm font-semibold text-warm-700">
          {activeIdx >= 0 ? months[activeIdx].label : ""}
        </span>
        {nextMonth ? (
          <a
            href={monthUrl(nextMonth.from, nextMonth.to)}
            className="px-3 py-1.5 rounded-md border border-warm-300 text-sm text-warm-600 hover:bg-warm-100 transition-colors"
          >
            {nextMonth.label} →
          </a>
        ) : (
          <span className="px-3 py-1.5 text-sm text-warm-300">Older →</span>
        )}
      </div>
      {/* All months — only in full (non-compact) mode */}
      {!compact && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {months.map((m) => {
            const isActive = currentFrom === m.from && currentTo === m.to;
            return (
              <a
                key={m.from}
                href={monthUrl(m.from, m.to)}
                className={`px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-warm-800 text-white font-medium"
                    : "border border-warm-300 text-warm-600 hover:bg-warm-100"
                }`}
              >
                {m.label}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
