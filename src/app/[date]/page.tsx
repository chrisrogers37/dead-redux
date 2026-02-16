import { notFound } from "next/navigation";
import { getDailyShow, isValidDateStr, getTodayDateStr } from "@/lib/daily-show";
import { fetchShowDetails, pickBestSource } from "@/lib/relisten";
import { ShowPlayer } from "@/components/ShowPlayer";

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
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-sm font-medium uppercase tracking-widest opacity-60">
            {isToday ? "Today's Dead Show" : "Dead Redux"}
          </h1>
          <h2 className="text-2xl font-bold">{show.venue}</h2>
          <p className="opacity-70">
            {show.location} &middot; {show.date}
          </p>
        </div>

        {/* Player */}
        {bestSource ? (
          <ShowPlayer archiveId={bestSource.upstreamIdentifier} />
        ) : (
          <div className="text-center py-12 opacity-50">
            <p>No audio source available for this show.</p>
            <p className="text-sm mt-2">
              Try{" "}
              <a
                href={`https://relisten.net/grateful-dead/${show.date.replace(/-/g, "/")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Relisten
              </a>{" "}
              instead.
            </p>
          </div>
        )}

        {/* Minimal footer */}
        <div className="text-center text-xs opacity-40 pt-8">
          <p>
            Powered by{" "}
            <a
              href="https://relisten.net/grateful-dead"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Relisten
            </a>
            {" & "}
            <a
              href="https://archive.org/details/GratefulDead"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Archive.org
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
