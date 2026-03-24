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
                <div className="pt-6 pl-3 pr-2 shrink-0">
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
              <div className="pt-6 pl-3 pr-0 shrink-0">
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

export function IncidentList({
  incidents,
  total,
  totalAll,
  page,
  totalPages,
  editMode = false,
  pendingIncidents = [],
}: {
  incidents: Incident[];
  total: number;
  totalAll: number;
  page: number;
  totalPages: number;
  editMode?: boolean;
  pendingIncidents?: Incident[];
}) {
  const { t, lang } = useLanguage();
  const { map: translations, loading: translating } = useTranslations(incidents, lang);
  const [pendingSelected, setPendingSelected] = useState<Set<number>>(new Set());

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

      {incidents.length === 0 ? (
        <div className="py-12 text-center text-warm-400">
          {t.noIncidents}
        </div>
      ) : (
        <>
          <div>
            {incidents.map((incident) => (
              <IncidentCard
                key={incident.id}
                incident={incident}
                editMode={editMode}
                translatedHeadline={translations[incident.id]?.headline ?? null}
                translateSummary={lang === "es"}
              />
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
  const searchParams = useSearchParams();
  const { t } = useLanguage();

  function pageUrl(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (p === 1) {
      params.delete("page");
    } else {
      params.set("page", String(p));
    }
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  }

  return (
    <div className="flex items-center justify-center gap-2 mt-8">
      {page > 1 && (
        <a
          href={pageUrl(page - 1)}
          className="px-3 py-1.5 rounded-md border border-warm-300 text-sm hover:bg-warm-100 transition-colors"
        >
          {t.previous}
        </a>
      )}
      <span className="text-sm text-warm-500">
        {t.pageOf(page, totalPages)}
      </span>
      {page < totalPages && (
        <a
          href={pageUrl(page + 1)}
          className="px-3 py-1.5 rounded-md border border-warm-300 text-sm hover:bg-warm-100 transition-colors"
        >
          {t.next}
        </a>
      )}
    </div>
  );
}
