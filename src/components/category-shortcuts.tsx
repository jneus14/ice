"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { INCIDENT_TYPE_TAGS } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n";

export function CategoryShortcuts() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const currentTags = searchParams.getAll("tag");
  const { t } = useLanguage();

  const navigate = (value: string) => {
    const isOnlyActive =
      currentTags.length === 1 && currentTags[0] === value;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tag");
    params.delete("page");
    if (!isOnlyActive) params.set("tag", value);
    startTransition(() => router.push(`/?${params.toString()}`));
  };

  return (
    <div className="mb-6">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-warm-500 mb-3">
        {t.browseByType}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {INCIDENT_TYPE_TAGS.map(({ value, label }) => {
          const active = currentTags.includes(value);
          return (
            <button
              key={value}
              onClick={() => navigate(value)}
              className={`px-3 py-2.5 rounded-lg border text-left text-sm font-medium leading-tight transition-colors ${
                active
                  ? "bg-warm-900 text-white border-warm-900"
                  : "bg-white text-warm-700 border-warm-200 hover:border-warm-500 hover:bg-warm-50"
              }`}
            >
              {t.tags.incidentTypes[value] ?? label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
