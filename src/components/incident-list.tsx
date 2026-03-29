"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IncidentCard } from "./incident-card";
import { useLanguage } from "@/lib/i18n";
import { extractPersonName, nameMatchScore } from "@/lib/name-utils";

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

type PendingGroupType = {
  incidents: Incident[];
  name: string | null; // matched person name, or null for ungrouped
};

/** Group pending incidents by person name extracted from headlines */
function groupPendingIncidents(incidents: Incident[]): PendingGroupType[] {
  if (incidents.length === 0) return [];

  // Extract names from headlines
  const names = incidents.map((inc) => extractPersonName(inc.headline ?? ""));

  // Union-Find
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  // Compare all pairs with names
  for (let i = 0; i < incidents.length; i++) {
    if (!names[i]) continue;
    for (let j = i + 1; j < incidents.length; j++) {
      if (!names[j]) continue;
      if (nameMatchScore(names[i]!, names[j]!) >= 0.8) {
        union(i, j);
      }
    }
  }

  // Build groups
  const groupMap = new Map<number, number[]>();
  for (let i = 0; i < incidents.length; i++) {
    if (!names[i]) continue;
    const root = find(i);
    if (!groupMap.has(root)) groupMap.set(root, []);
    groupMap.get(root)!.push(i);
  }

  const result: PendingGroupType[] = [];

  // Add groups with 2+ members
  const grouped = new Set<number>();
  for (const indices of groupMap.values()) {
    if (indices.length >= 2) {
      // Pick the longest name as canonical
      let bestName = names[indices[0]]!;
      for (const idx of indices) {
        if (names[idx] && names[idx]!.length > bestName.length) bestName = names[idx]!;
      }
      result.push({
        incidents: indices.map((i) => incidents[i]),
        name: bestName,
      });
      for (const idx of indices) grouped.add(idx);
    }
  }

  // Add ungrouped incidents individually
  for (let i = 0; i < incidents.length; i++) {
    if (!grouped.has(i)) {
      result.push({ incidents: [incidents[i]], name: null });
    }
  }

  return result;
}

function PendingGroupBanner({
  group,
  onDone,
}: {
  group: PendingGroupType;
  onDone: () => void;
}) {
  const router = useRouter();
  const [acting, setActing] = useState<string | null>(null);

  if (group.incidents.length < 2) return null;

  const ids = group.incidents.map((i) => i.id);

  async function mergeAndApprove() {
    setActing("merge-approve");
    try {
      const res = await fetch(`/api/incidents/${ids[0]}/combine`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-edit-password": "acab" },
        body: JSON.stringify({ existingId: ids[0] }),
      });
      // For more than 2 incidents, merge additional ones
      if (res.ok && ids.length > 2) {
        for (let i = 2; i < ids.length; i++) {
          await fetch(`/api/incidents/${ids[i]}/combine`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-edit-password": "acab" },
            body: JSON.stringify({ existingId: ids[0] }),
          });
        }
      }
      // Approve the surviving incident
      if (res.ok) {
        await fetch(`/api/incidents/${ids[0]}/approve`, {
          method: "POST",
          headers: { "x-edit-password": "acab" },
        });
      }
      router.refresh();
    } catch {}
    setActing(null);
  }

  async function mergeKeepPending() {
    setActing("merge-pending");
    try {
      // Merge second into first (and subsequent)
      for (let i = 1; i < ids.length; i++) {
        await fetch(`/api/incidents/${ids[i]}/combine`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-edit-password": "acab" },
          body: JSON.stringify({ existingId: ids[0] }),
        });
      }
      router.refresh();
    } catch {}
    setActing(null);
  }

  async function approveSeparately() {
    setActing("approve-sep");
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/incidents/${id}/approve`, {
            method: "POST",
            headers: { "x-edit-password": "acab" },
          })
        )
      );
      router.refresh();
    } catch {}
    setActing(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-blue-50 border-b border-blue-200">
      <span className="text-xs font-semibold text-blue-800">
        🔗 {group.incidents.length} stories about the same incident
      </span>
      <button
        onClick={mergeAndApprove}
        disabled={acting !== null}
        className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-60"
      >
        {acting === "merge-approve" ? "Merging…" : "✓ Merge & Approve"}
      </button>
      <button
        onClick={mergeKeepPending}
        disabled={acting !== null}
        className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-green-500 text-white hover:bg-green-600 transition-colors disabled:opacity-60"
      >
        {acting === "merge-pending" ? "Merging…" : "Merge (keep pending)"}
      </button>
      <button
        onClick={approveSeparately}
        disabled={acting !== null}
        className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-warm-200 text-warm-700 hover:bg-warm-300 transition-colors disabled:opacity-60"
      >
        {acting === "approve-sep" ? "Approving…" : "Approve separately"}
      </button>
    </div>
  );
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
          className="w-3.5 h-3.5 rounded border-warm-400 text-blue-600 focus:ring-blue-500 cursor-pointer"
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
  const router = useRouter();
  const { t, lang } = useLanguage();
  const { map: translations, loading: translating } = useTranslations(incidents, lang);
  const [pendingSelected, setPendingSelected] = useState<Set<number>>(new Set());
  const pendingGroups = useMemo(() => groupPendingIncidents(pendingIncidents), [pendingIncidents]);

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
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3 px-1">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-300">
              ⏳ {pendingIncidents.length} pending review
            </span>
            <span className="text-xs text-warm-400">
              These stories are not yet visible to the public.
            </span>
          </div>
          <div className="border border-amber-200 rounded-lg overflow-hidden bg-amber-50/20">
            <div className="px-3 pt-2">
              <BulkToolbar
                items={pendingIncidents}
                selected={pendingSelected}
                setSelected={setPendingSelected}
                label="pending"
              />
            </div>
            {pendingGroups.map((group, gi) => (
              <div key={group.incidents.map((i) => i.id).join("-")}>
                {/* Group banner for 2+ incidents about the same person */}
                <PendingGroupBanner group={group} onDone={() => router.refresh()} />
                {group.incidents.map((incident) => (
                  <div key={incident.id} className={`flex items-start ${group.incidents.length >= 2 ? "border-l-4 border-l-blue-300" : ""}`}>
                    {/* Checkbox */}
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
                        className="w-3.5 h-3.5 rounded border-warm-400 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <IncidentCard
                        incident={incident}
                        editMode={editMode}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
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
