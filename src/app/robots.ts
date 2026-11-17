import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Every crawler may read every page, and the sitemap lists them. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
