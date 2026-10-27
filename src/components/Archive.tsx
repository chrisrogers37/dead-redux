import type { ArchiveMonth } from "@/lib/archive";
import { formatMonth } from "@/lib/format";
import { Timeline } from "@/components/Timeline";

interface ArchiveProps {
  /** Every month of the archive, newest first. */
  months: ArchiveMonth[];
  /** The month this page shows; null while the archive is empty. */
  open: ArchiveMonth | null;
}

/** The archive: one month's rows, a link to each other month, and the count of every show featured. */
export function Archive({ months, open }: ArchiveProps) {
  const count = months.reduce((n, month) => n + month.picks.length, 0);
  const others = months.filter((month) => month !== open);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8" data-month={open?.key}>
      <nav className="flex items-baseline justify-between">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the world starts once per page load */}
        <a href="/" className="t-tag text-muted hover:text-ink">Dead Redux</a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the world starts once per page load */}
        <a href="/" className="t-row text-muted hover:text-ink">Today&rsquo;s show</a>
      </nav>

      <h1 className="t-date text-ink mt-10">Archive</h1>

      {open && <h2 className="t-label text-muted mt-6">{formatMonth(open.key)}</h2>}
      <div className="mt-2">
        <Timeline picks={open?.picks ?? []} />
      </div>

      {others.length > 0 && (
        <>
          <h2 className="t-label text-muted mt-10">Other months</h2>
          <div className="mt-2 space-y-1">
            {/* A month is a page of its own, loaded when its link is followed. */}
            {others.map((month) => (
              <a
                key={month.key}
                href={`/archive/${month.key}`}
                className="flex items-baseline justify-between py-3 px-4 -mx-4 rounded hover:bg-line"
              >
                <span className="t-body text-ink">{formatMonth(month.key)}</span>
                <span className="t-row text-muted">{month.picks.length} show{month.picks.length !== 1 ? "s" : ""}</span>
              </a>
            ))}
          </div>
        </>
      )}

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
          {" "}&middot; {count} show{count !== 1 ? "s" : ""} featured
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
