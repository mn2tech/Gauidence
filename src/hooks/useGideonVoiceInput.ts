"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSpeechRecognitionCtor,
  isSpeechRecognitionSupported,
  speechRecognitionErrorMessage,
  transcriptFromEvent,
  type SpeechRecognitionInstance,
} from "@/lib/voice/speechRecognition";

type Options = {
  onFinalTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
};

export function useGideonVoiceInput({
  onFinalTranscript,
  onInterimTranscript,
  onError,
  disabled = false,
}: Options) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalBufferRef = useRef("");
  const callbacksRef = useRef({
    onFinalTranscript,
    onInterimTranscript,
    onError,
  });

  useEffect(() => {
    callbacksRef.current = {
      onFinalTranscript,
      onInterimTranscript,
      onError,
    };
  }, [onFinalTranscript, onInterimTranscript, onError]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (disabled) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      callbacksRef.current.onError?.(
        "Voice input isn't supported in this browser. Try Chrome, Edge, or Safari."
      );
      return;
    }

    finalBufferRef.current = "";
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const { interim, final } = transcriptFromEvent(event);
      if (final) {
        finalBufferRef.current = `${finalBufferRef.current} ${final}`.trim();
      }
      const preview = `${finalBufferRef.current} ${interim}`.trim();
      if (preview) {
        callbacksRef.current.onInterimTranscript?.(preview);
      }
    };

    recognition.onerror = (event) => {
      const message = speechRecognitionErrorMessage(event.error);
      if (message) callbacksRef.current.onError?.(message);
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      const text = finalBufferRef.current.trim();
      finalBufferRef.current = "";
      if (text) callbacksRef.current.onFinalTranscript(text);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      callbacksRef.current.onError?.(
        "Couldn't start the microphone. Try again or type your question."
      );
      setListening(false);
    }
  }, [disabled]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  return {
    listening,
    toggle,
    stop,
    supported: isSpeechRecognitionSupported(),
  };
}
