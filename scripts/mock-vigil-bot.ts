import express from "express";
import "dotenv/config";

const PORT = 4000;
const SECRET = process.env.VIGIL_BOT_SHARED_SECRET ?? "test-secret";

const fakeGuild = {
  id: "111111111111111111",
  name: "Fake Guild",
  icon: null,
  roles: [
    { id: "r_admin", name: "Admin", color: 15158332, position: 10 },
    { id: "r_editor", name: "Officer", color: 3447003, position: 8 },
    { id: "r_contrib", name: "Member", color: 2123412, position: 5 },
    { id: "r_viewer", name: "Recruit", color: 9807270, position: 2 },
  ],
};

const fakeMembers: Record<string, { nickname: string | null; roles: string[] }> = {
  DISCORD_USER_1: { nickname: "Tester1", roles: ["r_admin", "r_contrib"] },
  DISCORD_USER_2: { nickname: null, roles: ["r_editor"] },
  DISCORD_USER_3: { nickname: "Rookie", roles: ["r_viewer"] },
};

const mappings: Record<string, "ADMIN" | "EDITOR" | "CONTRIBUTOR" | "VIEWER"> = {
  r_admin: "ADMIN",
  r_editor: "EDITOR",
  r_contrib: "CONTRIBUTOR",
  r_viewer: "VIEWER",
};

const HIERARCHY = { VIEWER: 1, CONTRIBUTOR: 2, EDITOR: 3, ADMIN: 4 };
function highest(roleIds: string[]) {
  const apps = roleIds.map((r) => mappings[r]).filter(Boolean);
  if (apps.length === 0) return null;
  return apps.reduce((m, r) => (HIERARCHY[r] > HIERARCHY[m] ? r : m));
}

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  const auth = req.headers.authorization ?? "";
  if (auth !== `Bearer ${SECRET}`)
    return res.status(401).json({ error: "unauthorized" });
  next();
});

app.get("/guilds/:guildId/health", (req, res) => {
  if (req.params.guildId !== fakeGuild.id) return res.status(404).end();
  res.json({ installed: true, gatewayConnected: true });
});

app.get("/guilds/:guildId/roles", (req, res) => {
  if (req.params.guildId !== fakeGuild.id) return res.status(404).end();
  res.json(fakeGuild.roles);
});

app.get("/guilds/:guildId/member/:discordId/roles", (req, res) => {
  if (req.params.guildId !== fakeGuild.id) return res.status(404).end();
  const m = fakeMembers[req.params.discordId];
  if (!m) return res.json({ discordRoleIds: [], computedAppRole: null });
  res.json({ discordRoleIds: m.roles, computedAppRole: highest(m.roles) });
});

app.get("/users/:discordId/clans", (req, res) => {
  const m = fakeMembers[req.params.discordId];
  if (!m) return res.json([]);
  res.json([
    {
      guildId: fakeGuild.id,
      discordRoleIds: m.roles,
      computedAppRole: highest(m.roles),
    },
  ]);
});

app.post("/guilds/:guildId/message", (req, res) => {
  console.log("[mock-bot] message:", req.body);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[mock-bot] listening on http://localhost:${PORT}`);
  console.log("[mock-bot] fake guild id:", fakeGuild.id);
  console.log(
    "[mock-bot] known discord user ids:",
    Object.keys(fakeMembers).join(", ")
  );
});
