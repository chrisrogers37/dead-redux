import { getDailyShow, getTodayDateStr } from "@/lib/daily-show";
import { fetchShowDetails, pickBestSource } from "@/lib/relisten";
import { ShowPageContent } from "@/components/ShowPageContent";

export default async function Home() {
  const today = getTodayDateStr();
  const show = getDailyShow(today);
  const details = await fetchShowDetails(show.date);
  const bestSource = details ? pickBestSource(details.sources) : null;

  return (
    <ShowPageContent
      show={show}
      bestSource={bestSource}
      tourName={details?.tour?.name ?? null}
      isToday={true}
    />
  );
}
