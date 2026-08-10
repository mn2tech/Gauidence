"use client";

import { useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import {
  LEAD_IMPORT_FIELD_LABELS,
  LEAD_IMPORT_FIELDS,
  type LeadImportField,
} from "@/lib/leads/importTypes";
import LeadDuplicateDialog from "@/components/leads/LeadDuplicateDialog";
import type { BusinessLead } from "@/lib/leads/types";

type PreviewResponse = {
  headers: string[];
  previewRows: string[][];
  totalRows: number;
  importCap: number;
  truncated: boolean;
  suggestedMapping: Partial<Record<LeadImportField, number>>;
  rows: string[][];
};

type Props = {
  businessProfileId: string;
  open: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
};

export default function LeadImportModal({
  businessProfileId,
  open,
  onClose,
  onImported,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "map" | "importing">("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<LeadImportField, number>>>({});
  const [importSource, setImportSource] = useState("Excel Import");
  const [duplicateRows, setDuplicateRows] = useState<
    Array<{ lead: BusinessLead; reasons: string[] }> | null
  >(null);

  const [importMessage, setImportMessage] = useState<string | null>(null);

  function reset() {
    setStep("upload");
    setBusy(false);
    setError(null);
    setPreview(null);
    setMapping({});
    setImportSource("Excel Import");
    setDuplicateRows(null);
    setImportMessage(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("businessProfileId", businessProfileId);
      form.append("file", file);
      const res = await fetch("/api/leads/import/preview", {
        method: "POST",
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "Couldn't read file."
        );
      }
      setPreview(body as PreviewResponse);
      setMapping(body.suggestedMapping ?? {});
      setStep("map");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read file.");
    } finally {
      setBusy(false);
    }
  }

  async function runImport(options?: { forceCreate?: boolean; skipDuplicates?: boolean }) {
    if (!preview) return;
    setStep("importing");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessProfileId,
          mapping,
          rows: preview.rows,
          source: importSource.trim() || "Excel Import",
          forceCreate: options?.forceCreate ?? false,
          skipDuplicates: options?.skipDuplicates ?? false,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "Import failed."
        );
      }

      if (body.status === "duplicates_found") {
        const dupes = (body.duplicateRows ?? []).map(
          (d: { lead: BusinessLead; reasons: string[] }) => ({
            lead: d.lead,
            reasons: d.reasons,
          })
        );
        setDuplicateRows(dupes);
        setStep("map");
        setBusy(false);
        return;
      }

      const createdCount = body.createdCount ?? 0;
      const skippedCount = body.skippedCount ?? 0;
      onImported(createdCount);
      if (createdCount > 0) {
        setImportMessage(
          `Imported ${createdCount} lead${createdCount === 1 ? "" : "s"}${
            skippedCount > 0 ? ` (${skippedCount} skipped)` : ""
          }.`
        );
        setTimeout(() => handleClose(), 1200);
      } else {
        setError("No leads were imported. Check your column mapping.");
        setStep("map");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setStep("map");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
            <h2 className="text-lg font-semibold">Import business list</h2>
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
            {step === "upload" ? (
              <div className="space-y-4">
                <p className="text-sm text-ink-muted">
                  Upload a CSV or Excel file with business contacts. You can map
                  columns and review before importing.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Choose file
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                    e.target.value = "";
                  }}
                />
              </div>
            ) : null}

            {step === "map" && preview ? (
              <div className="space-y-4">
                <p className="text-sm text-ink-muted">
                  {preview.totalRows} row{preview.totalRows === 1 ? "" : "s"} found
                  {preview.truncated
                    ? ` (importing up to ${preview.importCap})`
                    : ""}
                </p>
                <p className="text-sm text-ink-muted">
                  Map at least <strong className="font-medium">Company</strong> or{" "}
                  <strong className="font-medium">Contact</strong> for each row.
                  Use First name + Last name if your sheet splits names across columns.
                </p>

                <div>
                  <label className="text-sm font-medium">Source for imported leads</label>
                  <input
                    value={importSource}
                    onChange={(e) => setImportSource(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border-subtle px-3 py-2.5 text-sm"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {LEAD_IMPORT_FIELDS.map((field) => (
                    <div key={field}>
                      <label className="text-sm font-medium">
                        {LEAD_IMPORT_FIELD_LABELS[field]}
                      </label>
                      <select
                        value={mapping[field] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setMapping((prev) => ({
                            ...prev,
                            [field]: v === "" ? undefined : Number(v),
                          }));
                        }}
                        className="mt-1 w-full rounded-xl border border-border-subtle px-3 py-2.5 text-sm"
                      >
                        <option value="">Skip</option>
                        {preview.headers.map((h, i) => (
                          <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="overflow-x-auto rounded-xl border border-stone-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 text-ink-muted">
                      <tr>
                        {preview.headers.map((h, i) => (
                          <th key={i} className="px-3 py-2 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.previewRows.map((row, ri) => (
                        <tr key={ri} className="border-t border-stone-100">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-3 py-2">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runImport()}
                    className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                  >
                    Import leads
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runImport({ skipDuplicates: true })}
                    className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
                  >
                    Skip duplicates
                  </button>
                </div>
              </div>
            ) : null}

            {step === "importing" ? (
              <p className="text-sm text-ink-muted">
                <Loader2 className="inline h-4 w-4 animate-spin" />
                Importing leads…
              </p>
            ) : null}

            {importMessage ? (
              <p className="mt-3 text-sm font-medium text-emerald-700">{importMessage}</p>
            ) : null}
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          </div>
        </div>
      </div>

      {duplicateRows && duplicateRows.length > 0 ? (
        <LeadDuplicateDialog
          duplicates={duplicateRows}
          busy={busy}
          onUseExisting={() => {
            setDuplicateRows(null);
            void runImport({ skipDuplicates: true });
          }}
          onCreateAnyway={() => {
            setDuplicateRows(null);
            void runImport({ forceCreate: true });
          }}
          onCancel={() => setDuplicateRows(null)}
        />
      ) : null}
    </>
  );
}
