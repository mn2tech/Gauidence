"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Upload, X } from "lucide-react";
import CameraCaptureModal from "@/components/CameraCaptureModal";
import LeadForm, {
  resolveSourceForApi,
  type LeadFormValues,
} from "@/components/leads/LeadForm";
import type { ExtractedBusinessCard } from "@/lib/leads/types";
import { createClient } from "@/lib/supabase/client";
import { uploadAndAnalyzeToVault } from "@/lib/vault/clientUpload";

type Props = {
  businessProfileId: string;
  ownerUserId?: string | null;
  open: boolean;
  onClose: () => void;
  onCreated: (lead: unknown) => void;
  onDuplicate: (args: {
    payload: Record<string, unknown>;
    duplicates: Array<{ lead: unknown; reasons: string[] }>;
  }) => void;
};

function extractedToFormValues(
  extracted: ExtractedBusinessCard
): Partial<LeadFormValues> {
  return {
    companyName: extracted.companyName ?? "",
    contactName: extracted.contactName ?? "",
    jobTitle: extracted.jobTitle ?? "",
    email: extracted.email ?? "",
    phone: extracted.phone ?? "",
    website: extracted.website ?? "",
    source: "Business Card",
    sourceDetail: "",
    notes: extracted.address ? `Address: ${extracted.address}` : "",
  };
}

export default function LeadCardScanModal({
  businessProfileId,
  ownerUserId,
  open,
  onClose,
  onCreated,
  onDuplicate,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cardFile, setCardFile] = useState<File | null>(null);
  const [extracted, setExtracted] = useState<ExtractedBusinessCard | null>(null);
  const [formKey, setFormKey] = useState(0);

  function reset() {
    setScanning(false);
    setSaving(false);
    setError(null);
    setPreviewUrl(null);
    setCardFile(null);
    setExtracted(null);
    setFormKey((k) => k + 1);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function processFile(file: File) {
    setError(null);
    setScanning(true);
    setCardFile(file);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const form = new FormData();
      form.append("businessProfileId", businessProfileId);
      form.append("file", file);
      const res = await fetch("/api/leads/scan-card", {
        method: "POST",
        body: form,
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? "Couldn't read the business card.");
      }
      setExtracted(body.extracted as ExtractedBusinessCard);
      setFormKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't scan card.");
      setExtracted(null);
    } finally {
      setScanning(false);
    }
  }

  async function handleConfirm(values: LeadFormValues) {
    if (!cardFile) return;
    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Sign-in required.");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You need to be signed in.");

      const upload = await uploadAndAnalyzeToVault({
        userId: user.id,
        profileId: businessProfileId,
        ownerUserId: ownerUserId ?? user.id,
        file: cardFile,
        analyze: false,
      });

      const payload = {
        businessProfileId,
        companyName: values.companyName.trim() || null,
        contactName: values.contactName.trim() || null,
        jobTitle: values.jobTitle.trim() || null,
        email: values.email.trim() || null,
        phone: values.phone.trim() || null,
        website: values.website.trim() || null,
        source: resolveSourceForApi(values) ?? "Business Card",
        sourceDetail: values.sourceDetail.trim() || null,
        notes: values.notes.trim() || null,
        documentId: upload.documentId,
      };

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();

      if (res.status === 409 && body.duplicates) {
        onDuplicate({ payload, duplicates: body.duplicates });
        handleClose();
        return;
      }

      if (!res.ok || !body.lead) {
        throw new Error(body.error ?? "Couldn't create lead.");
      }

      onCreated(body.lead);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save lead.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
            <h2 className="text-lg font-semibold">Scan business card</h2>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full p-2 text-ink-muted hover:bg-stone-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="overflow-y-auto px-6 py-4">
            {!extracted && !scanning ? (
              <div className="space-y-4">
                <p className="text-sm text-ink-muted">
                  Upload or photograph a business card. Gideon will extract the
                  contact details for you to review before saving.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setCameraOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
                  >
                    <Camera className="h-4 w-4" />
                    Take photo
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-medium hover:bg-stone-50"
                  >
                    <Upload className="h-4 w-4" />
                    Choose file
                  </button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void processFile(file);
                    e.target.value = "";
                  }}
                />
              </div>
            ) : null}

            {scanning ? (
              <p className="text-sm text-ink-muted">
                <Loader2 className="inline h-4 w-4 animate-spin" />
                Reading business card…
              </p>
            ) : null}

            {extracted ? (
              <div className="space-y-4">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Business card preview"
                    className="max-h-40 rounded-xl border border-stone-200 object-contain"
                  />
                ) : null}
                <p className="text-sm text-ink-muted">
                  Review the extracted details before creating the lead.
                </p>
                <LeadForm
                  key={formKey}
                  initialValues={extractedToFormValues(extracted)}
                  onSubmit={handleConfirm}
                  onCancel={handleClose}
                  submitLabel={saving ? "Saving…" : "Confirm and create lead"}
                />
              </div>
            ) : null}

            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          </div>
        </div>
      </div>

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => {
          setCameraOpen(false);
          void processFile(file);
        }}
      />
    </>
  );
}
