import type { MetadataRoute } from "next";
import { SITE_URL } from "@/server/seoConfig";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/account", "/compete/", "/practice/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
