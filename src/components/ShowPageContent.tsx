import { ShowPlayer } from "@/components/ShowPlayer";
import { ShareButtons } from "@/components/ShareButtons";
import { DancingBears } from "@/components/DancingBears";
import { ShowInfo } from "@/components/ShowInfo";
import { StealYourFace } from "@/components/StealYourFace";
import type { ShowSummary, Source } from "@/lib/types";

interface ShowPageContentProps {
  show: ShowSummary;
  bestSource: Source | null;
  tourName: string | null;
  isToday: boolean;
}

export function ShowPageContent({
  show,
  bestSource,
  tourName,
  isToday,
}: ShowPageContentProps) {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* Psychedelic background orbs */}
      <div className="psychedelic-orb w-96 h-96 -top-48 -left-48 bg-purple-500/20" />
      <div className="psychedelic-orb w-80 h-80 top-1/4 -right-40 bg-pink-500/15" style={{ animationDelay: "2s" }} />
      <div className="psychedelic-orb w-72 h-72 bottom-1/4 -left-36 bg-cyan-400/10" style={{ animationDelay: "4s" }} />
      <div className="psychedelic-orb w-64 h-64 -bottom-32 right-1/4 bg-green-400/10" style={{ animationDelay: "6s" }} />

      {/* Background SYF watermark */}
      <StealYourFace className="absolute inset-0 flex items-center justify-center text-dead-cream" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-2xl mx-auto space-y-8">
        {/* Site title */}
        <div className="text-center">
          <h1 className="font-display text-4xl md:text-5xl tracking-tight rainbow-text">
            Dead Redux
          </h1>
          <div className="bolt-divider mt-3 mx-auto max-w-xs" />
        </div>

        {/* Show info */}
        <div className="text-center space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-dead-gold animate-[float_6s_ease-in-out_infinite]">
            {isToday ? "Today\u2019s Show" : show.date}
          </p>
          <h2 className="font-display text-xl sm:text-2xl md:text-3xl text-dead-cream">
            {show.venue}
          </h2>
          <p className="text-sm text-dead-bone/70">
            {show.location} &middot; {show.date}
          </p>
        </div>

        {/* Player */}
        <div className="player-glow rounded-xl overflow-hidden border border-dead-purple/30">
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

        {/* Share */}
        <ShareButtons
          showDate={show.date}
          venue={show.venue}
          location={show.location}
        />

        {/* Show details */}
        <ShowInfo
          showDate={show.date}
          venue={show.venue}
          location={show.location}
          tourName={tourName}
          avgRating={show.avgRating}
          source={bestSource}
        />

        {/* Footer */}
        <div className="text-center text-xs text-dead-bone/40 pt-4 space-y-2">
          <p>
            Powered by{" "}
            <a
              href="https://relisten.net/grateful-dead"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-dead-pink"
            >
              Relisten
            </a>
            {" "}&amp;{" "}
            <a
              href="https://archive.org/details/GratefulDead"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-dead-pink"
            >
              Archive.org
            </a>
          </p>
          <p>
            <a href="/archive" className="underline hover:text-dead-pink">
              Past Shows
            </a>
          </p>
        </div>
      </div>

      {/* Dancing bears */}
      <DancingBears />
    </main>
  );
}
