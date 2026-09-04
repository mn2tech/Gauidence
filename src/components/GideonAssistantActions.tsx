"use client";

import { useState } from "react";
import {
  Bell,
  CalendarPlus,
  Check,
  Copy,
  Loader2,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";

type GideonAssistantActionsProps = {
  messageId: string;
  plainText: string;
  speechText: string;
  speaking: boolean;
  speechSupported: boolean;
  disabled?: boolean;
  canRegenerate?: boolean;
  canAddToToday?: boolean;
  canRemind?: boolean;
  onSpeak: (messageId: string, text: string) => void;
  onRegenerate?: () => void;
  onAddToToday?: (messageId: string, plainText: string) => Promise<void> | void;
  onRemindMe?: (messageId: string, plainText: string) => Promise<void> | void;
};

export default function GideonAssistantActions({
  messageId,
  plainText,
  speechText,
  speaking,
  speechSupported,
  disabled = false,
  canRegenerate = false,
  canAddToToday = false,
  canRemind = false,
  onSpeak,
  onRegenerate,
  onAddToToday,
  onRemindMe,
}: GideonAssistantActionsProps) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<"today" | "remind" | null>(null);
  const [done, setDone] = useState<"today" | "remind" | null>(null);

  const copy = async () => {
    if (!plainText.trim()) return;
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked; no modal — user can select text manually.
    }
  };

  const runAction = async (
    kind: "today" | "remind",
    handler?: (messageId: string, plainText: string) => Promise<void> | void
  ) => {
    if (!handler || busy || done === kind) return;
    setBusy(kind);
    try {
      await handler(messageId, plainText);
      setDone(kind);
    } finally {
      setBusy(null);
    }
  };

  const actionClass =
    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-ink-muted transition hover:bg-surface-elevated hover:text-foreground disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-0.5 pt-0.5">
      {canAddToToday && onAddToToday ? (
        <button
          type="button"
          disabled={disabled || !plainText.trim() || busy !== null || done === "today"}
          onClick={() => void runAction("today", onAddToToday)}
          className={actionClass}
          aria-label="Add to Today"
        >
          {busy === "today" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : done === "today" ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <CalendarPlus className="h-3.5 w-3.5" />
          )}
          {done === "today" ? "On Today" : "Add to Today"}
        </button>
      ) : null}
      {canRemind && onRemindMe ? (
        <button
          type="button"
          disabled={disabled || !plainText.trim() || busy !== null || done === "remind"}
          onClick={() => void runAction("remind", onRemindMe)}
          className={actionClass}
          aria-label="Remind me"
        >
          {busy === "remind" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : done === "remind" ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Bell className="h-3.5 w-3.5" />
          )}
          {done === "remind" ? "Reminder set" : "Remind me"}
        </button>
      ) : null}
      <button
        type="button"
        disabled={disabled || !plainText.trim()}
        onClick={() => void copy()}
        className={actionClass}
        aria-label={copied ? "Copied" : "Copy response"}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
      {speechSupported ? (
        <button
          type="button"
          disabled={disabled || !speechText.trim()}
          onClick={() => onSpeak(messageId, speechText)}
          className={actionClass}
          aria-label={speaking ? "Stop reading aloud" : "Read aloud"}
        >
          {speaking ? (
            <VolumeX className="h-3.5 w-3.5" />
          ) : (
            <Volume2 className="h-3.5 w-3.5" />
          )}
          {speaking ? "Stop" : "Read aloud"}
        </button>
      ) : null}
      {canRegenerate && onRegenerate ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onRegenerate}
          className={actionClass}
          aria-label="Regenerate response"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Regenerate
        </button>
      ) : null}
    </div>
  );
}
