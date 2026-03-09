-- CreateTable RouteHop
CREATE TABLE "RouteHop" (
    "id" SERIAL NOT NULL,
    "routeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "fromZone" TEXT NOT NULL,
    "toZone" TEXT NOT NULL,
    "portalSize" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "RouteStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "RouteHop_pkey" PRIMARY KEY ("id")
);

-- Migrate existing routes to hops
INSERT INTO "RouteHop" ("routeId", "order", "fromZone", "toZone", "portalSize", "expiresAt", "status")
SELECT "id", 0, "entryZone", "exitZone", "portalSize", "expiresAt",
  CASE WHEN "status" = 'ACTIVE' AND "expiresAt" < NOW() THEN 'EXPIRED' ELSE "status" END
FROM "Route"
WHERE "entryZone" IS NOT NULL;

-- Drop old columns from Route
ALTER TABLE "Route" DROP COLUMN IF EXISTS "entryZone";
ALTER TABLE "Route" DROP COLUMN IF EXISTS "exitZone";
ALTER TABLE "Route" DROP COLUMN IF EXISTS "portalSize";
ALTER TABLE "Route" DROP COLUMN IF EXISTS "expiresAt";

-- Drop old index
DROP INDEX IF EXISTS "Route_expiresAt_idx";

-- CreateIndex
CREATE INDEX "RouteHop_routeId_idx" ON "RouteHop"("routeId");
CREATE INDEX "RouteHop_expiresAt_status_idx" ON "RouteHop"("expiresAt", "status");

-- AddForeignKey
ALTER TABLE "RouteHop" ADD CONSTRAINT "RouteHop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;
