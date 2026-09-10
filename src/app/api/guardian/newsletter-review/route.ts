import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNewsletterReviewForDocument } from "@/lib/guardian-items/newsletterReview";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const documentId = url.searchParams.get("documentId")?.trim();
  if (!documentId) {
    return NextResponse.json(
      { error: "documentId is required." },
      { status: 400 }
    );
  }

  const review = await getNewsletterReviewForDocument(supabase, documentId);
  if (!review) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  return NextResponse.json(review);
}
