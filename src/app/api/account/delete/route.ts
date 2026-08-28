import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function removeInBatches(
  admin: SupabaseClient,
  bucket: string,
  paths: string[]
) {
  const chunkSize = 100;
  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    const { error } = await admin.storage.from(bucket).remove(chunk);
    if (error) {
      console.error(`[account/delete] storage remove failed (${bucket}):`, error.message);
    }
  }
}

/** Best-effort: remove vault files and avatars for this user. Never throws. */
async function cleanupUserStorage(admin: SupabaseClient, userId: string) {
  try {
    const { data: docs } = await admin
      .from("documents")
      .select("file_path")
      .eq("user_id", userId);

    const docPaths = (docs ?? [])
      .map((d) => (typeof d.file_path === "string" ? d.file_path.trim() : ""))
      .filter(Boolean);
    if (docPaths.length > 0) {
      await removeInBatches(admin, "documents", docPaths);
    }
  } catch (err) {
    console.error("[account/delete] documents cleanup failed:", err);
  }

  try {
    const avatarPaths: string[] = [];
    let offset = 0;
    const pageSize = 100;
    for (;;) {
      const { data: folders, error: listError } = await admin.storage
        .from("avatars")
        .list(userId, { limit: pageSize, offset });
      if (listError || !folders || folders.length === 0) break;

      for (const folder of folders) {
        if (!folder.name) continue;
        const prefix = `${userId}/${folder.name}`;
        const { data: files } = await admin.storage
          .from("avatars")
          .list(prefix, { limit: 50 });
        if (files && files.length > 0) {
          for (const file of files) {
            if (file.name) avatarPaths.push(`${prefix}/${file.name}`);
          }
        } else {
          // Loose object at the user folder level (rare)
          avatarPaths.push(prefix);
        }
      }

      if (folders.length < pageSize) break;
      offset += pageSize;
    }
    if (avatarPaths.length > 0) {
      await removeInBatches(admin, "avatars", avatarPaths);
    }
  } catch (err) {
    console.error("[account/delete] avatars cleanup failed:", err);
  }
}

/**
 * Permanently deletes the calling user's account:
 * best-effort stored files, then the auth user (profiles, documents,
 * extracted_data, alerts, chats, vault chunks cascade from auth.users).
 */
export async function POST() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Sign-in isn't configured on this deployment." },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "Account deletion isn't set up yet on this deployment. Contact the site owner to have your account removed.",
      },
      { status: 503 }
    );
  }

  await cleanupUserStorage(admin, user.id);

  // Clear Space chat authorship before auth delete. sender_user_id is SET NULL on
  // user delete, but a legacy CHECK required it for sender_type=user and blocked
  // cascade. Prefer nulling (keeps history); fall back to deleting those rows.
  try {
    const { error: nullErr } = await admin
      .from("space_conversation_messages")
      .update({ sender_user_id: null })
      .eq("sender_user_id", user.id);
    if (nullErr) {
      console.warn(
        "[account/delete] could not null space message authors:",
        nullErr.message
      );
      const { error: msgDelErr } = await admin
        .from("space_conversation_messages")
        .delete()
        .eq("sender_user_id", user.id);
      if (msgDelErr) {
        console.error(
          "[account/delete] space message cleanup failed:",
          msgDelErr.message
        );
      }
    }
  } catch (err) {
    console.error("[account/delete] space message cleanup failed:", err);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("[account/delete] deleteUser failed:", deleteError.message);
    return NextResponse.json(
      {
        error:
          "We couldn't delete your account. Please try again — if it keeps happening, contact support.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
