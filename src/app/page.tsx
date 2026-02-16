import { redirect } from "next/navigation";
import { getTodayDateStr } from "@/lib/daily-show";

/**
 * Root page redirects to today's date URL.
 * This ensures the URL always reflects the current day's show.
 */
export default function Home() {
  const today = getTodayDateStr();
  redirect(`/${today}`);
}
