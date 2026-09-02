"use client";

import { useState } from "react";
import QRCode from "react-qr-code";
import { Check, Copy, QrCode, Share2, X } from "lucide-react";
import { getAppBaseUrl } from "@/lib/url/appBaseUrl";
import { summitPublicPath } from "@/lib/summit-space/constants";

type Props = {
  summitSlug: string;
  summitName: string;
};

export default function SummitShareButton({ summitSlug, summitName }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${summitPublicPath(summitSlug)}`
      : `${getAppBaseUrl()}${summitPublicPath(summitSlug)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback shown in modal */
    }
  }

  async function shareNative() {
    const text = `Explore the ${summitName} knowledge hub — contracting resources, prime contractor insights, and session takeaways.`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: summitName, text, url: shareUrl });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    await copyLink();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-stone-50"
      >
        <Share2 className="h-4 w-4" aria-hidden />
        Share Summit Hub
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-label="Share summit hub"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold">Share Summit Hub</h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowQr(false);
                }}
                className="rounded-lg p-1 hover:bg-stone-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              Scan the QR code or share the link with summit attendees.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyLink()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold hover:bg-stone-50"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-brand" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? "Copied" : "Copy Link"}
              </button>
              <button
                type="button"
                onClick={() => setShowQr((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold hover:bg-stone-50"
              >
                <QrCode className="h-4 w-4" />
                QR Code
              </button>
              <button
                type="button"
                onClick={() => void shareNative()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>
            </div>

            <p className="mt-3 break-all rounded-xl bg-stone-50 px-3 py-2 font-mono text-xs text-stone-700">
              {shareUrl}
            </p>

            {showQr ? (
              <div className="mt-5 flex flex-col items-center border-t border-stone-100 pt-5">
                <div className="rounded-2xl border border-stone-200 bg-white p-4">
                  <QRCode
                    value={shareUrl}
                    size={180}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#1c1917"
                    title={`QR code for ${summitName}`}
                  />
                </div>
                <p className="mt-3 text-center text-sm font-medium">
                  Scan to open the Summit Hub
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
