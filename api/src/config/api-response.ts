import { z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { ErrorHandler } from "hono";
import logger from "@config/logger";

// ========== Response Schemas for OpenAPI ==========
export const createResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean().openapi({ example: true }),
    data: dataSchema,
  });

export const errorResponseSchema = z.object({
  success: z.boolean().openapi({ example: false }),
  error: z.string().openapi({ example: "Something went wrong" }),
});

// ========== Response Types ==========
export type APIResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ========== OpenAPIHono Factory with Validation Hook ==========
export const createOpenAPIApp = () =>
  new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        const details = result.error.issues.map((issue) => ({
          path: issue.path.join(".") || "body",
          message: issue.message,
        }));

        return c.json(
          {
            success: false,
            error: "Validation failed",
            details,
          },
          400,
        );
      }
    },
  });

// ========== Global Error Handler ==========
export const globalErrorHandler: ErrorHandler = (err, c) => {
  logger.error(`[Error] ${err.message}`);

  // Handle JSON parse errors (empty body or malformed JSON)
  // Hono throws HTTPError with specific error names when JSON parsing fails
  const isErrorName = (names: string[]) => names.includes(err.name);
  const errorMessage = err.message.toLowerCase();

  if (
    isErrorName(["SyntaxError", "HTTPError"]) ||
    errorMessage.includes("json") ||
    errorMessage.includes("unexpected end") ||
    errorMessage.includes("unexpected token") ||
    errorMessage.includes("malformed")
  ) {
    return c.json(
      {
        success: false,
        error: "Invalid JSON: Request body is empty or malformed",
      },
      400,
    );
  }

  // Handle Zod validation errors from @hono/zod-openapi
  if (err.name === "ZodError" || err.message.includes("Validation")) {
    // Try to parse Zod error details
    let details: { path: string; message: string }[] = [];

    try {
      // @hono/zod-openapi wraps ZodError, try to extract issues
      const zodError = (err as any).cause;
      if (zodError && zodError.issues) {
        details = zodError.issues.map((issue: any) => ({
          path: issue.path.join(".") || "body",
          message: issue.message,
        }));
      } else {
        // Fallback: try to parse from error message
        const match = err.message.match(/\[[\s\S]*?\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          details = parsed.map((issue: any) => ({
            path: issue.path?.join(".") || "body",
            message: issue.message,
          }));
        }
      }
    } catch {
      // If parsing fails, return raw message
      details = [{ path: "unknown", message: err.message }];
    }

    return c.json(
      {
        success: false,
        error: "Validation failed",
        details,
      },
      400,
    );
  }

  // Handle other errors
  return c.json(
    {
      success: false,
      error: "Internal Server Error",
    },
    500,
  );
};