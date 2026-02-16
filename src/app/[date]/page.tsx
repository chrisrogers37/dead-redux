import { notFound } from "next/navigation";
import { getDailyShow, isValidDateStr, getTodayDateStr } from "@/lib/daily-show";
import { fetchShowDetails, pickBestSource } from "@/lib/relisten";
import { ShowPlayer } from "@/components/ShowPlayer";
import { DancingBears } from "@/components/DancingBears";
import { StealYourFace } from "@/components/StealYourFace";

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
    <main className="relative min-h-screen flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* Background SYF watermark */}
      <StealYourFace className="absolute inset-0 flex items-center justify-center text-dead-cream" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-2xl mx-auto space-y-8">
        {/* Site title */}
        <div className="text-center">
          <h1 className="font-display text-4xl md:text-5xl tracking-tight text-dead-cream">
            Dead Redux
          </h1>
          <div className="bolt-divider mt-3 mx-auto max-w-xs" />
        </div>

        {/* Show info */}
        <div className="text-center space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-dead-gold">
            {isToday ? "Today\u2019s Show" : show.date}
          </p>
          <h2 className="font-display text-2xl md:text-3xl text-dead-cream">
            {show.venue}
          </h2>
          <p className="text-sm text-dead-bone/70">
            {show.location} &middot; {show.date}
          </p>
        </div>

        {/* Player */}
        <div className="player-glow rounded-xl overflow-hidden border border-dead-cream/10">
          {bestSource ? (
            <ShowPlayer archiveId={bestSource.upstreamIdentifier} />
          ) : (
            <div className="text-center py-16 text-dead-bone/50">
              <p>No audio source available for this show.</p>
              <p className="text-sm mt-2">
                Try{" "}
                <a
                  href={`https://relisten.net/grateful-dead/${show.date.replace(/-/g, "/")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-dead-gold/70 hover:text-dead-gold"
                >
                  Relisten
                </a>
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-dead-bone/30 pt-4">
          <p>
            Powered by{" "}
            <a
              href="https://relisten.net/grateful-dead"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-dead-bone/50"
            >
              Relisten
            </a>
            {" "}&amp;{" "}
            <a
              href="https://archive.org/details/GratefulDead"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-dead-bone/50"
            >
              Archive.org
            </a>
          </p>
        </div>
      </div>

      {/* Dancing bears */}
      <DancingBears />
    </main>
  );
}
