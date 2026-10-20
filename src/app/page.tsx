import { connection } from "next/server";
import { getDailyShow, getTodayDateStr } from "@/lib/daily-show";
import { fetchShowDetails, pickBestSource } from "@/lib/relisten";
import { PosterHome } from "@/components/poster/PosterHome";

export default async function Home() {
  // Today's show depends on the date, so the page renders on every visit.
  await connection();
  const today = getTodayDateStr();
  const show = getDailyShow(today);
  const details = await fetchShowDetails(show.date);
  const bestSource = details ? pickBestSource(details.sources) : null;
  return (
    <PosterHome
      show={show}
      featuredDate={today}
      bestSource={bestSource}
      tourName={details?.tour?.name ?? null}
    />
  );
}
