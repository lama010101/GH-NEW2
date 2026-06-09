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

    // If avatar_url is already set, return existing data
    if (profile?.avatar_url) {
      const { data: avatar, error: avatarError } = await serviceRoleClient
        .from("avatars")
        .select("*")
        .eq("image_url", profile.avatar_url)
        .single();

      if (avatarError) {
        console.error("[assign-avatar] Failed to fetch avatar by image_url:", avatarError);
        return NextResponse.json({ error: "Failed to fetch avatar" }, { status: 500 });
      }

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

    // avatar_url is null or empty - assign a new random avatar
    const { data: randomAvatar, error: randomError } = await serviceRoleClient
      .from("avatars")
      .select("*")
      .eq("ready", true)
      .order("random()")
      .limit(1)
      .single();

    if (randomError || !randomAvatar) {
      console.error("[assign-avatar] Failed to fetch random avatar:", randomError);
      return NextResponse.json({ error: "No avatars available" }, { status: 500 });
    }

    // Build display_name: first_name + last_name (if exists) + random 4-digit suffix
    const baseName = randomAvatar.first_name + (randomAvatar.last_name ? ` ${randomAvatar.last_name}` : "");
    const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
    const displayName = `${baseName} ${randomSuffix}`;

    // Update profile with avatar_url and display_name
    const { error: updateError } = await serviceRoleClient
      .from("profiles")
      .update({
        avatar_url: randomAvatar.image_url,
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
        image_url: randomAvatar.image_url,
      },
    });
  } catch (error) {
    console.error("[assign-avatar] Unexpected error:", error);
    return NextResponse.json({ error: "Failed to assign avatar" }, { status: 500 });
  }
}
