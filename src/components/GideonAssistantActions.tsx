"use client";

import { useState } from "react";
import { Check, Copy, RotateCcw, Volume2, VolumeX } from "lucide-react";

type GideonAssistantActionsProps = {
  messageId: string;
  plainText: string;
  speechText: string;
  speaking: boolean;
  speechSupported: boolean;
  disabled?: boolean;
  canRegenerate?: boolean;
  onSpeak: (messageId: string, text: string) => void;
  onRegenerate?: () => void;
};

export default function GideonAssistantActions({
  messageId,
  plainText,
  speechText,
  speaking,
  speechSupported,
  disabled = false,
  canRegenerate = false,
  onSpeak,
  onRegenerate,
}: GideonAssistantActionsProps) {
  const [copied, setCopied] = useState(false);

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

  const actionClass =
    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-ink-muted transition hover:bg-stone-100 hover:text-foreground disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-0.5 pt-0.5">
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
