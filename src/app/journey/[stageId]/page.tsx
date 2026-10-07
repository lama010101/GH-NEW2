"use client";

// Redirect only (HJ-BUILD-LISTREDESIGN-032): the intermediate stage screen was
// removed — /journey is the single stage surface, Play starts directly into
// /practice/{gameId}, and /practice/[gameId] is the single owner of journey
// completion+result. Deep links (login?next=/journey/{id}, bookmarks) land
// here and forward to the list.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function JourneyStageRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/journey");
  }, [router]);
  return null;
}
