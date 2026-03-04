import Link from "next/link";

export function NavBar() {
  return (
    <nav className="flex items-center justify-center gap-6 text-xs text-dead-bone/65 py-4">
      <Link
        href="/"
        className="hover:text-dead-pink transition-colors"
      >
        Today&apos;s Show
      </Link>
      <span className="text-dead-lavender/40">/</span>
      <span className="text-dead-bone/70">Archive</span>
    </nav>
  );
}
