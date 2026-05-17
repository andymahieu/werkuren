import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function parseTime(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h + m / 60;
}

export function calculateDuration(start, end) {
  return Math.max(0, parseTime(end) - parseTime(start));
}

export function calculateExpectedDuration(day) {
  if (!day || !day.active) return 0;
  let total = calculateDuration(day.start, day.end);
  if (day.hasBreak) {
    total -= calculateDuration(day.breakStart, day.breakEnd);
  }
  return Math.max(0, total);
}
