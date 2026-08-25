import winston from "winston";
import { env } from "./env";

export const logger = winston.createLogger({
  level: env.nodeEnv === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "courier-platform" },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...rest }) => {
          const extra = Object.keys(rest).length > 1 ? ` ${JSON.stringify(rest)}` : "";
          return `[${timestamp}] ${level}: ${message}${extra}`;
        })
      ),
    }),
  ],
});
