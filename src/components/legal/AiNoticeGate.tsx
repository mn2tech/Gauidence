"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AiNoticeModal from "@/components/legal/AiNoticeModal";
import {
  readAiNoticeAcknowledged,
  writeAiNoticeAcknowledged,
} from "@/lib/legal/aiNoticeAck";

/**
 * Soft first-use AI notice on Ask Gideon.
 * Persists via localStorage + profiles when migration 0092 is applied.
 * Does not re-prompt on every visit once acknowledged for the current version.
 */
export default function AiNoticeGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [needsNotice, setNeedsNotice] = useState(false);
  const [checked, setChecked] = useState(false);

  const onAsk =
    pathname === "/ask" || Boolean(pathname?.startsWith("/ask/"));

  useEffect(() => {
    if (!onAsk) {
      setChecked(true);
      setNeedsNotice(false);
      return;
    }

    // Instant client short-circuit — avoid flash / repeat prompts.
    if (readAiNoticeAcknowledged()) {
      setNeedsNotice(false);
      setChecked(true);
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
          migrationPending?: boolean;
        };

        // If DB already has ack, mirror into localStorage for faster next loads.
        if (!body.needsAiNotice) {
          writeAiNoticeAcknowledged();
          if (!cancelled) {
            setNeedsNotice(false);
            setChecked(true);
          }
          return;
        }

        // Migration missing or no server ack — still respect localStorage
        // (user may have continued before columns existed).
        if (readAiNoticeAcknowledged()) {
          if (!cancelled) {
            setNeedsNotice(false);
            setChecked(true);
          }
          return;
        }

        if (!cancelled) {
          setNeedsNotice(true);
          setChecked(true);
        }
      } catch {
        if (!cancelled) {
          setNeedsNotice(!readAiNoticeAcknowledged());
          setChecked(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onAsk, pathname]);

  const onAcknowledged = useCallback(() => {
    writeAiNoticeAcknowledged();
    setNeedsNotice(false);
  }, []);

  return (
    <>
      {children}
      {checked && onAsk ? (
        <AiNoticeModal open={needsNotice} onAcknowledged={onAcknowledged} />
      ) : null}
    </>
  );
}
