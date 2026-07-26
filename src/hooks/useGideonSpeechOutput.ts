"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useGideonSpeechOutput() {
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(
    null
  );
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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
      utterance.onend = () => setSpeakingMessageId(null);
      utterance.onerror = () => setSpeakingMessageId(null);
      utteranceRef.current = utterance;
      setSpeakingMessageId(messageId);
      window.speechSynthesis.speak(utterance);
    },
    [speakingMessageId, stop]
  );

  useEffect(() => () => stop(), [stop]);

  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  return { speak, stop, speakingMessageId, supported };
}
