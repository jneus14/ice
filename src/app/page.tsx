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
  const sourceTypes =
    typeof params.sourceType === "string"
      ? [params.sourceType]
      : (params.sourceType as string[] | undefined);

  const page = Number(params.page) || 1;
  const feed = (params.feed === "policy" ? "policy" : "incidents") as "incidents" | "policy";
  // Social-only incidents are always included in the feed and marked with a banner.
  const hideSocialOnly = false;

  // Use date filters from URL if provided; otherwise show most recent incidents
  const dateFrom = params.from as string | undefined;
  const dateTo = params.to as string | undefined;

  // Parse map bounding box for geographic filtering
  const n = params.n as string | undefined;
  const s = params.s as string | undefined;
  const e = params.e as string | undefined;
  const w = params.w as string | undefined;
  const bounds = n && s && e && w
    ? { north: parseFloat(n), south: parseFloat(s), east: parseFloat(e), west: parseFloat(w) }
    : undefined;

  const [{ incidents, total, pageSize }, countries, totalAll, mapIncidents, pendingIncidents] =
    await Promise.all([
      getIncidents({
        search: params.q as string,
        tags,
        tagMode: params.tagMode === "any" ? "any" : "all",
        sourceTypes,
        feed,
        location: params.location as string,
        country: params.country as string,
        dateFrom,
        dateTo,
        range: params.range as string,
        page,
        bounds,
        hideSocialOnly,
      }),
      getDistinctCountries(),
      getTotalWithHeadline({
        search: params.q as string,
        tags,
        tagMode: params.tagMode === "any" ? "any" : "all",
        sourceTypes,
        feed,
        location: params.location as string,
        country: params.country as string,
        bounds,
        hideSocialOnly,
      }),
      getMapIncidents({
        search: params.q as string,
        tags,
        tagMode: params.tagMode === "any" ? "any" : "all",
        sourceTypes,
        feed,
        location: params.location as string,
        country: params.country as string,
        bounds,
        hideSocialOnly,
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
