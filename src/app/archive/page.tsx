import type { Metadata } from "next";
import { connection } from "next/server";
import { archiveMonths, getArchivePicks } from "@/lib/archive";
import { Archive } from "@/components/Archive";

export const metadata: Metadata = {
  title: "Archive | Dead Redux",
  description: "Browse past daily Grateful Dead show picks",
};

export default async function ArchivePage() {
  // The archive runs through yesterday, so it renders on every visit.
  await connection();
  const months = archiveMonths(getArchivePicks());
  return <Archive months={months} open={months[0] ?? null} />;
}
