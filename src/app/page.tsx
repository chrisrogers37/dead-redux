import { connection } from "next/server";
import { getDailyShow, getTodayDateStr } from "@/lib/daily-show";
import { lookUpShow, pickBestSource } from "@/lib/relisten";
import { forcedLookup, testHooksEnabled } from "@/lib/test-hooks";
import { WorldHome } from "@/components/world/WorldHome";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Today's show depends on the date, so the page renders on every visit.
  // The Relisten fetch keeps its own 24-hour cache.
  await connection();
  const today = getTodayDateStr();
  const show = getDailyShow(today);
  // A show Relisten has no record of renders without a recording; one it fails to answer for says so. A preview may force either.
  const lookup = forcedLookup((await searchParams).lookup) ?? (await lookUpShow(show.date));
  const details = lookup.kind === "found" ? lookup.details : null;
  const bestSource = details ? pickBestSource(details.sources) : null;
  return (
    <WorldHome
      show={show}
      featuredDate={today}
      bestSource={bestSource}
      isToday
      tourName={details?.tour?.name ?? null}
      testHooks={testHooksEnabled()}
      lookupFailed={lookup.kind === "failed"}
    />
  );
}
