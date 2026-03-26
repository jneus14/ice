import {
  getIncidents,
  getDistinctCountries,
  getTotalWithHeadline,
  getMapIncidents,
  getPendingIncidents,
} from "@/lib/queries";
import { PageLayout } from "@/components/page-layout";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tags =
    typeof params.tag === "string"
      ? [params.tag]
      : (params.tag as string[] | undefined);

  const page = Number(params.page) || 1;

  // Default to current month when no date filters or search are set
  let dateFrom = params.from as string | undefined;
  let dateTo = params.to as string | undefined;
  const hasSearchFilters = params.q || params.tag || params.location || params.country || params.range;
  if (!dateFrom && !dateTo && !hasSearchFilters) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    dateFrom = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    dateTo = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  const [{ incidents, total, pageSize }, countries, totalAll, mapIncidents, pendingIncidents] =
    await Promise.all([
      getIncidents({
        search: params.q as string,
        tags,
        tagMode: params.tagMode === "any" ? "any" : "all",
        location: params.location as string,
        country: params.country as string,
        dateFrom,
        dateTo,
        range: params.range as string,
        page,
      }),
      getDistinctCountries(),
      getTotalWithHeadline({
        search: params.q as string,
        tags,
        tagMode: params.tagMode === "any" ? "any" : "all",
        location: params.location as string,
        country: params.country as string,
      }),
      getMapIncidents({
        search: params.q as string,
        tags,
        tagMode: params.tagMode === "any" ? "any" : "all",
        location: params.location as string,
        country: params.country as string,
      }),
      getPendingIncidents(),
    ]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <PageLayout
      mapIncidents={mapIncidents}
      countries={countries}
      incidents={incidents}
      total={total}
      totalAll={totalAll}
      page={page}
      totalPages={totalPages}
      pendingIncidents={pendingIncidents}
    />
  );
}
