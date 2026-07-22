import { NextResponse } from "next/server";
import { vapidPublicKey } from "@/lib/push/send";

export const runtime = "nodejs";

export async function GET() {
  const key = vapidPublicKey();
  if (!key) {
    return NextResponse.json(
      { error: "Push notifications aren't configured." },
      { status: 503 }
    );
  }
  return NextResponse.json({ publicKey: key });
}
