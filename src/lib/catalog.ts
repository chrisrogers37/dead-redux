import type { ShowSummary } from "./types";

/**
 * Merge a refresh into the catalog. A fetched record replaces the one the
 * catalog has. A show the refresh didn't return keeps its record, because a
 * featured date may name it: unchanged when its year failed to load, or with
 * no recordings left when Relisten no longer lists it.
 *
 * @param known - The catalog before the refresh.
 * @param fetched - Every show the refresh returned.
 * @param failedYears - Years ("YYYY") whose fetch failed.
 * @returns The merged catalog sorted by date, and the dates of the shows
 *   Relisten no longer lists.
 */
export function mergeCatalog(
  known: ShowSummary[],
  fetched: ShowSummary[],
  failedYears: string[]
): { catalog: ShowSummary[]; delisted: string[] } {
  const fetchedDates = new Set(fetched.map((show) => show.date));
  const failed = new Set(failedYears);
  const kept: ShowSummary[] = [];
  const delisted: string[] = [];
  for (const show of known) {
    if (fetchedDates.has(show.date)) continue;
    if (failed.has(show.date.slice(0, 4))) {
      kept.push(show);
    } else {
      kept.push({ ...show, sourceCount: 0 });
      delisted.push(show.date);
    }
  }
  const catalog = [...fetched, ...kept].sort((a, b) => a.date.localeCompare(b.date));
  return { catalog, delisted };
}
