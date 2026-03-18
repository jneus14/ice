"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IncidentCard } from "./incident-card";
import { useLanguage } from "@/lib/i18n";

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

    // Check sessionStorage cache
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) {
        setMap(JSON.parse(cached));
        return;
      }
    } catch {}

    // Translate headlines only in chunks of 15 (summaries translated lazily on expand)
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

export function IncidentList({
  incidents,
  total,
  totalAll,
  page,
  totalPages,
  editMode = false,
}: {
  incidents: Incident[];
  total: number;
  totalAll: number;
  page: number;
  totalPages: number;
  editMode?: boolean;
}) {
  const { t, lang } = useLanguage();
  const { map: translations, loading: translating } = useTranslations(incidents, lang);

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
