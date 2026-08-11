import { NextResponse, type NextRequest } from "next/server";
import { createAuthenticatedServerClient, createSupabaseServerClient } from "@/core/supabaseServer";
import { canOverwriteDisplayName } from "@/lib/autoDisplayName";

export const dynamic = "force-dynamic";

async function getAuthenticatedUser(): Promise<{ user: { id: string } } | null> {
  const supabase = createAuthenticatedServerClient();

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

  let body: { avatar_url?: unknown; regenerate_display_name?: unknown };
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

  const regenerateDisplayName = body.regenerate_display_name === true;

  const serviceRoleClient = createSupabaseServerClient();

  try {
    // Look up the avatar row matching the chosen URL (by firebase_url OR image_url)
    // so callers can refresh all displayed info (name, born, died, description).
    const { data: avatarRow } = await serviceRoleClient
      .from("avatars")
      .select("id, first_name, last_name, description, birth_day, birth_city, birth_country, death_day, death_city, death_country, image_url, firebase_url")
      .or(`firebase_url.eq.${avatarUrl},image_url.eq.${avatarUrl}`)
      .limit(1)
      .maybeSingle();

    // Fetch the existing display_name so we only overwrite a custom name when
    // it is still null/empty or matches the auto-generated naming pattern.
    const { data: existingProfile } = await serviceRoleClient
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    const currentDisplayName = existingProfile?.display_name ?? null;

    const profileUpdate: { avatar_url: string; updated_at: string; display_name?: string } = {
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    };

    let regeneratedDisplayName: string | null = null;
    if (regenerateDisplayName && avatarRow && canOverwriteDisplayName(currentDisplayName)) {
      const baseName = avatarRow.first_name + (avatarRow.last_name ? ` ${avatarRow.last_name}` : "");
      const randomSuffix = Math.floor(Math.random() * 9000 + 1000).toString();
      regeneratedDisplayName = `${baseName}#${randomSuffix}`;
      profileUpdate.display_name = regeneratedDisplayName;
    }

    const { error: updateError } = await serviceRoleClient
      .from("profiles")
      .update(profileUpdate)
      .eq("id", user.id);

    if (updateError) {
      console.error("[update-avatar] Failed to update profile:", updateError);
      return NextResponse.json({ error: "Failed to update avatar" }, { status: 500 });
    }

    // Resolve the current display_name to return (regenerated, or fetched from profile).
    let displayNameToReturn = regeneratedDisplayName;
    if (!displayNameToReturn) {
      const { data: profileRow } = await serviceRoleClient
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();
      displayNameToReturn = profileRow?.display_name ?? null;
    }

    return NextResponse.json({
      success: true,
      display_name: displayNameToReturn,
      avatar: avatarRow
        ? {
            id: avatarRow.id,
            first_name: avatarRow.first_name,
            last_name: avatarRow.last_name,
            description: avatarRow.description,
            birth_day: avatarRow.birth_day,
            birth_city: avatarRow.birth_city,
            birth_country: avatarRow.birth_country,
            death_day: avatarRow.death_day,
            death_city: avatarRow.death_city,
            death_country: avatarRow.death_country,
            image_url: avatarRow.firebase_url || avatarRow.image_url,
          }
        : null,
    });
  } catch (error) {
    console.error("[update-avatar] Unexpected error:", error);
    return NextResponse.json({ error: "Failed to update avatar" }, { status: 500 });
  }
}
