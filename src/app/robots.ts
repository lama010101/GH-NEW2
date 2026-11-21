import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/core/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Only the public SEO surface is crawlable: landing, /events(+/*),
        // /help, /privacy, /terms, /grow. Everything auth-walled or
        // machine-facing (admin, api, compete, play, auth, app routes) is
        // disallowed so crawlers never hit the /login redirect wall.
        disallow: [
          "/api/",
          "/admin/",
          "/account",
          "/auth/",
          "/compete/",
          "/daily",
          "/home",
          "/journey",
          "/leaderboard",
          "/login",
          "/play/",
          "/practice/",
          "/profile",
          "/progress",
          "/prototype/",
          "/waitlist",
        ],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
