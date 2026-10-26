export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function calendarDays(anchor: Date, mode: "month" | "week") {
  const start =
    mode === "month"
      ? new Date(anchor.getFullYear(), anchor.getMonth(), 1)
      : new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  start.setDate(start.getDate() - start.getDay());
  return Array.from(
    { length: mode === "month" ? 42 : 7 },
    (_, index) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
  );
}
