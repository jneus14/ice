"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateIncidentData,
  deleteIncident,
  findDuplicateCandidates,
  mergeIncidents,
  bulkAddUrls,
  approveIncident,
  approveMultiple,
  findCombineCandidates,
  combineIntoExisting,
  dismissDuplicate,
} from "@/app/admin/incidents/actions";
import { processIncident, processAllIncomplete, processSelected } from "@/app/admin/incidents/process-action";
import { parseAltSources, serializeAltSources } from "@/lib/sources";

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
  status: string;
  approved: boolean;
  duplicateOfId: number | null;
  errorMessage: string | null;
  createdAt: Date;
};

type CombineCandidate = {
  id: number;
  headline: string;
  date: string | null;
  score: number;
};

// Merge url + altSources into one comma-separated string for editing
function toSourcesField(url: string, altSources: string | null): string {
  const alts = parseAltSources(altSources);
  return [url, ...alts].join(", ");
}

// Parse sources field back: first URL = primary, rest = altSources
function fromSourcesField(val: string): { url: string; altSources: string | null } {
  const parts = val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const url = parts[0] || "";
  const alts = parts.slice(1).filter(Boolean);
  return { url, altSources: serializeAltSources(alts) };
}

// Thin inline input used for each spreadsheet cell
function Cell({
  value,
  onChange,
  onBlur,
  placeholder = "",
  mono = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      className={`w-full px-1.5 py-1 border border-transparent hover:border-warm-300 focus:border-warm-600 focus:outline-none bg-transparent text-xs rounded ${mono ? "font-mono" : ""}`}
    />
  );
}

