import { prisma } from "@/lib/db";
import { IncidentTable } from "@/components/admin/incident-table";
import { BackfillButton } from "@/components/admin/backfill-button";
import { FeedbackPanel } from "@/components/admin/feedback-panel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const incidents = await prisma.incident.findMany({
    orderBy: { createdAt: "desc" },
  });

  const feedback = await prisma.feedback.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const stats = {
    total: incidents.length,
    pending: incidents.filter((i) => i.status === "COMPLETE" && !i.approved).length,
    raw: incidents.filter((i) => i.status === "RAW").length,
    complete: incidents.filter((i) => i.status === "COMPLETE" && i.approved).length,
    failed: incidents.filter((i) => i.status === "FAILED").length,
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        {Object.entries(stats).map(([label, count]) => (
          <div key={label} className="border border-warm-200 p-3 rounded-md">
            <div className="text-2xl font-bold">{count}</div>
            <div className="text-xs text-warm-500 uppercase tracking-wide">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 items-center">
        <BackfillButton />
      </div>

      {/* Feedback */}
      {feedback.length > 0 && <FeedbackPanel feedback={feedback} />}

      <IncidentTable incidents={incidents} />
    </div>
  );
}
