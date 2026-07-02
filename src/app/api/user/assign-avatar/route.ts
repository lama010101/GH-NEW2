import { NextResponse, type NextRequest } from "next/server";
import { createAuthenticatedServerClient, createSupabaseServerClient } from "@/core/supabaseServer";

export const dynamic = "force-dynamic";

async function getAuthenticatedUser(): Promise<{ user: { id: string } } | null> {
  const supabase = createAuthenticatedServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  return { user };
}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_request: NextRequest) {
  const auth = await getAuthenticatedUser();

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user } = auth;

  const serviceRoleClient = createSupabaseServerClient();

  try {
    // Check existing profile
    const { data: profile, error: profileError } = await serviceRoleClient
      .from("profiles")
      .select("avatar_url, display_name")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("[assign-avatar] Failed to fetch profile:", profileError);
      return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
    }

    if (profile?.avatar_url) {
      const { data: avatar } = await serviceRoleClient
        .from("avatars")
        .select("*")
        .eq("image_url", profile.avatar_url)
        .single();

      if (avatar) {
        return NextResponse.json({
          assigned: false,
          profile: { display_name: profile.display_name },
          avatar: {
            id: avatar.id,
            first_name: avatar.first_name,
            last_name: avatar.last_name,
            description: avatar.description,
            gender: avatar.gender,
            birth_city: avatar.birth_city,
            birth_country: avatar.birth_country,
            death_city: avatar.death_city,
            death_country: avatar.death_country,
            birth_day: avatar.birth_day,
            death_day: avatar.death_day,
            image_url: avatar.image_url,
          },
        });
      }
      // avatar_url set but no matching avatars row — fall through to reassign
    }

    // avatar_url is null or empty - assign a new random avatar
    const { data: avatarRows, error: randomError } = await serviceRoleClient
      .from("avatars")
      .select("*")
      .eq("ready", true);

    if (randomError || !avatarRows || avatarRows.length === 0) {
      console.error("[assign-avatar] Failed to fetch random avatar:", randomError);
      return NextResponse.json({ error: "No avatars available" }, { status: 500 });
    }

    const randomAvatar = avatarRows[Math.floor(Math.random() * avatarRows.length)];

    // Build display_name: first_name + last_name (if exists) + random 4-digit suffix
    const baseName = randomAvatar.first_name + (randomAvatar.last_name ? ` ${randomAvatar.last_name}` : "");
    const randomSuffix = Math.floor(Math.random() * 9000 + 1000).toString();
    const displayName = `${baseName}#${randomSuffix}`;

    // Update profile with avatar_url and display_name
    const { error: updateError } = await serviceRoleClient
      .from("profiles")
      .update({
        avatar_url: randomAvatar.firebase_url || randomAvatar.image_url,
        display_name: displayName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("[assign-avatar] Failed to update profile:", updateError);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    return NextResponse.json({
      assigned: true,
      profile: { display_name: displayName },
      avatar: {
        id: randomAvatar.id,
        first_name: randomAvatar.first_name,
        last_name: randomAvatar.last_name,
        description: randomAvatar.description,
        gender: randomAvatar.gender,
        birth_city: randomAvatar.birth_city,
        birth_country: randomAvatar.birth_country,
        death_city: randomAvatar.death_city,
        death_country: randomAvatar.death_country,
        birth_day: randomAvatar.birth_day,
        death_day: randomAvatar.death_day,
        image_url: randomAvatar.firebase_url || randomAvatar.image_url,
      },
    });
  } catch (error) {
    console.error("[assign-avatar] Unexpected error:", error);
    return NextResponse.json({ error: "Failed to assign avatar" }, { status: 500 });
  }
}
