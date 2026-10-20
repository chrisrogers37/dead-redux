import { connection } from "next/server";
import { getDailyShow, getTodayDateStr } from "@/lib/daily-show";
import { fetchShowDetails, pickBestSource } from "@/lib/relisten";
import { ShowPageContent } from "@/components/ShowPageContent";

export default async function Home() {
  // Today's show depends on the date, so the page renders on every visit.
  // The Relisten fetch keeps its own 24-hour cache.
  await connection();
  const today = getTodayDateStr();
  const show = getDailyShow(today);
  const details = await fetchShowDetails(show.date);
  const bestSource = details ? pickBestSource(details.sources) : null;

  return (
    <ShowPageContent
      show={show}
      featuredDate={today}
      bestSource={bestSource}
      tourName={details?.tour?.name ?? null}
      isToday={true}
    />
  );
}
