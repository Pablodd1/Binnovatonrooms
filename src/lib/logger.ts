import pino from "pino";

const isDevelopment = process.env.NODE_ENV === "development";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info"),
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: "buildscan-ai",
    version: process.env.npm_package_version || "0.1.0",
    environment: process.env.NODE_ENV || "development",
  },
});

export function createRequestLogger(requestId: string, request?: Request) {
  const ip = request
    ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown"
    : "unknown";

  const userAgent = request?.headers.get("user-agent") || "unknown";

  return logger.child({
    requestId,
    ip,
    userAgent,
  });
}

export function generateRequestId(): string {
  return crypto.randomUUID();
}