import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchUserRoleFromBot,
  fetchGuildRoles,
  BotUnavailableError,
} from "@/lib/vigil-bot-client";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.VIGIL_BOT_API_URL = "http://mock-bot";
  process.env.VIGIL_BOT_SHARED_SECRET = "test-secret";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("fetchUserRoleFromBot", () => {
  it("returns parsed body on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          discordRoleIds: ["r1", "r2"],
          computedAppRole: "EDITOR",
        }),
        { status: 200 }
      )
    ) as typeof fetch;

    const r = await fetchUserRoleFromBot("g1", "u1");
    expect(r.discordRoleIds).toEqual(["r1", "r2"]);
    expect(r.computedAppRole).toBe("EDITOR");
  });

  it("throws BotUnavailableError on 5xx", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("oops", { status: 503 })
    ) as typeof fetch;
    await expect(fetchUserRoleFromBot("g1", "u1")).rejects.toBeInstanceOf(
      BotUnavailableError
    );
  });

  it("throws BotUnavailableError on network fail", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as typeof fetch;
    await expect(fetchUserRoleFromBot("g1", "u1")).rejects.toBeInstanceOf(
      BotUnavailableError
    );
  });

  it("returns null appRole when bot reports no mapping", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ discordRoleIds: [], computedAppRole: null }),
        { status: 200 }
      )
    ) as typeof fetch;
    const r = await fetchUserRoleFromBot("g1", "u1");
    expect(r.computedAppRole).toBeNull();
  });
});

describe("fetchGuildRoles", () => {
  it("returns roles array", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: "r1", name: "Admin", color: 16711680, position: 10 },
        ]),
        { status: 200 }
      )
    ) as typeof fetch;
    const roles = await fetchGuildRoles("g1");
    expect(roles).toHaveLength(1);
    expect(roles[0].name).toBe("Admin");
  });
});
