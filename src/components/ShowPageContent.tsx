import { ShowPlayer } from "@/components/ShowPlayer";
import { ShareButtons } from "@/components/ShareButtons";
import { DancingBears } from "@/components/DancingBears";
import { ShowInfo } from "@/components/ShowInfo";
import { StealYourFace } from "@/components/StealYourFace";
import { WhimsicalUnicorn } from "@/components/WhimsicalUnicorn";
import { WhimsicalForest } from "@/components/WhimsicalForest";
import { PastelRainbow } from "@/components/PastelRainbow";
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
      {/* Soft pastel background orbs */}
      <div className="psychedelic-orb w-96 h-96 -top-48 -left-48 bg-dead-lavender/30" />
      <div className="psychedelic-orb w-80 h-80 top-1/4 -right-40 bg-dead-peach/25" style={{ animationDelay: "2s" }} />
      <div className="psychedelic-orb w-72 h-72 bottom-1/4 -left-36 bg-dead-sky/20" style={{ animationDelay: "4s" }} />
      <div className="psychedelic-orb w-64 h-64 -bottom-32 right-1/4 bg-dead-mint/20" style={{ animationDelay: "6s" }} />

      {/* Background SYF watermark */}
      <StealYourFace className="absolute inset-0 flex items-center justify-center" />

      {/* Unicorn accents */}
      <div className="absolute top-12 right-8 opacity-40 hidden md:block animate-[float_8s_ease-in-out_infinite]">
        <WhimsicalUnicorn />
      </div>
      <div className="absolute bottom-32 left-6 opacity-30 hidden lg:block animate-[float_10s_ease-in-out_infinite]" style={{ animationDelay: "3s" }}>
        <WhimsicalUnicorn flip />
      </div>

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
          <h2 className="font-display text-xl sm:text-2xl md:text-3xl text-dead-bone">
            {show.venue}
          </h2>
          <p className="text-sm text-dead-bone/75">
            {show.location} &middot; {show.date}
          </p>
        </div>

        {/* Small rainbow accent */}
        <div className="flex justify-center">
          <PastelRainbow size="small" />
        </div>

        {/* Player */}
        <div className="watercolor-card overflow-hidden">
          {bestSource ? (
            <ShowPlayer archiveId={bestSource.upstreamIdentifier} />
          ) : (
            <div className="text-center py-16 text-dead-bone/65">
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

        {/* Forest divider */}
        <WhimsicalForest />

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
        <div className="text-center text-xs text-dead-bone/55 pt-4 space-y-2">
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
