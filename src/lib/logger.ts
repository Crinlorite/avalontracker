import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: { app: "avalon-tracker" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ["req.headers.cookie", "req.headers.authorization", "body.password", "body.token"],
    remove: true,
  },
});

export function childLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
