"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Formats a time in the viewer's own timezone. The server runs on UTC, so formatting
 * there would print a different time than the browser and break hydration. Until the
 * page hydrates, this renders an empty <time> with the machine-readable value.
 */
export function LocalTime({ iso, format, className }: { iso: string; format: (iso: string) => string; className?: string }) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  return (
    <time className={className} dateTime={iso}>
      {hydrated ? format(iso) : ""}
    </time>
  );
}
