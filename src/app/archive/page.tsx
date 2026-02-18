import type { Metadata } from "next";
import { getDailyPicksRange, getLaunchDate } from "@/lib/archive";
import { getTodayDateStr } from "@/lib/daily-show";
import { Timeline } from "@/components/Timeline";
import { NavBar } from "@/components/NavBar";
import { StealYourFace } from "@/components/StealYourFace";
import { DancingBears } from "@/components/DancingBears";

export const metadata: Metadata = {
  title: "Archive | Dead Redux",
  description: "Browse past daily Grateful Dead show picks",
};

export const revalidate = 3600;

export default function ArchivePage() {
  const today = getTodayDateStr();
  const launch = getLaunchDate();
  const picks = today >= launch ? getDailyPicksRange(launch, today) : [];

  return (
    <main className="relative min-h-screen flex flex-col items-center p-4 overflow-hidden">
      {/* Background SYF watermark */}
      <StealYourFace className="absolute inset-0 flex items-center justify-center text-dead-cream" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-2xl mx-auto">
        {/* Nav */}
        <NavBar />

        {/* Header */}
        <div className="text-center space-y-2 py-8">
          <h1 className="font-display text-3xl text-dead-cream">Archive</h1>
          <p className="text-xs text-dead-bone/40">
            Every show we&apos;ve featured, newest first
          </p>
          <div className="bolt-divider mt-3 mx-auto max-w-xs" />
        </div>

        {/* Timeline */}
        <Timeline picks={picks} />

        {/* Footer */}
        <div className="text-center text-xs text-dead-bone/30 py-8">
          <p>
            {picks.length} show{picks.length !== 1 ? "s" : ""} featured so far
          </p>
        </div>
      </div>

      {/* Dancing bears */}
      <DancingBears />
    </main>
  );
}
