"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  FileImage,
  FileText,
  Loader2,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type DocumentRow = {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
};
const MAX_SIZE_BYTES = 15 * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function DocumentManager({ userId }: { userId: string }) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("documents")
      .select("id, file_name, file_path, mime_type, size_bytes, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      setError("We couldn't load your documents. Refresh the page to try again.");
    } else {
      setDocuments(data ?? []);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !supabase) return;
    const file = files[0];
    setError(null);

    if (!ACCEPTED_TYPES[file.type]) {
      setError("That file type isn't supported. Upload a PDF, JPG, PNG, or WebP file.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("That file is larger than 15 MB. Please upload a smaller file.");
      return;
    }

    setUploading(true);
    const safeName = file.name.replace(/[^\w.\- ]/g, "_");
    const path = `${userId}/${crypto.randomUUID()}-${safeName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, file, { contentType: file.type });
      if (uploadError) {
        setError("The upload didn't finish. Check your connection and try again.");
        setUploading(false);
        return;
      }

      const { error: insertError } = await supabase.from("documents").insert({
        user_id: userId,
        file_name: file.name,
        file_path: path,
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (insertError) {
        // Don't leave an orphaned file behind if the record failed.
        await supabase.storage.from("documents").remove([path]);
        setError("We couldn't save the document record. Please try again.");
        setUploading(false);
        return;
      }

      await loadDocuments();
    } catch {
      setError("Something went wrong during upload. Check your connection and try again.");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDownload(doc: DocumentRow) {
    if (!supabase) return;
    setError(null);
    setDownloadingId(doc.id);
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_path, 60, { download: doc.file_name });
      if (error || !data?.signedUrl) {
        setError("We couldn't prepare the download. Please try again.");
      } else {
        const a = document.createElement("a");
        a.href = data.signedUrl;
        a.download = doc.file_name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch {
      setError("We couldn't prepare the download. Check your connection and try again.");
    }
    setDownloadingId(null);
  }

  async function handleDelete(doc: DocumentRow) {
    if (!supabase) return;
    setError(null);
    setDeletingId(doc.id);
    try {
      // Remove the stored file first so nothing lingers, then the record.
      const { error: storageError } = await supabase.storage
        .from("documents")
        .remove([doc.file_path]);
      if (storageError) {
        setError("We couldn't delete the stored file. Please try again.");
        setDeletingId(null);
        return;
      }

      const { error: dbError } = await supabase
        .from("documents")
        .delete()
        .eq("id", doc.id);
      if (dbError) {
        setError(
          "The file was removed but its record couldn't be deleted. Try deleting it again."
        );
      } else {
        setDocuments((docs) => docs.filter((d) => d.id !== doc.id));
      }
    } catch {
      setError("Something went wrong while deleting. Please try again.");
    }
    setDeletingId(null);
    setConfirmDeleteId(null);
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Your documents</h2>
        <span className="text-xs text-ink-muted">
          {documents.length} {documents.length === 1 ? "document" : "documents"}
        </span>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
          dragActive
            ? "border-brand bg-brand-light"
            : "border-stone-300 bg-stone-50/60"
        }`}
      >
        <UploadCloud className="h-8 w-8 text-brand" />
        <p className="text-sm text-ink-muted">
          Drag and drop a file here, or
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
          {uploading ? "Uploading…" : "Choose a file"}
        </button>
        <p className="text-xs text-ink-muted">PDF, JPG, PNG, or WebP — up to 15 MB</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {/* Document list */}
      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 py-6 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your documents…
        </div>
      ) : documents.length === 0 ? (
        <p className="mt-6 py-4 text-center text-sm text-ink-muted">
          Nothing here yet. Your uploads are private to you.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-stone-100">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand">
                {doc.mime_type === "application/pdf" ? (
                  <FileText className="h-4 w-4" />
                ) : (
                  <FileImage className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{doc.file_name}</p>
                <p className="text-xs text-ink-muted">
                  {ACCEPTED_TYPES[doc.mime_type] ?? doc.mime_type} ·{" "}
                  {formatSize(doc.size_bytes)} · {formatDate(doc.created_at)}
                </p>
              </div>
              {confirmDeleteId === doc.id ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDelete(doc)}
                    disabled={deletingId === doc.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50"
                  >
                    {deletingId === doc.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Delete permanently
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    aria-label="Cancel delete"
                    className="rounded-full border border-stone-300 p-1.5 text-ink-muted transition hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingId === doc.id}
                    aria-label={`Download ${doc.file_name}`}
                    className="rounded-full p-2 text-ink-muted transition hover:bg-stone-100 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
                  >
                    {downloadingId === doc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(doc.id)}
                    aria-label={`Delete ${doc.file_name}`}
                    className="rounded-full p-2 text-ink-muted transition hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
