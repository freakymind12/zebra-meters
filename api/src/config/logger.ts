import * as winston from "winston";
import { env } from "./env";

const { combine, timestamp, printf, colorize, json } = winston.format;

const isDev = env.NODE_ENV !== "production";

export const logger = winston.createLogger({
  level: isDev ? "debug" : "info",
  format: combine(
    timestamp({
      format: "YYYY-MM-DD hh:mm:ss.SSS A",
    }),
    isDev
      ? combine(
          colorize({ all: true }),
          printf(
            (info: winston.Logform.TransformableInfo) =>
              `[${info.timestamp}] ${info.level}: ${info.message}`,
          ),
        )
      : json(),
  ),
  transports: [new winston.transports.Console()],
});

export default logger;