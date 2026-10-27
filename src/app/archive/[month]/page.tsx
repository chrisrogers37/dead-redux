import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { archiveMonths, getArchivePicks } from "@/lib/archive";
import { formatMonth } from "@/lib/format";
import { Archive } from "@/components/Archive";

interface PageProps {
  params: Promise<{ month: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { month } = await params;
  const name = formatMonth(month);
  // A path that is not a month keeps the archive's title; the page answers 404.
  if (name === month) return { title: "Archive | Dead Redux" };
  return { title: `${name} — Archive | Dead Redux`, description: `Past daily Grateful Dead show picks from ${name}` };
}

export default async function ArchiveMonthPage({ params }: PageProps) {
  // The month list and the count run through yesterday, so the page renders on every visit.
  await connection();
  const { month } = await params;
  const months = archiveMonths(getArchivePicks());
  const open = months.find((candidate) => candidate.key === month);
  if (!open) notFound();
  return <Archive months={months} open={open} />;
}
