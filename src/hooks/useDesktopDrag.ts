"use client";

import { useEffect, useState } from "react";

/** True when viewport is wide enough for HTML5 drag-and-drop organize. */
export function useDesktopDrag(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setEnabled(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return enabled;
}
