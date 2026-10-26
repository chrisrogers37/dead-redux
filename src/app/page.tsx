import { connection } from "next/server";
import { randomPastPick } from "@/lib/archive";
import { getDailyShow } from "@/lib/daily-show";
import { lookUpShow, pickBestSource } from "@/lib/relisten";
import { readSiteDay } from "@/lib/site-day";
import { testHooksEnabled } from "@/lib/test-hooks";
import { WorldHome } from "@/components/world/WorldHome";

export default async function Home() {
  // Today's show depends on the date, so the page renders on every visit.
  // The Relisten fetch keeps its own 24-hour cache.
  await connection();
  const { day: today, at: renderedAt } = readSiteDay();
  const show = getDailyShow(today);
  // A show Relisten has no record of, and one it fails to answer for, both render without a recording.
  const lookup = await lookUpShow(show.date);
  const details = lookup.kind === "found" ? lookup.details : null;
  const bestSource = details ? pickBestSource(details.sources) : null;
  const pastPick = randomPastPick(today, today);
  return (
    <WorldHome
      show={show}
      featuredDate={today}
      today={today}
      renderedAt={renderedAt}
      pastPick={pastPick ? { featuredDate: pastPick.featuredDate, showDate: pastPick.show.date, venue: pastPick.show.venue } : null}
      bestSource={bestSource}
      isToday
      tourName={details?.tour?.name ?? null}
      testHooks={testHooksEnabled()}
    />
  );
}
