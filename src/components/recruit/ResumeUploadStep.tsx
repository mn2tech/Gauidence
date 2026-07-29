"use client";

import { useCallback, useState } from "react";
import { CheckCircle, Loader2, UploadCloud, XCircle } from "lucide-react";
import type { CandidateWithDetails } from "@/lib/recruit/types";

type Props = {
  jobId: string;
  candidates: CandidateWithDetails[];
  onUploaded: () => void;
  onNext: () => void;
};

type UploadResult = {
  fileName: string;
  ok: boolean;
  error?: string;
  duplicate?: boolean;
};

export default function ResumeUploadStep({
  jobId,
  candidates,
  onUploaded,
  onNext,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setUploading(true);
      setError(null);
      setResults([]);

      const formData = new FormData();
      for (const file of list) {
        formData.append("files", file);
      }

      try {
        const res = await fetch(`/api/recruit/jobs/${jobId}/candidates`, {
          method: "POST",
          body: formData,
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          results?: UploadResult[];
        };
        if (body.results) setResults(body.results);
        if (!res.ok && !body.results) {
          setError(body.error ?? "Upload failed.");
        } else {
          onUploaded();
        }
      } catch {
        setError("Upload failed. Check your connection.");
      } finally {
        setUploading(false);
      }
    },
    [jobId, onUploaded]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    void uploadFiles(e.dataTransfer.files);
  }

  const statusLabel: Record<string, string> = {
    pending: "Pending",
    extracting: "Extracting…",
    extracted: "Extracted",
    analyzing: "Analyzing…",
    analyzed: "Ready",
    failed: "Failed",
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Upload Resumes</h2>
      <p className="text-sm text-ink-muted">
        Drag and drop multiple PDF, DOCX, or TXT files. Duplicates are detected
        by file hash and candidate email.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 transition ${
          dragging
            ? "border-brand bg-brand-light/30"
            : "border-stone-300 bg-stone-50"
        }`}
      >
        <UploadCloud className="h-10 w-10 text-stone-400" />
        <p className="mt-3 text-sm font-medium">
          Drop resumes here or click to browse
        </p>
        <input
          type="file"
          multiple
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="mt-3 text-sm"
          disabled={uploading}
          onChange={(e) => {
            if (e.target.files) void uploadFiles(e.target.files);
          }}
        />
        {uploading ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
          </p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {results.length > 0 ? (
        <ul className="space-y-2">
          {results.map((r) => (
            <li
              key={r.fileName}
              className="flex items-center gap-2 text-sm"
            >
              {r.ok ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span>{r.fileName}</span>
              {r.error ? (
                <span className="text-red-600">
                  {r.duplicate ? "(duplicate)" : r.error}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {candidates.length > 0 ? (
        <div className="rounded-xl border border-stone-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-left">
                <th className="px-4 py-2">File / Candidate</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} className="border-b border-stone-100">
                  <td className="px-4 py-2">
                    {c.display_name ??
                      c.files[0]?.file_name ??
                      "Unknown"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        c.processing_status === "failed"
                          ? "text-red-600"
                          : c.processing_status === "analyzed"
                            ? "text-green-700"
                            : "text-ink-muted"
                      }
                    >
                      {statusLabel[c.processing_status] ?? c.processing_status}
                    </span>
                    {c.processing_error ? (
                      <span className="ml-2 text-xs text-red-500">
                        {c.processing_error}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onNext}
        disabled={candidates.length === 0}
        className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
      >
        Continue to criteria
      </button>
    </div>
  );
}
