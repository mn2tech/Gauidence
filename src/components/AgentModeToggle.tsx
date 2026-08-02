"use client";

import { Bot } from "lucide-react";
import { useAgentMode } from "@/hooks/useAgentMode";

type Props = {
  className?: string;
  compact?: boolean;
};

export default function AgentModeToggle({ className = "", compact }: Props) {
  const { enabled, hydrated, toggle } = useAgentMode();

  if (!hydrated) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      title={
        enabled
          ? "Agent mode on — Gideon will plan multi-step tasks"
          : "Agent mode off"
      }
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
        enabled
          ? "border-brand bg-brand-light/50 text-brand-dark"
          : "border-stone-300 bg-white text-ink-muted hover:bg-stone-50"
      } ${className}`}
    >
      <Bot className="h-3.5 w-3.5" aria-hidden />
      {compact ? (enabled ? "Agent" : null) : enabled ? "Agent mode" : "Agent mode off"}
    </button>
  );
}
