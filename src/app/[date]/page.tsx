import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDailyShow, isValidDateStr, getTodayDateStr } from "@/lib/daily-show";
import { formatDate } from "@/lib/format";
import { lookUpShow, pickBestSource } from "@/lib/relisten";
import { forcedLookup, testHooksEnabled } from "@/lib/test-hooks";
import { WorldHome } from "@/components/world/WorldHome";

interface PageProps {
  params: Promise<{ date: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

export default async function DailyShowPage({ params, searchParams }: PageProps) {
  // The "Today's Show" label depends on the date, so the page renders on every visit.
  await connection();
  const { date } = await params;
  if (!isValidDateStr(date)) notFound();

  const show = getDailyShow(date);
  // A show Relisten has no record of renders without a recording; one it fails to answer for says so. A preview may force either.
  const lookup = forcedLookup((await searchParams).lookup) ?? (await lookUpShow(show.date));
  const details = lookup.kind === "found" ? lookup.details : null;
  const bestSource = details ? pickBestSource(details.sources) : null;

  return (
    <WorldHome
      show={show}
      featuredDate={date}
      bestSource={bestSource}
      isToday={date === getTodayDateStr()}
      tourName={details?.tour?.name ?? null}
      testHooks={testHooksEnabled()}
      lookupFailed={lookup.kind === "failed"}
    />
  );
}
