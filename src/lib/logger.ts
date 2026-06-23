import pino from "pino";
import { getClientIp } from "./request-guards";

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
  const logData: Record<string, any> = { requestId };

  if (request) {
    const url = new URL(request.url);
    logData.path = url.pathname;
    logData.method = request.method;
    logData.ip = getClientIp(request);
  }

  return logger.child(logData);
}

export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
