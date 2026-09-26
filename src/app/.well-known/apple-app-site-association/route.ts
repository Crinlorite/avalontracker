import { NextResponse } from "next/server";

// Universal Links (iOS): /m/<token> y /i/<código> abren la app si está
// instalada (spec §8). Equipo de distribución 2JE586S3VM.
export function GET() {
  return NextResponse.json(
    { applinks: { apps: [], details: [{ appID: "2JE586S3VM.com.crintechstudios.avalontracker", paths: ["/m/*", "/i/*"] }] } },
    { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } },
  );
}
