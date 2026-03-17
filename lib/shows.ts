import { shows, type Show } from "@/data/shows";

export function getUpcomingShows(): Show[] {
  const today = new Date().toISOString().split("T")[0];
  return shows.filter((s) => s.date >= today).sort((a, b) => a.date.localeCompare(b.date));
}

export function getPastShows(limit = 20): Show[] {
  const today = new Date().toISOString().split("T")[0];
  return shows.filter((s) => s.date < today).sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

export function formatShowDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("de-AT", { day: "2-digit", month: "short" });
}
