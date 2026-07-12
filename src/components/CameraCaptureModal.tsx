"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, SwitchCamera, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
};

/**
 * In-browser camera for scanning business cards, receipts, and paper docs.
 * Uses the rear camera when available; falls back to any video input.
 */
export default function CameraCaptureModal({ open, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  );

  useEffect(() => {
    if (!open) {
      stopStream();
      return;
    }

    let cancelled = false;
    async function start() {
      setStarting(true);
      setError(null);
      stopStream();
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError(
            "Camera isn't available in this browser. Use Choose a file instead."
          );
          setStarting(false);
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError(
          "Couldn't access the camera. Allow camera permission, or use Choose a file."
        );
      } finally {
        if (!cancelled) setStarting(false);
      }
    }
    void start();

    return () => {
      cancelled = true;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facingMode]);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function handleClose() {
    stopStream();
    onClose();
  }

  async function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92)
      );
      if (!blob) throw new Error("blob");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const file = new File([blob], `scan-${stamp}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
      stopStream();
      onCapture(file);
      onClose();
    } catch {
      setError("Couldn't capture the photo. Please try again.");
    } finally {
      setCapturing(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan with camera"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/70 p-4"
      onClick={handleClose}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-brand" />
            <p className="text-sm font-semibold">Scan a document</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close camera"
            className="rounded-full p-2 text-ink-muted transition hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative aspect-[3/4] bg-stone-900 sm:aspect-video">
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        </div>

        {error && (
          <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 px-4 py-3">
          <button
            type="button"
            onClick={() =>
              setFacingMode((m) => (m === "environment" ? "user" : "environment"))
            }
            disabled={starting || Boolean(error)}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-2 text-xs font-medium transition hover:bg-stone-50 disabled:opacity-50"
          >
            <SwitchCamera className="h-3.5 w-3.5" />
            Flip camera
          </button>
          <button
            type="button"
            onClick={() => void takePhoto()}
            disabled={starting || capturing || Boolean(error)}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          >
            {capturing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            {capturing ? "Saving…" : "Capture"}
          </button>
        </div>
        <p className="px-4 pb-3 text-[11px] text-ink-muted">
          Tip: fill the frame with the card or receipt; avoid glare. Uploads as
          JPG and can be analyzed like any other document.
        </p>
      </div>
    </div>
  );
}
