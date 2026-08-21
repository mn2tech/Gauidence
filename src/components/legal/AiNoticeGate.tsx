"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AiNoticeModal from "@/components/legal/AiNoticeModal";

const ASK_PATH_PREFIXES = ["/ask", "/home"];

/**
 * Soft first-use AI notice before Gideon-heavy surfaces.
 * Existing users without a stored ack see it once; not shown on every answer.
 */
export default function AiNoticeGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [needsNotice, setNeedsNotice] = useState(false);
  const [checked, setChecked] = useState(false);

  const relevant =
    pathname === "/ask" ||
    pathname?.startsWith("/ask/") ||
    pathname === "/home" ||
    ASK_PATH_PREFIXES.some((p) => pathname === p);

  useEffect(() => {
    if (!relevant) {
      setChecked(true);
      setNeedsNotice(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/account/legal");
        if (res.status === 401) {
          if (!cancelled) {
            setNeedsNotice(false);
            setChecked(true);
          }
          return;
        }
        const body = (await res.json().catch(() => ({}))) as {
          needsAiNotice?: boolean;
        };
        if (!cancelled) {
          setNeedsNotice(Boolean(body.needsAiNotice));
          setChecked(true);
        }
      } catch {
        if (!cancelled) {
          setNeedsNotice(false);
          setChecked(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [relevant, pathname]);

  const onAcknowledged = useCallback(() => {
    setNeedsNotice(false);
  }, []);

  return (
    <>
      {children}
      {checked && relevant ? (
        <AiNoticeModal open={needsNotice} onAcknowledged={onAcknowledged} />
      ) : null}
    </>
  );
}
