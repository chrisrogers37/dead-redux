"use client";

import { useState, useSyncExternalStore } from "react";
import { shareContent, type SharedShow } from "@/lib/share";

// Whether the browser has a share sheet does not change while the page is open.
function subscribe() {
  return () => {};
}

// One plate button for the world's top-right row. It opens the device's share sheet where
// there is one; otherwise it copies the link and says "Copied!" for two seconds. On a phone
// it shows only the icon, except for "Copied!", and the label stays readable to a screen reader.
export function ShareButtons(show: SharedShow) {
  const [copied, setCopied] = useState(false);
  // False on the server and during hydration, so the first client render matches the server's.
  const canShare = useSyncExternalStore(
    subscribe,
    () => typeof navigator.share === "function",
    () => false
  );

  const { url, text } = shareContent(show);

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
    <button
      type="button"
      data-action="share"
      onClick={canShare ? share : copyLink}
      className="plate t-body text-ink h-11 flex items-center gap-2"
    >
      <span className={copied ? undefined : "max-sm:sr-only"}>{copied ? "Copied!" : "Share"}</span>
      <ShareIcon />
    </button>
  );
}

function ShareIcon() {
  return (
    <svg className="sm:hidden" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <path d="M16 6l-4-4-4 4" />
      <path d="M12 2v13" />
    </svg>
  );
}
