"use client";

import { useState } from "react";
import { processAllIncomplete } from "@/app/admin/incidents/process-action";

export function ScrapeAllButton({ incompleteCount }: { incompleteCount: number }) {
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  if (incompleteCount === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={async () => {
          if (!confirm(`This will attempt to scrape ${incompleteCount} incomplete rows. This may take a while and use API credits. Continue?`)) return;
          setIsPending(true);
          setResult(null);
          try {
            const msg = await processAllIncomplete();
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
        {isPending ? "Scraping..." : `Scrape All Unprocessed (${incompleteCount})`}
      </button>
      {result && <span className="text-sm text-warm-500">{result}</span>}
    </div>
  );
}
