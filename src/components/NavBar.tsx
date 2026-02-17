import Link from "next/link";

export function NavBar() {
  return (
    <nav className="flex items-center justify-center gap-6 text-xs text-dead-bone/40 py-4">
      <Link
        href="/"
        className="hover:text-dead-bone/70 transition-colors"
      >
        Today&apos;s Show
      </Link>
      <span className="text-dead-bone/20">/</span>
      <span className="text-dead-cream/70">Archive</span>
    </nav>
  );
}
