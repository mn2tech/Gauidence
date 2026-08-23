"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  buildGuardianStarRows,
  countGuardianStarCells,
  renderGuardianStarFrame,
} from "@/lib/branding/guardianStar";
import { GUARDIAN_BRAND_TAGLINE } from "@/lib/branding";
import {
  clearStartSplashBoot,
  readStartSplashSeen,
  writeStartSplashSeen,
} from "@/lib/branding/startSplash";

const STAR_MS = 12;
const FADE_MS = 900;

type Phase = "pending" | "draw" | "fade" | "gone";

export default function GuardianStartSplash() {
  const [phase, setPhase] = useState<Phase>("pending");
  const [revealed, setRevealed] = useState(0);
  const [brandVisible, setBrandVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dismissed = useRef(false);
  const timers = useRef<number[]>([]);
  const started = useRef(false);

  const rows = useMemo(() => buildGuardianStarRows(), []);
  const totalStars = useMemo(() => countGuardianStarCells(rows), [rows]);
  const lines = useMemo(
    () => renderGuardianStarFrame(rows, revealed),
    [rows, revealed],
  );

  useLayoutEffect(() => {
    setMounted(true);
    if (readStartSplashSeen()) {
      clearStartSplashBoot();
      setPhase("gone");
      return;
    }
    setPhase("draw");
  }, []);

  // Hide the SSR cover only after the real splash is committed to the DOM.
  useLayoutEffect(() => {
    if (phase === "draw" || phase === "fade") {
      clearStartSplashBoot();
    }
  }, [phase]);

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);

  const finish = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    clearTimers();
    writeStartSplashSeen();
    setPhase("fade");
    schedule(() => {
      setPhase("gone");
      clearStartSplashBoot();
    }, FADE_MS);
  }, [clearTimers, schedule]);

  const skip = useCallback(() => {
    if (phase === "pending" || phase === "gone" || phase === "fade") return;
    setRevealed(totalStars);
    setBrandVisible(true);
    finish();
  }, [finish, phase, totalStars]);

  useEffect(() => {
    if (phase !== "draw" || started.current) return;
    started.current = true;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduced) {
      setRevealed(totalStars);
      setBrandVisible(true);
      schedule(finish, 200);
      return () => clearTimers();
    }

    const brandAt = Math.max(1, totalStars - 40);
    let i = 0;
    const tick = () => {
      if (dismissed.current) return;
      i += 1;
      setRevealed(i);
      if (i >= brandAt) setBrandVisible(true);
      if (i >= totalStars) {
        // Dissolve immediately — no hold on the finished frame.
        finish();
        return;
      }
      schedule(tick, STAR_MS);
    };
    schedule(tick, 80);

    return () => clearTimers();
  }, [clearTimers, finish, phase, schedule, totalStars]);

  useEffect(() => {
    if (phase !== "draw") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, skip]);

  useEffect(() => {
    if (phase === "pending" || phase === "gone") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase]);

  if (!mounted || phase === "pending" || phase === "gone") return null;

  const fading = phase === "fade";

  return createPortal(
    <div
      data-guardian-splash=""
      role="dialog"
      aria-label="Guardian starting"
      aria-modal="true"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center px-4 ${
        fading ? "pointer-events-none" : ""
      }`}
      style={{
        opacity: fading ? 0 : 1,
        transform: fading ? "scale(1.015)" : "scale(1)",
        transition: `opacity ${FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), transform ${FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      }}
      onClick={skip}
    >
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 42%, color-mix(in srgb, var(--brand-glow) 85%, white) 0%, var(--brand-light) 45%, var(--background) 100%)",
        }}
      />
      <div
        className="absolute inset-0 -z-10 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--brand) 12%, transparent) 0%, transparent 42%), radial-gradient(circle at 80% 70%, color-mix(in srgb, var(--brand) 10%, transparent) 0%, transparent 38%)",
        }}
      />

      <div className="flex flex-col items-center">
        <pre
          aria-hidden="true"
          className="max-w-full origin-center scale-[0.55] select-none whitespace-pre font-mono text-[11px] leading-[1.15] tracking-[0.08em] text-brand sm:scale-[0.72] sm:text-xs md:scale-90 md:text-sm"
        >
          {lines.join("\n")}
        </pre>

        <div
          className="mt-8 text-center"
          style={{
            opacity: brandVisible ? 1 : 0,
            transform: brandVisible ? "translateY(0)" : "translateY(4px)",
            transition:
              "opacity 400ms cubic-bezier(0.4, 0, 0.2, 1), transform 400ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <p className="font-sans text-2xl font-semibold tracking-[0.22em] text-foreground sm:text-3xl">
            GUARDIAN
          </p>
          <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted sm:text-[11px]">
            {GUARDIAN_BRAND_TAGLINE}
          </p>
        </div>
      </div>

      <button
        type="button"
        className="absolute bottom-8 text-xs font-medium tracking-wide text-ink-muted underline-offset-2 transition hover:text-brand hover:underline"
        style={{
          opacity: fading ? 0 : 1,
          transition: `opacity 200ms ease`,
        }}
        onClick={(event) => {
          event.stopPropagation();
          skip();
        }}
      >
        Skip
      </button>
    </div>,
    document.body,
  );
}
