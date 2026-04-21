import { createServer } from "http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getToken } from "next-auth/jwt";
import pinoHttp from "pino-http";
import { logger } from "./src/lib/logger";

const httpLogger = pinoHttp({ logger });

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

let io: SocketIOServer;

export function emitToClan(clanId: string, event: string, data: unknown) {
  if (io) {
    io.to(`clan:${clanId}`).emit(event, data);
  }
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    httpLogger(req, res);
    handle(req, res);
  });

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.AUTH_URL ?? "http://localhost:3000",
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const req = socket.request as unknown as { headers: Record<string, string> };
      const token = await getToken({
        req: req as never,
        secret: process.env.AUTH_SECRET!,
        salt: "authjs.session-token",
      });
      if (!token?.id) return next(new Error("unauthorized"));
      (socket.data as { userId: string }).userId = token.id as string;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("join-clan", async (clanId: string) => {
      const userId = (socket.data as { userId?: string }).userId;
      if (!userId) return;
      const membership = await prisma.clanMember.findUnique({
        where: { userId_clanId: { userId, clanId } },
        select: { appRole: true },
      });
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
      if (!membership?.appRole && !user?.isSuperAdmin) return;
      socket.join(`clan:${clanId}`);
    });

    socket.on("leave-clan", (clanId: string) => socket.leave(`clan:${clanId}`));
    socket.on("disconnect", () => console.log(`Socket disconnected: ${socket.id}`));
  });

  // Check for expired hops every 30 seconds
  setInterval(async () => {
    try {
      const expiredHops = await prisma.routeHop.findMany({
        where: {
          expiresAt: { lt: new Date() },
          status: "ACTIVE",
        },
        include: {
          route: {
            select: { clanId: true, id: true },
          },
        },
      });

      if (expiredHops.length > 0) {
        await prisma.routeHop.updateMany({
          where: {
            id: { in: expiredHops.map((h) => h.id) },
          },
          data: {
            status: "EXPIRED",
          },
        });

        // Check if any routes now have ALL hops expired → mark route as expired
        const routeIds = [...new Set(expiredHops.map((h) => h.route.id))];
        for (const routeId of routeIds) {
          const activeHops = await prisma.routeHop.count({
            where: { routeId, status: "ACTIVE" },
          });

          if (activeHops === 0) {
            await prisma.route.update({
              where: { id: routeId },
              data: { status: "EXPIRED" },
            });
          }
        }

        // Emit events per clan
        const clanIds = [...new Set(expiredHops.map((h) => h.route.clanId))];
        for (const clanId of clanIds) {
          emitToClan(clanId, "route-expired", {
            hopIds: expiredHops
              .filter((h) => h.route.clanId === clanId)
              .map((h) => h.id),
          });
        }

        console.log(`Expired ${expiredHops.length} hops`);
      }
    } catch (error) {
      console.error("Error checking expired hops:", error);
    }
  }, 30_000);

  httpServer.listen(port, hostname, () => {
    console.log(`> Server listening on http://${hostname}:${port}`);
  });
});
