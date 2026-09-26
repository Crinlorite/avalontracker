import { NextResponse } from "next/server";

// App Links (Android). Las huellas SHA-256 del certificado de firma de Play
// llegan por ANDROID_SIGNING_SHA256 (separadas por comas).
export function GET() {
  const fingerprints = (process.env.ANDROID_SIGNING_SHA256 ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const body = fingerprints.length === 0 ? [] : [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: "com.crintechstudios.avalontracker", sha256_cert_fingerprints: fingerprints },
  }];
  return NextResponse.json(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } });
}
