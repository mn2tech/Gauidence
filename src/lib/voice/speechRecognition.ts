/** Minimal Web Speech API types (not in all TS libs). */

export type SpeechRecognitionResultList = {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
};

export type SpeechRecognitionResult = {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
};

export type SpeechRecognitionAlternative = {
  readonly transcript: string;
  readonly confidence: number;
};

export type SpeechRecognitionEvent = {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
};

export type SpeechRecognitionErrorCode =
  | "no-speech"
  | "aborted"
  | "audio-capture"
  | "network"
  | "not-allowed"
  | "service-not-allowed"
  | "bad-grammar"
  | "language-not-supported";

export type SpeechRecognitionErrorEvent = {
  readonly error: SpeechRecognitionErrorCode;
  readonly message: string;
};

export type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

/** Merge final + interim phrases from a recognition event. */
export function transcriptFromEvent(event: SpeechRecognitionEvent): {
  interim: string;
  final: string;
} {
  let interim = "";
  let final = "";
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];
    const text = result[0]?.transcript ?? "";
    if (result.isFinal) final += text;
    else interim += text;
  }
  return { interim: interim.trim(), final: final.trim() };
}

export function speechRecognitionErrorMessage(
  code: SpeechRecognitionErrorCode
): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow the mic in your browser settings and try again.";
    case "no-speech":
      return "I didn't catch that. Tap the mic and try again.";
    case "audio-capture":
      return "No microphone was found. Check your device and try again.";
    case "network":
      return "Voice input needs a network connection. Try again when you're online.";
    case "aborted":
      return "";
    default:
      return "Voice input failed. Please try again or type your question.";
  }
}
