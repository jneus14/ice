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

  const [{ incidents, total, pageSize }, countries, totalAll, mapIncidents, pendingIncidents] =
    await Promise.all([
      getIncidents({
        search: params.q as string,
        tags,
        tagMode: params.tagMode === "any" ? "any" : "all",
        location: params.location as string,
        country: params.country as string,
        dateFrom: params.from as string,
        dateTo: params.to as string,
        range: params.range as string,
        page,
      }),
      getDistinctCountries(),
      getTotalWithHeadline(),
      getMapIncidents({
        search: params.q as string,
        tags,
        tagMode: params.tagMode === "any" ? "any" : "all",
        location: params.location as string,
        country: params.country as string,
        dateFrom: params.from as string,
        dateTo: params.to as string,
        range: params.range as string,
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
