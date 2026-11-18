import { ApiError } from "../utils/http.js";
import { env } from "../config/env.js";

export function notFoundHandler(req, _res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(error, _req, res, _next) {
  let statusCode = error.statusCode || 500;
  let message = error.message || "Unexpected server error.";

  if (error.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(error.errors)
      .map((item) => item.message)
      .join("; ");
  } else if (error.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${error.path}: ${error.value}`;
  } else if (error.code === 11000) {
    statusCode = 409;
    message = "That record already exists.";
  }

  if (statusCode >= 500) {
    console.error("[error]", error);
  }

  res.status(statusCode).json({
    message,
    ...(error.details ? { details: error.details } : {}),
    ...(env.isProduction ? {} : { stack: statusCode >= 500 ? error.stack : undefined }),
  });
}
