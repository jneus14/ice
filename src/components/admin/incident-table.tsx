"use client";

import { useState } from "react";
import { updateIncident, deleteIncident, findAndMergeDuplicates } from "@/app/admin/incidents/actions";
import { processIncident } from "@/app/admin/incidents/process-action";
import { parseAltSources } from "@/lib/sources";

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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    RAW: "bg-yellow-100 text-yellow-800",
    PROCESSING: "bg-blue-100 text-blue-800",
    COMPLETE: "bg-green-100 text-green-800",
    FAILED: "bg-red-100 text-red-800",
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-medium ${colors[status] || "bg-warm-100 text-warm-600"}`}>
      {status}
    </span>
  );
}

function AltSourcesEditor({
  sources,
  onChange,
}: {
  sources: string[];
  onChange: (sources: string[]) => void;
}) {
  return (
    <div className="space-y-1">
      {sources.map((src, i) => (
        <div key={i} className="flex gap-1.5">
          <input
            name="altSources[]"
            value={src}
            onChange={(e) => {
              const next = [...sources];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder="https://..."
            className="flex-1 px-2 py-1 border border-warm-300 text-xs focus:outline-none focus:border-warm-900"
          />
          <button
            type="button"
            onClick={() => onChange(sources.filter((_, j) => j !== i))}
            className="px-1.5 text-warm-400 hover:text-red-600 text-base leading-none"
            title="Remove"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...sources, ""])}
        className="text-xs text-warm-500 hover:text-warm-900 underline"
      >
        + Add source
      </button>
    </div>
  );
}

function EditRow({
  incident,
  onClose,
}: {
  incident: Incident;
  onClose: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [altSources, setAltSources] = useState<string[]>(
    parseAltSources(incident.altSources)
  );

  return (
    <tr className="bg-warm-50">
      <td colSpan={7} className="p-4">

        <form
          action={async (formData) => {
            setIsPending(true);
            try {
              await updateIncident(incident.id, formData);
              onClose();
            } finally {
              setIsPending(false);
            }
          }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="col-span-2">
            <label className="block text-xs font-medium text-warm-500 mb-1">URL</label>
            <input name="url" defaultValue={incident.url} className="w-full px-2 py-1.5 border border-warm-300 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-warm-500 mb-1">Headline</label>
            <input name="headline" defaultValue={incident.headline || ""} className="w-full px-2 py-1.5 border border-warm-300 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-warm-500 mb-1">Date</label>
            <input name="date" defaultValue={incident.date || ""} className="w-full px-2 py-1.5 border border-warm-300 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-warm-500 mb-1">Location</label>
            <input name="location" defaultValue={incident.location || ""} className="w-full px-2 py-1.5 border border-warm-300 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-warm-500 mb-1">Incident Type</label>
            <input name="incidentType" defaultValue={incident.incidentType || ""} className="w-full px-2 py-1.5 border border-warm-300 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-warm-500 mb-1">Country</label>
            <input name="country" defaultValue={incident.country || ""} className="w-full px-2 py-1.5 border border-warm-300 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-warm-500 mb-1">Summary</label>
            <textarea name="summary" defaultValue={incident.summary || ""} rows={3} className="w-full px-2 py-1.5 border border-warm-300 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-warm-500 mb-1">Additional Sources</label>
            <AltSourcesEditor sources={altSources} onChange={setAltSources} />
          </div>
          <div className="col-span-2 flex gap-2">
            <button type="submit" disabled={isPending} className="px-3 py-1.5 bg-warm-900 text-white text-sm disabled:opacity-50">
              {isPending ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-warm-500">
              Cancel
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

export function IncidentTable({ incidents }: { incidents: Incident[] }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [deduping, setDeduping] = useState(false);
  const [dedupeMsg, setDedupeMsg] = useState<string | null>(null);

  const filtered = incidents.filter((inc) => {
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
  });

  async function handleDeduplicate() {
    if (!confirm("Scan all incidents for duplicates about the same individual and auto-merge them using AI? This may take a minute.")) return;
    setDeduping(true);
    setDedupeMsg(null);
    try {
      const result = await findAndMergeDuplicates();
      setDedupeMsg(result.message);
    } catch (e: any) {
      setDedupeMsg("Error: " + e.message);
    } finally {
      setDeduping(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          type="text"
          placeholder="Search by headline, URL, location, type..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-64 px-3 py-2 border border-warm-300 bg-white text-sm rounded-md focus:outline-none focus:border-warm-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-warm-300 bg-white text-sm rounded-md focus:outline-none focus:border-warm-500"
        >
          <option value="ALL">All statuses</option>
          <option value="RAW">RAW</option>
          <option value="COMPLETE">COMPLETE</option>
          <option value="FAILED">FAILED</option>
          <option value="PROCESSING">PROCESSING</option>
        </select>
        <span className="text-xs text-warm-400">
          {filtered.length} of {incidents.length}
        </span>
        <button
          onClick={handleDeduplicate}
          disabled={deduping}
          className="px-3 py-2 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 rounded-md"
        >
          {deduping ? "Finding duplicates..." : "Auto-deduplicate"}
        </button>
        {dedupeMsg && (
          <span className="text-xs text-warm-500">{dedupeMsg}</span>
        )}
      </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm table-fixed">
        <colgroup>
          <col className="w-[80px]" />
          <col className="w-[28%]" />
          <col className="w-[80px]" />
          <col className="w-[12%]" />
          <col className="w-[14%]" />
          <col className="w-[18%]" />
          <col className="w-[100px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-warm-300 text-left">
            <th className="py-2 pr-3 font-medium text-warm-500">Status</th>
            <th className="py-2 pr-3 font-medium text-warm-500">Headline</th>
            <th className="py-2 pr-3 font-medium text-warm-500">Date</th>
            <th className="py-2 pr-3 font-medium text-warm-500">Location</th>
            <th className="py-2 pr-3 font-medium text-warm-500">Type</th>
            <th className="py-2 pr-3 font-medium text-warm-500">URL</th>
            <th className="py-2 font-medium text-warm-500">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((inc) =>
            editingId === inc.id ? (
              <EditRow
                key={inc.id}
                incident={inc}
                onClose={() => setEditingId(null)}
              />
            ) : (
              <tr key={inc.id} className="border-b border-warm-100 hover:bg-warm-50">
                <td className="py-2 pr-3 align-top">
                  <StatusBadge status={inc.status} />
                  {inc.status === "FAILED" && inc.errorMessage && (
                    <span className="block text-xs text-red-500 mt-0.5 max-w-32 truncate" title={inc.errorMessage}>
                      {inc.errorMessage}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 truncate" title={inc.headline || ""}>
                  {inc.headline || <span className="text-warm-300 italic">No headline</span>}
                  {parseAltSources(inc.altSources).length > 0 && (
                    <span className="ml-1 text-xs text-indigo-500" title="Has additional sources">
                      +{parseAltSources(inc.altSources).length}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 truncate">{inc.date || "—"}</td>
                <td className="py-2 pr-3 truncate">{inc.location || "—"}</td>
                <td className="py-2 pr-3 truncate" title={inc.incidentType || ""}>
                  {inc.incidentType || "—"}
                </td>
                <td className="py-2 pr-3 truncate">
                  <a href={inc.url} target="_blank" rel="noopener" className="text-blue-600 hover:underline">
                    {inc.url.replace(/https?:\/\/(www\.)?/, "").slice(0, 40)}...
                  </a>
                </td>
                <td className="py-2 whitespace-nowrap">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingId(inc.id)}
                      className="text-warm-500 hover:text-warm-900 text-xs underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        setProcessingId(inc.id);
                        try {
                          await processIncident(inc.id);
                        } catch (e: any) {
                          alert("Scrape failed: " + e.message);
                        } finally {
                          setProcessingId(null);
                        }
                      }}
                      disabled={processingId === inc.id}
                      className="text-blue-600 hover:text-blue-800 text-xs underline disabled:opacity-50"
                    >
                      {processingId === inc.id ? "..." : "Scrape"}
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm("Delete this incident?")) {
                          await deleteIncident(inc.id);
                        }
                      }}
                      className="text-red-500 hover:text-red-700 text-xs underline"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
    </div>
  );
}