// One editable row — auto-saves on blur of any field
function EditableRow({
  incident,
  onDelete,
  onProcessDone,
  selected,
  onToggle,
  onApproved,
  duplicateMatch,
}: {
  incident: Incident;
  onDelete: (id: number) => void;
  onProcessDone: () => void;
  selected: boolean;
  onToggle: (id: number) => void;
  onApproved: () => void;
  duplicateMatch: { id: number; headline: string } | null;
}) {
  const [fields, setFields] = useState({
    sources: toSourcesField(incident.url, incident.altSources),
    headline: incident.headline || "",
    date: incident.date || "",
    location: incident.location || "",
    incidentType: incident.incidentType || "",
    country: incident.country || "",
    summary: incident.summary || "",
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [combining, setCombining] = useState(false);
  const [combineCandidates, setCombineCandidates] = useState<CombineCandidate[] | null>(null);
  const [combiningInto, setCombiningInto] = useState<number | null>(null);
  const [dismissingDupe, setDismissingDupe] = useState(false);

  const update = (field: keyof typeof fields, value: string) => {
    setFields((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const save = async () => {
    if (!dirty) return;
    const { url, altSources } = fromSourcesField(fields.sources);
    if (!url) return;
    setSaving(true);
    try {
      await updateIncidentData(incident.id, {
        url,
        altSources,
        headline: fields.headline || null,
        date: fields.date || null,
        location: fields.location || null,
        summary: fields.summary || null,
        incidentType: fields.incidentType || null,
        country: fields.country || null,
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const handleProcess = async () => {
    setProcessing(true);
    try {
      await processIncident(incident.id);
      onProcessDone();
    } catch (e: any) {
      alert("Scrape failed: " + e.message);
    } finally {
      setProcessing(false);
    }
  };

  const isPending = incident.status === "COMPLETE" && !incident.approved;
  const displayStatus = isPending ? "PENDING" : incident.status;

  const statusColors: Record<string, string> = {
    RAW: "bg-yellow-100 text-yellow-800",
    PROCESSING: "bg-blue-100 text-blue-800",
    COMPLETE: "bg-green-100 text-green-800",
    PENDING: "bg-amber-100 text-amber-800",
    FAILED: "bg-red-100 text-red-800",
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      await approveIncident(incident.id);
      onApproved();
    } catch (e: any) {
      alert("Approve failed: " + e.message);
    } finally {
      setApproving(false);
    }
  };

  const handleFindCombine = async () => {
    setCombining(true);
    setCombineCandidates(null);
    try {
      const result = await findCombineCandidates(incident.id);
      setCombineCandidates(result.candidates);
    } catch (e: any) {
      alert("Search failed: " + e.message);
    } finally {
      setCombining(false);
    }
  };

  const handleCombineInto = async (existingId: number) => {
    setCombiningInto(existingId);
    try {
      await combineIntoExisting(incident.id, existingId);
      setCombineCandidates(null);
      onApproved();
    } catch (e: any) {
      alert("Combine failed: " + e.message);
    } finally {
      setCombiningInto(null);
    }
  };

  const handleDismissDuplicate = async () => {
    setDismissingDupe(true);
    try {
      await dismissDuplicate(incident.id);
      onApproved(); // refresh
    } catch (e: any) {
      alert("Dismiss failed: " + e.message);
    } finally {
      setDismissingDupe(false);
    }
  };

  return (
    <>
    <tr
      className={`border-b border-warm-100 align-middle ${
        dirty ? "bg-amber-50" : isPending ? "bg-amber-50/40" : "hover:bg-warm-50"
      }`}
    >
      {/* Select */}
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(incident.id)}
          className="accent-indigo-600"
        />
      </td>

      {/* Status */}
      <td className="px-2 py-1.5 whitespace-nowrap">
        <span
          className={`px-1.5 py-0.5 text-xs font-medium rounded ${
            statusColors[displayStatus] || "bg-warm-100 text-warm-600"
          }`}
        >
          {displayStatus}
        </span>
        {saving && (
          <span className="block text-xs text-warm-400 mt-0.5">saving…</span>
        )}
        {incident.status === "FAILED" && incident.errorMessage && (
          <span
            className="block text-xs text-red-400 mt-0.5 max-w-[90px] truncate"
            title={incident.errorMessage}
          >
            {incident.errorMessage}
          </span>
        )}
      </td>

      {/* Sources: primary url + alt sources comma-separated */}
      <td className="py-1">
        <div className="flex items-center gap-1">
          <Cell
            value={fields.sources}
            onChange={(v) => update("sources", v)}
            onBlur={save}
            placeholder="https://..."
            mono
          />
          {fields.sources && (
            <a
              href={fields.sources.split(",")[0].trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-warm-400 hover:text-blue-600"
              title="Open source"
            >
              ↗
            </a>
          )}
        </div>
      </td>

      {/* Headline */}
      <td className="py-1">
        <Cell
          value={fields.headline}
          onChange={(v) => update("headline", v)}
          onBlur={save}
          placeholder="Headline"
        />
      </td>

      {/* Date */}
      <td className="py-1">
        <Cell
          value={fields.date}
          onChange={(v) => update("date", v)}
          onBlur={save}
          placeholder="Date"
        />
      </td>

      {/* Location */}
      <td className="py-1">
        <Cell
          value={fields.location}
          onChange={(v) => update("location", v)}
          onBlur={save}
          placeholder="Location"
        />
      </td>

      {/* Incident Type */}
      <td className="py-1">
        <Cell
          value={fields.incidentType}
          onChange={(v) => update("incidentType", v)}
          onBlur={save}
          placeholder="Type"
        />
      </td>

      {/* Country */}
      <td className="py-1">
        <Cell
          value={fields.country}
          onChange={(v) => update("country", v)}
          onBlur={save}
          placeholder="Country"
        />
      </td>

      {/* Summary */}
      <td className="py-1">
        <Cell
          value={fields.summary}
          onChange={(v) => update("summary", v)}
          onBlur={save}
          placeholder="Summary"
        />
      </td>

      {/* Actions */}
      <td className="px-2 py-1.5 whitespace-nowrap">
        <div className="flex flex-col gap-1">
          <button
            onClick={handleProcess}
            disabled={processing}
            className="text-blue-600 hover:text-blue-800 text-xs underline disabled:opacity-50 text-left"
          >
            {processing ? "…" : "Scrape"}
          </button>
          {isPending && (
            <>
              <button
                onClick={handleApprove}
                disabled={approving}
                className="text-green-600 hover:text-green-800 text-xs underline disabled:opacity-50 text-left"
              >
                {approving ? "…" : "Approve"}
              </button>
              <button
                onClick={handleFindCombine}
                disabled={combining}
                className="text-purple-600 hover:text-purple-800 text-xs underline disabled:opacity-50 text-left"
              >
                {combining ? "…" : "Combine"}
              </button>
            </>
          )}
          <button
            onClick={() => onDelete(incident.id)}
            className="text-red-500 hover:text-red-700 text-xs underline text-left"
          >
            Del
          </button>
        </div>
      </td>
    </tr>
    {/* Duplicate match banner */}
    {isPending && duplicateMatch && !combineCandidates && (
      <tr className="bg-amber-50/80">
        <td colSpan={10} className="px-4 py-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-amber-800">
              <span className="font-semibold">Possible duplicate</span> of{" "}
              <span className="font-mono text-amber-600">[{duplicateMatch.id}]</span>{" "}
              <span className="text-warm-700">{duplicateMatch.headline}</span>
            </span>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => handleCombineInto(duplicateMatch.id)}
                disabled={combiningInto === duplicateMatch.id}
                className="px-2 py-1 bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 disabled:opacity-50 rounded"
              >
                {combiningInto === duplicateMatch.id ? "Merging…" : "Merge into this"}
              </button>
              <button
                onClick={handleDismissDuplicate}
                disabled={dismissingDupe}
                className="px-2 py-1 bg-warm-200 text-warm-600 text-xs font-medium hover:bg-warm-300 disabled:opacity-50 rounded"
              >
                {dismissingDupe ? "…" : "Dismiss"}
              </button>
            </div>
          </div>
        </td>
      </tr>
    )}
    {/* Combine candidates panel */}
    {combineCandidates !== null && (
      <tr className="bg-purple-50/60">
        <td colSpan={10} className="px-4 py-3">
          {combineCandidates.length === 0 ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-warm-500">No matching existing incidents found.</span>
              <button
                onClick={() => setCombineCandidates(null)}
                className="text-xs text-warm-400 hover:text-warm-600 underline"
              >
                Close
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-purple-800">
                  Combine into existing ({combineCandidates.length} matches)
                </span>
                <button
                  onClick={() => setCombineCandidates(null)}
                  className="text-xs text-warm-400 hover:text-warm-600 underline"
                >
                  Close
                </button>
              </div>
              <div className="space-y-1.5">
                {combineCandidates.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 p-2 bg-white border border-purple-100 rounded text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-warm-400">[{c.id}]</span>{" "}
                      <span className="text-warm-700">{c.headline}</span>
                      {c.date && (
                        <span className="text-warm-400 ml-1">— {c.date}</span>
                      )}
                      <span className="ml-1 text-purple-500 font-medium">
                        ({Math.round(c.score * 100)}%)
                      </span>
                    </div>
                    <button
                      onClick={() => handleCombineInto(c.id)}
                      disabled={combiningInto === c.id}
                      className="px-2 py-1 bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 disabled:opacity-50 rounded shrink-0"
                    >
                      {combiningInto === c.id ? "Merging…" : "Merge into this"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </td>
      </tr>
    )}
    </>
  );
}

type DuplicateGroup = {
  ids: number[];
  headlines: string[];
  reason: string;
};

export function IncidentTable({ incidents }: { incidents: Incident[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"createdAt_desc" | "date_desc" | "date_asc">("createdAt_desc");
  const [bulkText, setBulkText] = useState("");
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const [dedupeMsg, setDedupeMsg] = useState<string | null>(null);
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [merging, setMerging] = useState(false);
  const [candidates, setCandidates] = useState<DuplicateGroup[] | null>(null);
  const [findingDupes, setFindingDupes] = useState(false);
  const [mergingGroupIdx, setMergingGroupIdx] = useState<number | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [scrapingSelected, setScrapingSelected] = useState(false);
  const [scrapeSelectedMsg, setScrapeSelectedMsg] = useState<string | null>(null);

  const filtered = incidents
    .filter((inc) => {
      if (statusFilter === "PENDING" && !(inc.status === "COMPLETE" && !inc.approved)) return false;
      if (statusFilter !== "ALL" && statusFilter !== "PENDING" && inc.status !== statusFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        inc.headline?.toLowerCase().includes(q) ||
        inc.url.toLowerCase().includes(q) ||
        inc.location?.toLowerCase().includes(q) ||
        inc.summary?.toLowerCase().includes(q) ||
        inc.incidentType?.toLowerCase().includes(q) ||
        inc.country?.toLowerCase().includes(q) ||
        inc.date?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === "createdAt_desc") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      const parseDate = (d: string | null) => {
        if (!d) return 0;
        const t = new Date(d).getTime();
        if (!isNaN(t)) return t;
        // M/D/YYYY
        const parts = d.split("/");
        if (parts.length === 3) {
          return new Date(`${parts[2]}-${parts[0].padStart(2,"0")}-${parts[1].padStart(2,"0")}`).getTime() || 0;
        }
        return 0;
      };
      const da = parseDate(a.date);
      const db = parseDate(b.date);
      return sortBy === "date_desc" ? db - da : da - db;
    });

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this incident?")) return;
    await deleteIncident(id);
    router.refresh();
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const filteredIds = filtered.map((i) => i.id);
    const allSelected = filteredIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredIds));
    }
  };

  const handleMergeSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length < 2) return;
    if (
      !confirm(
        `Merge ${ids.length} incidents (IDs: ${ids.join(", ")})? The first incident will be kept and others will be deleted.`
      )
    )
      return;
    setMerging(true);
    try {
      await mergeIncidents(ids);
      setSelectedIds(new Set());
      router.refresh();
    } catch (e: any) {
      alert("Merge failed: " + e.message);
    } finally {
      setMerging(false);
    }
  };

  const handleFindDuplicates = async () => {
    setFindingDupes(true);
    setDedupeMsg(null);
    setCandidates(null);
    try {
      const result = await findDuplicateCandidates();
      setCandidates(result.groups);
      setDedupeMsg(result.message);
    } catch (e: any) {
      setDedupeMsg("Error: " + e.message);
    } finally {
      setFindingDupes(false);
    }
  };

  const handleMergeGroup = async (idx: number) => {
    const group = candidates?.[idx];
    if (!group) return;
    setMergingGroupIdx(idx);
    try {
      await mergeIncidents(group.ids);
      setCandidates((prev) => prev?.filter((_, i) => i !== idx) ?? null);
      router.refresh();
    } catch (e: any) {
      alert("Merge failed: " + e.message);
    } finally {
      setMergingGroupIdx(null);
    }
  };

  const handleDismissGroup = (idx: number) => {
    setCandidates((prev) => prev?.filter((_, i) => i !== idx) ?? null);
  };

  const handleMergeAllGroups = async () => {
    if (!candidates?.length) return;
    if (!confirm(`Merge all ${candidates.length} duplicate groups?`)) return;
    for (let i = candidates.length - 1; i >= 0; i--) {
      setMergingGroupIdx(i);
      try {
        await mergeIncidents(candidates[i].ids);
      } catch (e) {
        console.error("Failed to merge group", candidates[i].ids, e);
      }
    }
    setCandidates(null);
    setMergingGroupIdx(null);
    router.refresh();
  };

  const handleBulkAdd = async () => {
    if (!bulkText.trim()) return;
    setBulkAdding(true);
    setBulkMsg(null);
    try {
      const result = await bulkAddUrls(bulkText);
      setBulkMsg(
        `Added ${result.created} new incidents (${result.skipped} already existed). Scraping in background…`
      );
      setBulkText("");
      router.refresh();
    } catch (e: any) {
      setBulkMsg("Error: " + e.message);
    } finally {
      setBulkAdding(false);
    }
  };

  const handleDeduplicate = async () => {
    if (
      !confirm(
        "Scan all incidents for duplicates about the same individual and auto-merge using AI? This may take a minute."
      )
    )
      return;
    setDeduping(true);
    setDedupeMsg(null);
    try {
      const res = await fetch("/api/admin/deduplicate", {
        method: "POST",
        headers: { "x-edit-password": "acab" },
      });
      const result = await res.json();
      if (res.ok) {
        setDedupeMsg(result.message);
        router.refresh();
      } else {
        setDedupeMsg("Error: " + (result.error ?? "Unknown error"));
      }
    } catch (e: any) {
      setDedupeMsg("Error: " + e.message);
    } finally {
      setDeduping(false);
    }
  };

  const handleBulkApprove = async () => {
    const ids = Array.from(selectedIds);
    const pendingIds = ids.filter((id) => {
      const inc = incidents.find((i) => i.id === id);
      return inc && inc.status === "COMPLETE" && !inc.approved;
    });
    if (pendingIds.length === 0) return;
    setBulkApproving(true);
    try {
      await approveMultiple(pendingIds);
      setSelectedIds(new Set());
      router.refresh();
    } catch (e: any) {
      alert("Approve failed: " + e.message);
    } finally {
      setBulkApproving(false);
    }
  };

  const handleScrapeSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Scrape ${ids.length} selected entries? This may take a while and use API credits.`)) return;
    setScrapingSelected(true);
    setScrapeSelectedMsg(null);
    try {
      const msg = await processSelected(ids);
      setScrapeSelectedMsg(msg);
      setSelectedIds(new Set());
      router.refresh();
    } catch (e: any) {
      setScrapeSelectedMsg("Error: " + e.message);
    } finally {
      setScrapingSelected(false);
    }
  };

  const handleScrapeAll = async () => {
    setScraping(true);
    setScrapeMsg(null);
    try {
      const msg = await processAllIncomplete();
      setScrapeMsg(msg);
      router.refresh();
    } catch (e: any) {
      setScrapeMsg("Error: " + e.message);
    } finally {
      setScraping(false);
    }
  };

  return (
    <div>
      {/* ── Bulk URL add ─────────────────────────────────────── */}
      <div className="mb-5 p-4 border border-warm-200 bg-warm-50 rounded-md">
        <label className="block text-xs font-semibold text-warm-700 mb-2 uppercase tracking-wide">
          Add URLs
        </label>
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          rows={4}
          placeholder={
            "Paste one or more URLs — one per line, or comma-separated.\nEach URL becomes its own row and will be scraped automatically.\n\nhttps://nytimes.com/...\nhttps://apnews.com/..."
          }
          className="w-full px-3 py-2 border border-warm-300 bg-white text-xs font-mono focus:outline-none focus:border-warm-600 rounded resize-y"
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={handleBulkAdd}
            disabled={bulkAdding || !bulkText.trim()}
            className="px-3 py-1.5 bg-warm-900 text-white text-sm font-medium hover:bg-warm-700 disabled:opacity-50 rounded"
          >
            {bulkAdding ? "Adding…" : "Add & Scrape"}
          </button>
          {bulkMsg && <span className="text-xs text-warm-500">{bulkMsg}</span>}
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <input
          type="text"
          placeholder="Search headline, URL, location, type…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3 py-1.5 border border-warm-300 bg-white text-sm rounded-md focus:outline-none focus:border-warm-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 border border-warm-300 bg-white text-sm rounded-md focus:outline-none"
        >
          <option value="ALL">All statuses</option>
          <option value="PENDING">PENDING</option>
          <option value="RAW">RAW</option>
          <option value="COMPLETE">COMPLETE</option>
          <option value="FAILED">FAILED</option>
          <option value="PROCESSING">PROCESSING</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-3 py-1.5 border border-warm-300 bg-white text-sm rounded-md focus:outline-none"
        >
          <option value="createdAt_desc">Newest added</option>
          <option value="date_desc">Date: newest first</option>
          <option value="date_asc">Date: oldest first</option>
        </select>
        <span className="text-xs text-warm-400">
          {filtered.length} of {incidents.length}
        </span>
        <button
          onClick={handleScrapeAll}
          disabled={scraping}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 rounded-md"
        >
          {scraping ? "Scraping…" : "Scrape All Unprocessed"}
        </button>
        {selectedIds.size >= 1 && (
          <button
            onClick={handleScrapeSelected}
            disabled={scrapingSelected}
            className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 rounded-md"
          >
            {scrapingSelected ? "Scraping…" : `Scrape Selected (${selectedIds.size})`}
          </button>
        )}
        <button
          onClick={handleDeduplicate}
          disabled={deduping}
          className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 rounded-md"
        >
          {deduping ? "Finding…" : "Auto-deduplicate"}
        </button>
        <button
          onClick={handleFindDuplicates}
          disabled={findingDupes}
          className="px-3 py-1.5 bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50 rounded-md"
        >
          {findingDupes ? "Scanning…" : "Find Duplicates"}
        </button>
        {selectedIds.size >= 2 && (
          <button
            onClick={handleMergeSelected}
            disabled={merging}
            className="px-3 py-1.5 bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 disabled:opacity-50 rounded-md"
          >
            {merging ? "Merging…" : `Merge Selected (${selectedIds.size})`}
          </button>
        )}
        {selectedIds.size >= 1 && (() => {
          const pendingCount = Array.from(selectedIds).filter((id) => {
            const inc = incidents.find((i) => i.id === id);
            return inc && inc.status === "COMPLETE" && !inc.approved;
          }).length;
          return pendingCount > 0 ? (
            <button
              onClick={handleBulkApprove}
              disabled={bulkApproving}
              className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 rounded-md"
            >
              {bulkApproving ? "Approving…" : `Approve Selected (${pendingCount})`}
            </button>
          ) : null;
        })()}
        {scrapeMsg && <span className="text-xs text-warm-500">{scrapeMsg}</span>}
        {scrapeSelectedMsg && <span className="text-xs text-warm-500">{scrapeSelectedMsg}</span>}
        {dedupeMsg && <span className="text-xs text-warm-500">{dedupeMsg}</span>}
      </div>

      {/* ── Duplicate preview panel ────────────────────────────── */}
      {candidates && candidates.length > 0 && (
        <div className="mb-4 p-4 border border-purple-200 bg-purple-50 rounded-md">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-purple-900">
              Proposed Duplicate Groups ({candidates.length})
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleMergeAllGroups}
                className="px-2 py-1 bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 rounded"
              >
                Merge All
              </button>
              <button
                onClick={() => setCandidates(null)}
                className="px-2 py-1 bg-warm-300 text-warm-700 text-xs font-medium hover:bg-warm-400 rounded"
              >
                Dismiss All
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {candidates.map((group, idx) => (
              <div
                key={group.ids.join("-")}
                className="p-3 bg-white border border-purple-100 rounded"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-purple-800 mb-1">
                      {group.reason}
                    </p>
                    <ul className="space-y-0.5">
                      {group.ids.map((id, i) => (
                        <li key={id} className="text-xs text-warm-600 truncate">
                          <span className="font-mono text-warm-400">[{id}]</span>{" "}
                          {group.headlines[i]}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleMergeGroup(idx)}
                      disabled={mergingGroupIdx === idx}
                      className="px-2 py-1 bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 disabled:opacity-50 rounded"
                    >
                      {mergingGroupIdx === idx ? "…" : "Merge"}
                    </button>
                    <button
                      onClick={() => handleDismissGroup(idx)}
                      className="px-2 py-1 bg-warm-200 text-warm-600 text-xs font-medium hover:bg-warm-300 rounded"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Spreadsheet table ───────────────────────────────── */}
      <div className="overflow-x-auto border border-warm-200 rounded-md">
        <table className="w-full text-xs" style={{ minWidth: "1500px" }}>
          <colgroup>
            <col style={{ width: "40px" }} />
            <col style={{ width: "90px" }} />
            <col style={{ width: "220px" }} />
            <col style={{ width: "240px" }} />
            <col style={{ width: "100px" }} />
            <col style={{ width: "130px" }} />
            <col style={{ width: "130px" }} />
            <col style={{ width: "100px" }} />
            <col />
            <col style={{ width: "60px" }} />
          </colgroup>
          <thead>
            <tr className="bg-warm-100 border-b border-warm-200 text-left text-warm-600 font-semibold uppercase tracking-wide text-[10px]">
              <th className="px-2 py-2 text-center">
                <input
                  type="checkbox"
                  onChange={toggleSelectAll}
                  checked={
                    filtered.length > 0 &&
                    filtered.every((i) => selectedIds.has(i.id))
                  }
                  className="accent-indigo-600"
                />
              </th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Sources (comma-sep)</th>
              <th className="px-2 py-2">Headline</th>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Location</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Country</th>
              <th className="px-2 py-2">Summary</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((inc) => {
              const dupeMatch = inc.duplicateOfId
                ? (() => {
                    const match = incidents.find((i) => i.id === inc.duplicateOfId);
                    return match && match.headline
                      ? { id: match.id, headline: match.headline }
                      : null;
                  })()
                : null;
              return (
                <EditableRow
                  key={inc.id}
                  incident={inc}
                  onDelete={handleDelete}
                  onProcessDone={() => router.refresh()}
                  selected={selectedIds.has(inc.id)}
                  onToggle={toggleSelect}
                  onApproved={() => router.refresh()}
                  duplicateMatch={dupeMatch}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
