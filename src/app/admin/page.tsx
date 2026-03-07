import { prisma } from "@/lib/db";
import { IncidentTable } from "@/components/admin/incident-table";
import { AddIncidentForm } from "@/components/admin/add-incident-form";
import { CsvUploadForm } from "@/components/admin/csv-upload-form";
import { ScrapeAllButton } from "@/components/admin/scrape-all-button";
import { BackfillButton } from "@/components/admin/backfill-button";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const incidents = await prisma.incident.findMany({
    orderBy: { createdAt: "desc" },
  });

  const stats = {
    total: incidents.length,
    raw: incidents.filter((i) => i.status === "RAW").length,
    complete: incidents.filter((i) => i.status === "COMPLETE").length,
    failed: incidents.filter((i) => i.status === "FAILED").length,
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {Object.entries(stats).map(([label, count]) => (
          <div key={label} className="border border-warm-200 p-3">
            <div className="text-2xl font-bold">{count}</div>
            <div className="text-xs text-warm-500 uppercase tracking-wide">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 items-start flex-wrap">
        <AddIncidentForm />
        <CsvUploadForm />
        <ScrapeAllButton incompleteCount={stats.raw + stats.failed} />
        <BackfillButton />
      </div>

      <IncidentTable incidents={incidents} />
    </div>
  );
}
