export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/dashboard/:path*", "/clan/:path*", "/admin/:path*", "/profile/:path*"],
};
