import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Picks the visitor's language and redirects URLs without a language prefix.
export default createMiddleware(routing);

export const config = {
  // Everything except Next internals and files (anything with a dot, such as
  // /manifest.webmanifest, /robots.txt, /sitemap.xml and the icons).
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
