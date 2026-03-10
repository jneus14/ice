"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateIncidentData,
  deleteIncident,
  findAndMergeDuplicates,
  bulkAddUrls,
} from "@/app/admin/incidents/actions";
import { processIncident, processAllIncomplete } from "@/app/admin/incidents/process-action";
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
  errorMessage: string | null;
  createdAt: Date;
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
}: {
  incident: Incident;
  onDelete: (id: number) => void;
  onProcessDone: () => void;
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

  const statusColors: Record<string, string> = {
    RAW: "bg-yellow-100 text-yellow-800",
    PROCESSING: "bg-blue-100 text-blue-800",
    COMPLETE: "bg-green-100 text-green-800",
    FAILED: "bg-red-100 text-red-800",
  };

  return (
    <tr
      className={`border-b border-warm-100 align-middle ${
        dirty ? "bg-amber-50" : "hover:bg-warm-50"
      }`}
    >
      {/* Status */}
      <td className="px-2 py-1.5 whitespace-nowrap">
        <span
          className={`px-1.5 py-0.5 text-xs font-medium rounded ${
            statusColors[incident.status] || "bg-warm-100 text-warm-600"
          }`}
        >
          {incident.status}
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
        <Cell
          value={fields.sources}
          onChange={(v) => update("sources", v)}
          onBlur={save}
          placeholder="https://..."
          mono
        />
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
          <button
            onClick={() => onDelete(incident.id)}
            className="text-red-500 hover:text-red-700 text-xs underline text-left"
          >
            Del
          </button>
        </div>
      </td>
    </tr>
  );
}

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

  const filtered = incidents
    .filter((inc) => {
      if (statusFilter !== "ALL" && inc.status !== statusFilter) return false;
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
      const result = await findAndMergeDuplicates();
      setDedupeMsg(result.message);
      router.refresh();
    } catch (e: any) {
      setDedupeMsg("Error: " + e.message);
    } finally {
      setDeduping(false);
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
          {scraping ? "Scraping…" : "Scrape All RAW"}
        </button>
        <button
          onClick={handleDeduplicate}
          disabled={deduping}
          className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 rounded-md"
        >
          {deduping ? "Finding…" : "Auto-deduplicate"}
        </button>
        {scrapeMsg && <span className="text-xs text-warm-500">{scrapeMsg}</span>}
        {dedupeMsg && <span className="text-xs text-warm-500">{dedupeMsg}</span>}
      </div>

      {/* ── Spreadsheet table ───────────────────────────────── */}
      <div className="overflow-x-auto border border-warm-200 rounded-md">
        <table className="w-full text-xs" style={{ minWidth: "1500px" }}>
          <colgroup>
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
            {filtered.map((inc) => (
              <EditableRow
                key={inc.id}
                incident={inc}
                onDelete={handleDelete}
                onProcessDone={() => router.refresh()}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
