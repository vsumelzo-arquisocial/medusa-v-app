import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

export type ViewMode = "auto" | "compact" | "full";
const KEY = "atalaya-view";
const EVT = "atalaya-view-change";

export function getViewMode(): ViewMode {
  if (typeof window === "undefined") return "auto";
  const v = localStorage.getItem(KEY);
  return v === "compact" || v === "full" ? v : "auto";
}
export function setViewMode(m: ViewMode) {
  localStorage.setItem(KEY, m);
  window.dispatchEvent(new Event(EVT));
}

/** Compact (mobile) vs full (PC) layout; "auto" follows screen width. */
export function useViewMode() {
  const mobile = useIsMobile();
  const [mode, setMode] = useState<ViewMode>("auto");
  useEffect(() => {
    const sync = () => setMode(getViewMode());
    sync();
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, []);
  const compact = mode === "compact" || (mode === "auto" && mobile);
  return { mode, compact, setMode: setViewMode };
}
