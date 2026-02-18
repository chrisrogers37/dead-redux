"use client";

import { useState } from "react";

interface ShareButtonsProps {
  showDate: string;
  venue: string;
  location: string;
}

export function ShareButtons({ showDate, venue, location }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const url = typeof window !== "undefined"
    ? window.location.href
    : `https://dead-redux.vercel.app/${showDate}`;

  const text = `Today's Dead show: ${venue}, ${location} — ${showDate}`;

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: do nothing — button will just not show "Copied"
    }
  }

  return (
    <div className="flex items-center justify-center gap-3">
      {/* Twitter/X */}
      <a
        href={twitterUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
                   border border-dead-cream/10 bg-dead-cream/5 text-dead-cream/70
                   hover:border-dead-cream/20 hover:bg-dead-cream/10 hover:text-dead-cream
                   transition-colors"
        aria-label="Share on Twitter"
      >
        <XIcon />
        Share
      </a>

      {/* Facebook */}
      <a
        href={facebookUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
                   border border-dead-cream/10 bg-dead-cream/5 text-dead-cream/70
                   hover:border-dead-cream/20 hover:bg-dead-cream/10 hover:text-dead-cream
                   transition-colors"
        aria-label="Share on Facebook"
      >
        <FacebookIcon />
        Share
      </a>

      {/* Copy link */}
      <button
        onClick={copyLink}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
                   border border-dead-cream/10 bg-dead-cream/5 text-dead-cream/70
                   hover:border-dead-cream/20 hover:bg-dead-cream/10 hover:text-dead-cream
                   transition-colors cursor-pointer"
        aria-label="Copy link"
      >
        <LinkIcon />
        {copied ? "Copied!" : "Copy Link"}
      </button>
    </div>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
