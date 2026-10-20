import type { ShowSummary } from "./types";

/**
 * Merge a refresh into the catalog. A fetched record replaces the one the
 * catalog has. A show the refresh didn't return keeps its record, because a
 * featured date may name it: unchanged when its year was not refreshed, or
 * with no recordings left when its year was refreshed without it, since
 * Relisten no longer lists it.
 *
 * @param known - The catalog before the refresh.
 * @param fetched - Every show the refresh returned.
 * @param refreshedYears - Years ("YYYY") the refresh loaded in full. Only
 *   these years' shows can lose their recordings.
 * @returns The merged catalog sorted by date, the dates of the shows Relisten
 *   no longer lists, and the catalog's years that were not refreshed, sorted.
 */
export function mergeCatalog(
  known: ShowSummary[],
  fetched: ShowSummary[],
  refreshedYears: string[]
): { catalog: ShowSummary[]; delisted: string[]; unrefreshed: string[] } {
  const fetchedDates = new Set(fetched.map((show) => show.date));
  const refreshed = new Set(refreshedYears);
  const kept: ShowSummary[] = [];
  const delisted: string[] = [];
  const unrefreshed = new Set<string>();
  for (const show of known) {
    if (fetchedDates.has(show.date)) continue;
    const year = show.date.slice(0, 4);
    if (refreshed.has(year)) {
      kept.push({ ...show, sourceCount: 0 });
      delisted.push(show.date);
    } else {
      kept.push(show);
      unrefreshed.add(year);
    }
  }
  const catalog = [...fetched, ...kept].sort((a, b) => a.date.localeCompare(b.date));
  return { catalog, delisted, unrefreshed: [...unrefreshed].sort() };
}
