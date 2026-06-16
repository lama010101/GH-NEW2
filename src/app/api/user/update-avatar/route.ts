import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/core/supabaseServer";

export const dynamic = "force-dynamic";

async function getAuthenticatedUser(): Promise<{ user: { id: string } } | null> {
  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `set` method was called from a Server Component.
            // This can be ignored if middleware refreshes sessions.
          }
        },
      },
    }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  return { user };
}

export async function PATCH(_request: NextRequest) {
  const auth = await getAuthenticatedUser();

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user } = auth;

  let body: { avatar_url?: unknown };
  try {
    body = await _request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const avatarUrlRaw = body.avatar_url;
  if (typeof avatarUrlRaw !== "string") {
    return NextResponse.json({ error: "avatar_url is required" }, { status: 400 });
  }

  const avatarUrl = avatarUrlRaw.trim();
  if (avatarUrl.length === 0) {
    return NextResponse.json({ error: "avatar_url cannot be empty" }, { status: 400 });
  }
  if (avatarUrl.length > 500) {
    return NextResponse.json({ error: "avatar_url must be at most 500 characters" }, { status: 400 });
  }

  const serviceRoleClient = createSupabaseServerClient();

  try {
    const { error: updateError } = await serviceRoleClient
      .from("profiles")
      .update({
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("[update-avatar] Failed to update profile:", updateError);
      return NextResponse.json({ error: "Failed to update avatar" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[update-avatar] Unexpected error:", error);
    return NextResponse.json({ error: "Failed to update avatar" }, { status: 500 });
  }
}
