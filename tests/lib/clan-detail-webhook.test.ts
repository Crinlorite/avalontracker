// GET /api/clans/{clanId}: la URL del webhook de Discord es un secreto (con
// ella cualquiera publica mensajes como el clan y hasta puede borrar el
// webhook). Solo ADMIN la ve, que es quien la edita en Ajustes; al resto de
// miembros (VIEWER, CONTRIBUTOR, EDITOR, también los que entran a un mapa
// personal por enlace) no se les devuelve.
import { describe, it, expect, vi } from "vitest";

const role = vi.hoisted(() => ({ current: "VIEWER" }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }));
vi.mock("@/lib/permissions", async (orig) => {
  const m = await orig<typeof import("@/lib/permissions")>();
  return { ...m, requireRole: vi.fn(async () => ({ role: role.current, stale: false })) };
});
const WEBHOOK = "https://discord.com/api/webhooks/1234/s3cr3t-token";
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clan: {
      findUnique: vi.fn(async () => ({
        id: "c1", name: "Clan", kind: "DISCORD", discordGuildId: "123456789012345678", discordGuildName: "G", discordGuildIcon: null,
        discordWebhookUrl: WEBHOOK, anchorZoneId: null, anchorZone: null, anchorSecurityLevel: null, anchorNotes: null, anchorNotesAt: null,
        botInstalled: true, tier: null, createdById: "u0", createdAt: new Date(0), updatedAt: new Date(0), _count: { members: 2, routes: 0 },
      })),
    },
  },
}));

async function getClan() {
  const { GET } = await import("@/app/api/clans/[clanId]/route");
  return GET(new Request("http://t/api/clans/c1"), { params: Promise.resolve({ clanId: "c1" }) });
}

describe("GET /api/clans/{clanId}", () => {
  it("no devuelve la URL del webhook a VIEWER, CONTRIBUTOR ni EDITOR", async () => {
    for (const r of ["VIEWER", "CONTRIBUTOR", "EDITOR"]) {
      role.current = r;
      const res = await getClan();
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain("s3cr3t-token");
      const j = JSON.parse(text);
      expect(j.name).toBe("Clan");
      expect(j._count.members).toBe(2);
      expect(j.discordWebhookUrl ?? null).toBeNull();
    }
  });

  it("ADMIN la sigue viendo (la edita y la prueba desde Ajustes)", async () => {
    role.current = "ADMIN";
    const j = await (await getClan()).json();
    expect(j.discordWebhookUrl).toBe(WEBHOOK);
  });
});
