"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Loader2, Receipt, UploadCloud } from "lucide-react";
import CameraCaptureModal from "@/components/CameraCaptureModal";
import { createClient } from "@/lib/supabase/client";
import { employeeInvoiceDocumentsHref } from "@/lib/employee-hub/routing";
import {
  uploadAndAnalyzeToVault,
  VAULT_ACCEPTED_TYPES,
} from "@/lib/vault/clientUpload";

type Props = {
  profileId: string;
  ownerUserId: string;
  userId: string;
  showVaultLink?: boolean;
};

type InvoiceRow = {
  id: string;
  file_name: string;
  created_at: string;
  analysis_status: string;
  title: string | null;
  document_type: string | null;
};

function formatUploadedAt(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      time: d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }),
    };
  } catch {
    return { date: iso, time: "" };
  }
}

function rowLabel(row: InvoiceRow): string {
  return row.title?.trim() || row.file_name;
}

function rowStatus(row: InvoiceRow): string {
  if (row.analysis_status === "complete" && row.document_type === "invoice") {
    return "Invoice";
  }
  if (row.analysis_status === "complete" && row.document_type) {
    return row.document_type.replace(/_/g, " ");
  }
  if (row.analysis_status === "failed") return "Analysis failed";
  if (
    row.analysis_status === "uploaded" ||
    row.analysis_status === "analyzing" ||
    row.analysis_status === "classifying"
  ) {
    return "Processing…";
  }
  return "Uploaded";
}

export default function EmployeeInvoicePanel({
  profileId,
  ownerUserId,
  userId,
  showVaultLink = false,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    if (!supabase || !profileId) return;
    setLoading(true);
    try {
      const [docsRes, analysesRes] = await Promise.all([
        supabase
          .from("documents")
          .select("id, file_name, created_at, analysis_status")
          .eq("profile_id", profileId)
          .order("created_at", { ascending: false }),
        supabase
          .from("extracted_data")
          .select("document_id, title, document_type")
          .eq("profile_id", profileId),
      ]);

      const analyses = new Map(
        (analysesRes.data ?? []).map((row) => [
          String((row as { document_id: string }).document_id),
          row as { title: string | null; document_type: string | null },
        ])
      );

      setInvoices(
        (docsRes.data ?? []).map((doc) => {
          const analysis = analyses.get(String(doc.id));
          return {
            id: String(doc.id),
            file_name: String(doc.file_name),
            created_at: String(doc.created_at),
            analysis_status: String(doc.analysis_status ?? "uploaded"),
            title: analysis?.title ?? null,
            document_type: analysis?.document_type ?? null,
          };
        })
      );
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUpload(file: File) {
    setError(null);
    setStatus(null);
    if (!VAULT_ACCEPTED_TYPES[file.type]) {
      setError("Upload a PDF, JPG, PNG, or WebP invoice.");
      return;
    }

    setUploading(true);
    try {
      await uploadAndAnalyzeToVault({
        userId,
        profileId,
        ownerUserId,
        file,
        onStatus: setStatus,
      });
      setStatus("Invoice uploaded.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload invoice.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    await handleUpload(file);
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
            <Receipt className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight">Invoices</h2>
            <p className="text-xs text-ink-muted">Upload contractor invoices</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-50 disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UploadCloud className="h-3.5 w-3.5" />
            )}
            Upload invoice
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setCameraOpen(true);
            }}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-50 disabled:opacity-60"
          >
            <Camera className="h-3.5 w-3.5" />
            Take photo
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => {
          setCameraOpen(false);
          void handleUpload(file);
        }}
      />

      {status ? (
        <p className="mt-3 text-sm text-emerald-700" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading invoices…
        </p>
      ) : (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Uploaded invoices
          </p>
          <ul className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-100">
            {invoices.length === 0 ? (
              <li className="px-3 py-4 text-sm text-ink-muted">
                No invoices uploaded yet.
              </li>
            ) : (
              invoices.map((row) => {
                const uploaded = formatUploadedAt(row.created_at);
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-start justify-between gap-3 px-3 py-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {rowLabel(row)}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        <span>{uploaded.date}</span>
                        {uploaded.time ? (
                          <>
                            <span aria-hidden> · </span>
                            <span>{uploaded.time}</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium capitalize">
                      {rowStatus(row)}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}

      {showVaultLink ? (
        <Link
          href={employeeInvoiceDocumentsHref(profileId)}
          className="mt-3 inline-flex text-sm font-medium text-brand hover:text-brand-dark"
        >
          View all in vault
        </Link>
      ) : null}
    </div>
  );
}
