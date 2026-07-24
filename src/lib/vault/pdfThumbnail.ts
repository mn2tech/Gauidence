let pdfModuleReady: Promise<void> | null = null;

async function ensurePdfJs(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!pdfModuleReady) {
    const { definePDFJSModule } = await import("unpdf");
    pdfModuleReady = definePDFJSModule(() => import("unpdf/pdfjs"));
  }
  await pdfModuleReady;
}

export async function renderPdfThumbnailDataUrl(
  data: ArrayBuffer | Uint8Array,
  width = 120
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    await ensurePdfJs();
    const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    const pdf = await getDocumentProxy(bytes);
    return await renderPageAsImage(pdf, 1, { width, toDataURL: true });
  } catch {
    return null;
  }
}

export async function renderPdfThumbnailFromFile(
  file: File,
  width = 120
): Promise<string | null> {
  return renderPdfThumbnailDataUrl(await file.arrayBuffer(), width);
}

export async function renderPdfThumbnailFromUrl(
  url: string,
  width = 120
): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return renderPdfThumbnailDataUrl(await res.arrayBuffer(), width);
  } catch {
    return null;
  }
}
