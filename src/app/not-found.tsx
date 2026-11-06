/* The page for a path no route answers, and for a date or a month that is not one. The stylesheet's classes lay it out alone: the
   Content-Security-Policy refuses a style element and style attributes, which Next.js's built-in page uses. */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <nav aria-label="Site" className="flex items-baseline justify-between">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the world starts once per page load */}
        <a href="/" className="t-tag text-muted hover:text-ink">Dead Redux</a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the world starts once per page load */}
        <a href="/" className="t-row text-muted hover:text-ink">Today&rsquo;s show</a>
      </nav>

      <p className="t-label text-accent mt-10">404</p>
      <h1 className="t-date text-ink mt-2">Page not found</h1>
      <p className="t-body text-muted mt-4">No page lives at this address.</p>
      <p className="t-row mt-6">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a page load, as every link on the site is */}
        <a href="/archive" className="text-ink underline hover:text-accent inline-flex items-center min-h-11">Browse the archive</a>
      </p>
    </main>
  );
}
