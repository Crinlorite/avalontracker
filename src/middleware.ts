import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { consumeToken, createLimiter } from "@/lib/rate-limit";
import { parsePublicPath } from "@/lib/public-routing";
import zoneNames from "@/data/avalon-zone-names.json";

const ZONE_SLUGS = new Set((zoneNames as string[]).map((n) => n.toLowerCase()));

const { auth } = NextAuth(authConfig);

const authCallbackLimiter = createLimiter({ windowMs: 60_000, max: 10 });

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const path = nextUrl.pathname;

  if (path.startsWith("/api/auth/callback/")) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const r = consumeToken(authCallbackLimiter, ip);
    if (!r.ok) {
      return new Response(JSON.stringify({ error: { code: "RATE_LIMITED", message: "Demasiadas peticiones" } }), {
        status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil(r.retryAfterMs / 1000)) },
      });
    }
  }

  const isAuth = path.startsWith("/clan") || path.startsWith("/profile") || path.startsWith("/dashboard");
  if (isAuth && !session?.user) return Response.redirect(new URL("/", nextUrl));

  // Páginas públicas: el inglés vive sin prefijo; /en/… → 308 a la ruta canónica.
  const pub = parsePublicPath(path);
  if (pub.explicitEn) return NextResponse.redirect(new URL(pub.rest + nextUrl.search, nextUrl), 308);

  // Fichas de zona: slug desconocido → 404 de verdad (el streaming de la
  // página ya no podría cambiar el código); mayúsculas → URL canónica.
  const zoneMatch = pub.lang ? /^\/zones\/([^/]+)\/?$/.exec(pub.rest) : null;
  if (pub.lang && zoneMatch) {
    const slug = decodeURIComponent(zoneMatch[1]);
    const lower = slug.toLowerCase();
    if (!ZONE_SLUGS.has(lower)) return NextResponse.rewrite(new URL("/_not-found-zone", nextUrl));
    if (slug !== lower) return NextResponse.redirect(new URL(`${pub.lang === "en" ? "" : `/${pub.lang}`}/zones/${lower}`, nextUrl), 308);
  }

  // Páginas públicas en otro idioma (/es/…, /de/…): el layout raíz lee esta
  // cabecera para servir <html lang="…"> desde el servidor.
  if (pub.lang && pub.lang !== "en") {
    const headers = new Headers(req.headers);
    headers.set("x-page-lang", pub.lang);
    return NextResponse.next({ request: { headers } });
  }
});

export const config = {
  matcher: [
    "/clan/:path*", "/profile/:path*", "/dashboard/:path*", "/api/auth/callback/:path*", "/zones/:path*",
    "/en", "/en/:path*", "/es", "/es/:path*", "/de", "/de/:path*", "/fr", "/fr/:path*", "/ru", "/ru/:path*", "/pl", "/pl/:path*",
    "/pt", "/pt/:path*", "/it", "/it/:path*", "/zh", "/zh/:path*", "/ja", "/ja/:path*", "/ko", "/ko/:path*",
  ],
};
