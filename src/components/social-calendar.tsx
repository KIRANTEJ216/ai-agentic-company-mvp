"use client";
import { useState } from "react";
import { calendarDays, dayKey } from "@/lib/social/calendar";
type CalendarJob = {
  id: string;
  variant_id: string;
  scheduled_at: string;
  state: string;
};
export function SocialCalendar({
  jobs,
  labels,
}: {
  jobs: CalendarJob[];
  labels: Record<string, string>;
}) {
  const [anchor, setAnchor] = useState(() => new Date()),
    [mode, setMode] = useState<"month" | "week">("month");
  function shift(direction: number) {
    setAnchor((current) =>
      mode === "month"
        ? new Date(current.getFullYear(), current.getMonth() + direction, 1)
        : new Date(
            current.getFullYear(),
            current.getMonth(),
            current.getDate() + direction * 7,
          ),
    );
  }
  return (
    <section aria-label="Publishing calendar">
      <div className="social-toolbar">
        <h3>
          {anchor.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })}
        </h3>
        <button onClick={() => shift(-1)} aria-label="Previous calendar period">
          Previous
        </button>
        <button onClick={() => setAnchor(new Date())}>Today</button>
        <button onClick={() => shift(1)} aria-label="Next calendar period">
          Next
        </button>
        <label>
          Calendar view
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "month" | "week")}
          >
            <option value="month">Month</option>
            <option value="week">Week</option>
          </select>
        </label>
      </div>
      <div
        className="social-calendar"
        role="list"
        aria-label={`${mode} in device timezone`}
      >
        {calendarDays(anchor, mode).map((day) => (
          <div
            className={
              "social-day " +
              (dayKey(day) === dayKey(new Date()) ? "social-day-today" : "")
            }
            role="listitem"
            key={dayKey(day)}
          >
            <time dateTime={dayKey(day)}>
              {day.toLocaleDateString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </time>
            {jobs
              .filter((j) => dayKey(new Date(j.scheduled_at)) === dayKey(day))
              .map((j) => (
                <a href={"#post-" + j.variant_id} key={j.id}>
                  {new Date(j.scheduled_at).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {labels[j.variant_id] || "Post"} · {j.state}
                </a>
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}
