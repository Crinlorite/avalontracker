import { createServer } from "http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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
    handle(req, res);
  });

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("join-clan", (clanId: string) => {
      socket.join(`clan:${clanId}`);
      console.log(`Socket ${socket.id} joined clan:${clanId}`);
    });

    socket.on("leave-clan", (clanId: string) => {
      socket.leave(`clan:${clanId}`);
      console.log(`Socket ${socket.id} left clan:${clanId}`);
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
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
