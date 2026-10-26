"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { formatDate, formatMonthDay } from "@/lib/format";
import { afterShow, newDay } from "@/lib/site-day";
import { clearCarry, readCarry, writeCarry, type Carry } from "./carry";

/** The show a page offers when its own ends. */
export interface PastPick {
  featuredDate: string;
  showDate: string;
  venue: string;
}

interface Inputs {
  /** The site's day the page rendered for. */
  today: string;
  /** When the page rendered, in ms since the epoch: the clock here is corrected to the server's. */
  renderedAt: number;
  pastPick: PastPick | null;
  /** A test hook: the moment the clock reads, in ms since the epoch, in place of the real one. */
  fakeNow: number | null;
  leanback: boolean;
  sleepEndsAt: number | null;
  /** The last track has ended. */
  over: boolean;
  /** What the page before handed over, applied on arrival. */
  onCarry: (carry: Carry) => void;
}

/** The next show, as the chip says it: the new day's, or a past pick from the archive. */
export interface Next {
  kind: "day" | "past";
  href: string;
  line: string;
  /** Hands lean-back and the sleep timer to the page the link loads. */
  carryOver: () => void;
}

/** How often the site's day is checked. */
const CHECK_MS = 60_000;

/**
 * The next show. A watcher reads the site's day every minute and whenever the page comes back into view; once it has turned, the
 * chip says so and its link loads the new day: nothing reloads on its own while the show plays. At the end of the last track the new
 * day loads at once, else the past pick is offered. The link hands lean-back and the sleep timer to the next page (carry), which
 * starts the show on arrival. Called once; NextChip draws the result where it belongs.
 */
export function useNextShow({ today, renderedAt, pastPick, fakeNow, leanback, sleepEndsAt, over, onCarry }: Inputs): Next | null {
  /* The site's day once it has moved on from today's. */
  const [turned, setTurned] = useState<string | null>(null);
  /* The show is over and the day has not turned, so the past pick is offered. */
  const [offering, setOffering] = useState(false);
  /* The server's clock minus this one's, read once on mount. */
  const offset = useRef(0);

  const now = () => new Date(fakeNow ?? Date.now() + offset.current);
  const check = useEffectEvent(() => setTurned(newDay(today, now())));

  /* The watcher: every minute, and whenever the page shows again, from the back-forward cache included. */
  useEffect(() => {
    offset.current = renderedAt - Date.now();
    const first = window.setTimeout(() => check(), 0);
    const timer = window.setInterval(() => check(), CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    const onShow = () => check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onShow);
    };
  }, [renderedAt]);

  /* On arrival: lean-back and the sleep timer come back, and the show starts as the first move would start it, unless the timer has
     already run out. */
  const arrive = useEffectEvent((carry: Carry) => {
    clearCarry();
    onCarry(carry);
    if (carry.sleepEndsAt !== null && carry.sleepEndsAt <= Date.now()) return;
    document.dispatchEvent(new Event("player:join"));
  });
  useEffect(() => {
    const carry = readCarry();
    if (!carry) return;
    const timer = window.setTimeout(() => arrive(carry), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function carryOver() {
    writeCarry({ leanback, sleepEndsAt });
  }

  /* The end of the last track: the new day's show loads at once; else the past pick is offered until the show plays again. */
  const end = useEffectEvent(() => {
    const next = afterShow(today, now(), pastPick?.featuredDate ?? null);
    if (next?.kind === "day") {
      carryOver();
      window.location.assign("/");
      return;
    }
    setOffering(next !== null);
  });
  useEffect(() => {
    const timer = window.setTimeout(() => (over ? end() : setOffering(false)), 0);
    return () => window.clearTimeout(timer);
  }, [over]);

  if (turned) return { kind: "day", href: "/", line: `A new show is up for ${formatMonthDay(turned)}.`, carryOver };
  if (offering && pastPick) {
    return { kind: "past", href: `/${pastPick.featuredDate}`, line: `${pastPick.venue} · ${formatDate(pastPick.showDate)}`, carryOver };
  }
  return null;
}

interface ChipProps {
  next: Next;
  /** Lean-back's type: 24/32 mono, the eyebrow 20/28. */
  leanback: boolean;
}

/** The chip: the eyebrow for a past pick, the line, and the link that loads the next show. It blocks nothing and takes no focus. */
export function NextChip({ next, leanback }: ChipProps) {
  return (
    <div data-next={next.kind} role="status" className={`plate chip ${next.kind === "past" && !leanback ? "sm:w-[360px]" : ""}`}>
      {next.kind === "past" && (
        <p className={leanback ? "text-[20px] leading-7 font-mono uppercase tracking-[0.12em] text-muted" : "t-tag text-muted"}>From the archive</p>
      )}
      <p className={`${leanback ? "text-[24px] leading-8 font-mono" : "t-row"} text-ink flex flex-wrap items-center gap-x-4 gap-y-1 ${next.kind === "past" ? "mt-1" : ""}`}>
        <span>{next.line}</span>
        <a href={next.href} data-action="play-next" onClick={next.carryOver} className="text-accent underline hover:text-ink inline-flex items-center min-h-11 -my-3 px-2 -mx-2 whitespace-nowrap">
          Play it
        </a>
      </p>
    </div>
  );
}
