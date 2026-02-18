import { notFound } from "next/navigation";
import { getDailyShow, isValidDateStr, getTodayDateStr } from "@/lib/daily-show";
import { fetchShowDetails, pickBestSource } from "@/lib/relisten";
import { ShowPageContent } from "@/components/ShowPageContent";

interface PageProps {
  params: Promise<{ date: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { date } = await params;
  if (!isValidDateStr(date)) return { title: "Dead Redux" };
  const show = getDailyShow(date);
  return {
    title: `${show.venue} — ${show.date} | Dead Redux`,
    description: `Today's Grateful Dead show: ${show.venue}, ${show.location} on ${show.date}`,
  };
}

export default async function DailyShowPage({ params }: PageProps) {
  const { date } = await params;
  if (!isValidDateStr(date)) notFound();

  const show = getDailyShow(date);
  const details = await fetchShowDetails(show.date);
  const bestSource = details ? pickBestSource(details.sources) : null;
  const isToday = date === getTodayDateStr();

  return (
    <ShowPageContent
      show={show}
      bestSource={bestSource}
      tourName={details?.tour?.name ?? null}
      isToday={isToday}
    />
  );
}
