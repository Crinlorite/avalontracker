// IP del cliente tras los proxies. En producción la cadena es Cloudflare →
// Traefik (Coolify) → Next, y Traefik no confía en cabeceras reenviadas: pisa
// X-Real-IP y X-Forwarded-For con quien conecta (un borde de Cloudflare), pero
// deja pasar CF-Connecting-IP tal cual llega. Como el origen también responde
// sin pasar por Cloudflare, CF-Connecting-IP solo vale cuando quien conecta es
// un borde de Cloudflare; si no, cualquiera la inventaría para esquivar los
// límites por IP. Sin dependencias (también corre en el middleware). Acepta una
// Request o las cabeceras de next/headers (`clientIp({ headers: await headers() })`).
export function clientIp(req: { headers: Pick<Headers, "get"> }): string {
  const peer = req.headers.get("x-real-ip")?.trim()
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "";
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf && peer && isCloudflare(peer)) return cf;
  return peer || "unknown";
}

// https://www.cloudflare.com/ips-v4 y /ips-v6 (consultadas el 31-oct-2026).
const CLOUDFLARE_V4 = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
];
const CLOUDFLARE_V6 = [
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
  "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
];

function isCloudflare(ip: string): boolean {
  const v4 = parseV4(ip.replace(/^::ffff:/i, ""));
  if (v4 !== null) return CLOUDFLARE_V4.some((c) => inRange(v4, c, 32, parseV4));
  const v6 = parseV6(ip);
  if (v6 !== null) return CLOUDFLARE_V6.some((c) => inRange(v6, c, 128, parseV6));
  return false;
}

function inRange(ip: bigint, cidr: string, bits: number, parse: (s: string) => bigint | null): boolean {
  const [base, len] = cidr.split("/");
  const net = parse(base)!;
  const shift = BigInt(bits - Number(len));
  return ip >> shift === net >> shift;
}

function parseV4(s: string): bigint | null {
  const parts = s.split(".");
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return null;
  return parts.reduce((acc, p) => (acc << BigInt(8)) | BigInt(p), BigInt(0));
}

function parseV6(s: string): bigint | null {
  if (!/^[0-9a-f:]+$/i.test(s) || (s.match(/::/g) ?? []).length > 1) return null;
  const [head, tail] = s.includes("::") ? s.split("::") : [s, null];
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = tail === null ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.reduce((acc, g) => (acc << BigInt(16)) | BigInt(parseInt(g, 16)), BigInt(0));
}
