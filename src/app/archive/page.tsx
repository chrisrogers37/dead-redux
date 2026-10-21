import type { Metadata } from "next";
import { connection } from "next/server";
import { getArchivePicks } from "@/lib/archive";
import { Timeline } from "@/components/Timeline";

export const metadata: Metadata = {
  title: "Archive | Dead Redux",
  description: "Browse past daily Grateful Dead show picks",
};

export default async function ArchivePage() {
  // The archive runs through yesterday, so it renders on every visit.
  await connection();
  const picks = getArchivePicks();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <nav className="flex items-baseline justify-between">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the world starts once per page load */}
        <a href="/" className="t-tag text-muted hover:text-ink">Dead Redux</a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the world starts once per page load */}
        <a href="/" className="t-row text-muted hover:text-ink">Today&rsquo;s show</a>
      </nav>

      <h1 className="t-date text-ink mt-10">Archive</h1>

      <div className="mt-6">
        <Timeline picks={picks} />
      </div>

      <footer className="mt-10 space-y-2 t-row text-muted">
        <p>
          Powered by{" "}
          <a
            href="https://relisten.net/grateful-dead"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-ink"
          >
            Relisten
          </a>
          {" "}&amp;{" "}
          <a
            href="https://archive.org/details/GratefulDead"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-ink"
          >
            Archive.org
          </a>
          {" "}&middot; {picks.length} show{picks.length !== 1 ? "s" : ""} featured
        </p>
        <p>
          <a
            href="https://archive.org/details/GratefulDead"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-ink"
          >
            Recordings stream from the Live Music Archive under the band&rsquo;s non-commercial trading policy
          </a>
        </p>
        <details>
          <summary className="cursor-pointer">The band&rsquo;s statement</summary>
          <p className="mt-2">&ldquo;No commercial gain may be sought by websites offering digital files of our music, whether through advertising, exploiting databases compiled from their traffic, or any other means. All participants in such digital exchange acknowledge and respect the copyrights of the performers, writers and publishers of the music. This notice should be clearly posted on all sites engaged in this activity. We reserve the ability to withdraw our sanction of non-commercial digital music should circumstances arise that compromise our ability to protect and steward the integrity of our work.&rdquo;</p>
        </details>
      </footer>
    </main>
  );
}
