import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { consumeToken, createLimiter } from "@/lib/rate-limit";

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
});

export const config = {
  matcher: ["/clan/:path*", "/profile/:path*", "/dashboard/:path*", "/api/auth/callback/:path*"],
};
