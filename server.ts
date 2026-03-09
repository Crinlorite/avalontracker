import { createServer } from "http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { PrismaClient } from "./src/generated/prisma/client";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const prisma = new PrismaClient();

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

  // Check for expired routes every 30 seconds
  setInterval(async () => {
    try {
      const expiredRoutes = await prisma.route.findMany({
        where: {
          expiresAt: { lt: new Date() },
          status: "ACTIVE",
        },
      });

      if (expiredRoutes.length > 0) {
        await prisma.route.updateMany({
          where: {
            id: { in: expiredRoutes.map((r) => r.id) },
          },
          data: {
            status: "EXPIRED",
          },
        });

        // Emit route-expired event to each clan room
        for (const route of expiredRoutes) {
          emitToClan(route.clanId, "route-expired", {
            routeId: route.id,
            entryZone: route.entryZone,
            exitZone: route.exitZone,
          });
        }

        console.log(`Expired ${expiredRoutes.length} routes`);
      }
    } catch (error) {
      console.error("Error checking expired routes:", error);
    }
  }, 30_000);

  httpServer.listen(port, hostname, () => {
    console.log(`> Server listening on http://${hostname}:${port}`);
  });
});
