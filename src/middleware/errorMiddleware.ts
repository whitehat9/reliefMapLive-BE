import type { Request, Response, NextFunction } from "express";
import type { CustomError } from "../types/error.types.js";
import logger from "../utils/logger.js";

interface MongooseValidationError extends Error {
  name: "ValidationError";
  errors: Record<string, { message: string; path?: string }>;
}

interface MongoDuplicateKeyError extends Error {
  code: 11000;
  keyValue?: Record<string, unknown>;
}

const isValidationError = (
  err: CustomError,
): err is CustomError & MongooseValidationError =>
  err.name === "ValidationError" && "errors" in err;

const isDuplicateKeyError = (
  err: CustomError,
): err is CustomError & MongoDuplicateKeyError =>
  (err as { code?: number }).code === 11000;

export const errorHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Normalize raw Mongoose/MongoDB errors that never got a friendly
  // ErrorResponse (e.g. a duplicate key or failed validator reaching
  // User.create() without a pre-check) into a clean status + message, rather
  // than leaking a raw Mongo error string as a 500.
  let normalizedStatusCode = err.statusCode;
  let normalizedMessage = err.message;

  if (normalizedStatusCode === undefined && isValidationError(err)) {
    normalizedStatusCode = 400;
    normalizedMessage = Object.values(err.errors)
      .map((e) => e.message)
      .join(", ");
  } else if (normalizedStatusCode === undefined && isDuplicateKeyError(err)) {
    normalizedStatusCode = 409;
    const field = err.keyValue ? Object.keys(err.keyValue)[0] : undefined;
    normalizedMessage = field
      ? `A user with this ${field} already exists`
      : "A record with these details already exists";
  }

  // Prefer the error's own statusCode (e.g. ErrorResponse from auth/validation
  // failures); fall back to whatever res.statusCode was already set to, or 500.
  const statusCode =
    normalizedStatusCode ?? (res.statusCode === 200 ? 500 : res.statusCode);

  // 5xx are real server-side faults — log the full stack. 4xx are expected
  // client errors (e.g. an expired/missing Bearer token, validation failures,
  // 404s); log a concise warning, no stack.
  if (statusCode >= 500) {
    logger.error(err.stack ?? err.message);
  } else {
    logger.warn(
      `${req.method} ${req.originalUrl} ${statusCode} — ${normalizedMessage}`,
    );
  }

  // CRITICAL: Check if response has already been sent
  if (res.headersSent) {
    // If headers are already sent, delegate to the default Express error handler
    return next(err);
  }

  try {
    // Send error response
    res.status(statusCode).json({
      success: false,
      message: normalizedMessage,
      stack: process.env.NODE_ENV === "production" ? null : err.stack,
    });
  } catch (responseError) {
    // If we still can't send the response, log it and delegate to Express
    logger.error("Failed to send error response:", responseError);
    return next(err);
  }
};

export const routeNotFound = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Handle favicon requests silently
  if (req.originalUrl === "/favicon.ico") {
    if (!res.headersSent) {
      res.status(204).end();
    }
    return;
  }

  // CRITICAL: Check if response has already been sent
  if (res.headersSent) {
    return next();
  }

  // Create error for route not found
  const error: CustomError = new Error(`Not Found - ${req.originalUrl}`);

  // Set status code and pass to error handler
  res.status(404);
  next(error);
};
