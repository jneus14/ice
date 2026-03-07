"use client";

import { useState } from "react";
import { backfillGeoData } from "@/app/admin/incidents/backfill-action";

export function BackfillButton() {
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={async () => {
          if (!confirm("Backfill parsed dates and geocode locations for all incidents missing this data? This may take several minutes.")) return;
          setIsPending(true);
          setResult(null);
          try {
            const msg = await backfillGeoData();
            setResult(msg);
          } catch (e: any) {
            setResult("Error: " + e.message);
          } finally {
            setIsPending(false);
          }
        }}
        disabled={isPending}
        className="px-4 py-2 border border-warm-300 text-sm font-medium hover:bg-warm-50 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Backfilling..." : "Backfill Dates & Locations"}
      </button>
      {result && <span className="text-sm text-warm-500">{result}</span>}
    </div>
  );
}
