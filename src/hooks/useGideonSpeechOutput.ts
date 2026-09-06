"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pickGideonSpeechVoice } from "@/lib/voice/gideonSpeechVoice";

function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices();
}

export function useGideonSpeechOutput() {
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(
    null
  );
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const sync = () => setVoices(loadVoices());
    sync();
    // Chromium often populates voices asynchronously.
    window.speechSynthesis.addEventListener("voiceschanged", sync);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", sync);
    };
  }, []);

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageId(null);
    utteranceRef.current = null;
  }, []);

  const speak = useCallback(
    (messageId: string, text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      if (speakingMessageId === messageId) {
        stop();
        return;
      }

      stop();
      const utterance = new SpeechSynthesisUtterance(trimmed);
      const available = voices.length ? voices : loadVoices();
      const voice = pickGideonSpeechVoice(available);
      if (voice) {
        utterance.voice = voice;
        // Keep lang aligned with the chosen voice when available.
        if (voice.lang) utterance.lang = voice.lang;
      } else {
        utterance.lang = "en-US";
      }
      // Slightly lower pitch reads more male on default/neutral voices.
      utterance.pitch = 0.92;
      utterance.rate = 1;

      utterance.onend = () => setSpeakingMessageId(null);
      utterance.onerror = () => setSpeakingMessageId(null);
      utteranceRef.current = utterance;
      setSpeakingMessageId(messageId);
      window.speechSynthesis.speak(utterance);
    },
    [speakingMessageId, stop, voices]
  );

  useEffect(() => () => stop(), [stop]);

  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  return { speak, stop, speakingMessageId, supported };
}
