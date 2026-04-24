import { NextResponse } from "next/server";

// CORS para endpoints `/api/ingest/*` consumidos por:
// - Extension Chrome (origin `chrome-extension://<id>`)
// - Loot Vigil Electron (no navegador, no necesita CORS)
//
// Dev: acepta cualquier chrome-extension://*. Prod: debería restringirse al
// ID fijo de Chrome Web Store — por ahora permitimos todo chrome-extension://*
// porque la extensión aún no está publicada con ID estable.
export function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && (origin.startsWith("chrome-extension://") || origin === "https://avalon.crintech.pro")
      ? origin
      : "https://avalon.crintech.pro";

  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Target-Clan-Id, X-Client-Version",
    "Access-Control-Max-Age": "3600",
    Vary: "Origin",
  };
}

// Helper para OPTIONS preflight.
export function preflight(request: Request): Response {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

// Envuelve una Response con headers CORS.
export function withCors(request: Request, response: Response): Response {
  const headers = corsHeaders(request.headers.get("origin"));
  for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
  return response;
}
