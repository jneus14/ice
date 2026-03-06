import { Suspense } from "react";
import { SearchFilters } from "@/components/search-filters";
import { IncidentList } from "@/components/incident-list";
import { getIncidents, getDistinctCountries } from "@/lib/queries";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tags = typeof params.tag === "string" ? [params.tag] : (params.tag as string[] | undefined);

  const page = Number(params.page) || 1;

  const [{ incidents, total, pageSize }, countries] = await Promise.all([
    getIncidents({
      search: params.q as string,
      tags,
      country: params.country as string,
      dateFrom: params.from as string,
      dateTo: params.to as string,
      page,
    }),
    getDistinctCountries(),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <>
      <Suspense fallback={null}>
        <SearchFilters countries={countries} />
      </Suspense>
      <IncidentList incidents={incidents} total={total} page={page} totalPages={totalPages} />
    </>
  );
}
