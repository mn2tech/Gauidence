import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Permanently deletes the calling user's account:
 * stored files, then the auth user (profiles, documents, extracted_data,
 * and alerts all cascade from auth.users).
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

  // Remove every stored file under the user's folder (paginate to be safe).
  const paths: string[] = [];
  let offset = 0;
  const pageSize = 100;
  for (;;) {
    const { data: objects, error: listError } = await admin.storage
      .from("documents")
      .list(user.id, { limit: pageSize, offset });
    if (listError) {
      return NextResponse.json(
        { error: "We couldn't remove your stored files. Please try again." },
        { status: 502 }
      );
    }
    if (!objects || objects.length === 0) break;
    paths.push(...objects.map((o) => `${user.id}/${o.name}`));
    if (objects.length < pageSize) break;
    offset += pageSize;
  }
  if (paths.length > 0) {
    const { error: removeError } = await admin.storage.from("documents").remove(paths);
    if (removeError) {
      return NextResponse.json(
        { error: "We couldn't remove your stored files. Please try again." },
        { status: 502 }
      );
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return NextResponse.json(
      { error: "Your files were removed but the account couldn't be deleted. Please try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
