import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDailyShow, isValidDateStr, getTodayDateStr } from "@/lib/daily-show";
import { formatDate } from "@/lib/format";
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
    description: `Featured on ${formatDate(date)}: ${show.venue}, ${show.location}, ${formatDate(show.date)}`,
  };
}

export default async function DailyShowPage({ params }: PageProps) {
  // The "Today's Show" label depends on the date, so the page renders on every visit.
  await connection();
  const { date } = await params;
  if (!isValidDateStr(date)) notFound();

  const show = getDailyShow(date);
  const details = await fetchShowDetails(show.date);
  const bestSource = details ? pickBestSource(details.sources) : null;
  const isToday = date === getTodayDateStr();

  return (
    <ShowPageContent
      show={show}
      featuredDate={date}
      bestSource={bestSource}
      tourName={details?.tour?.name ?? null}
      isToday={isToday}
    />
  );
}
