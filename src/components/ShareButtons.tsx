"use client";

import { useState, useSyncExternalStore } from "react";

interface ShareButtonsProps {
  featuredDate: string;
  showDate: string;
  venue: string;
  location: string;
}

// Whether the browser has a share sheet does not change while the page is open.
function subscribe() {
  return () => {};
}

// Every pill shares this look and adds its own hover tint. Hover darkens the text,
// so a hovered pill never loses contrast.
const pillClass = `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm
  border border-dead-lavender/30 bg-white/50 text-dead-bone/90 hover:text-dead-bone
  transition-colors`;

export function ShareButtons({ featuredDate, showDate, venue, location }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  // False on the server and during hydration, so the first client render matches the server's.
  const canShare = useSyncExternalStore(
    subscribe,
    () => typeof navigator.share === "function",
    () => false
  );

  // The featured day's own page, so a link shared from the home page keeps opening this show.
  const url = `https://dead-redux.vercel.app/${featuredDate}`;

  const text = `Today's Dead show: ${venue}, ${location} — ${showDate}`;

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

  async function share() {
    try {
      await navigator.share({ text, url });
    } catch {
      // Closing the share sheet rejects too; there is nothing to do.
    }
  }

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
    <div className="flex flex-wrap items-center justify-center gap-3">
      {/* The device's share sheet where there is one, otherwise X and Facebook */}
      {canShare ? (
        <button
          onClick={share}
          className={`${pillClass} hover:border-dead-pink/40 hover:bg-dead-pink/10 cursor-pointer`}
        >
          <ShareIcon />
          Share
        </button>
      ) : (
        <>
          {/* X */}
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${pillClass} hover:border-dead-pink/40 hover:bg-dead-pink/10`}
            aria-label="Share on X"
          >
            <XIcon />
            Share on X
          </a>

          {/* Facebook */}
          <a
            href={facebookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${pillClass} hover:border-dead-sky/40 hover:bg-dead-sky/10`}
            aria-label="Share on Facebook"
          >
            <FacebookIcon />
            Share on Facebook
          </a>
        </>
      )}

      {/* Copy link */}
      <button
        onClick={copyLink}
        className={`${pillClass} hover:border-dead-mint/40 hover:bg-dead-mint/10 cursor-pointer`}
        aria-label="Copy link"
      >
        <LinkIcon />
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <path d="M16 6l-4-4-4 4" />
      <path d="M12 2v13" />
    </svg>
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
