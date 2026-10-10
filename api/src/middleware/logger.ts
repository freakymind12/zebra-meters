import { Context, Next } from "hono";
import logger from "@/config/logger";

export const loggerMiddleware = async (c: Context, next: Next) => {
  const start = Date.now();
  const { method, path } = c.req;

  await next();

  const end = Date.now();
  const status = c.res.status;
  const duration = end - start;

  const logMessage = `[${method}] ${path} ${status} ${duration}ms`;

  if (status >= 500) {
    logger.error(logMessage);
  } else if (status >= 400) {
    logger.warn(logMessage);
  } else {
    logger.info(logMessage);
  }
};