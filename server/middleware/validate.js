import { ApiError } from "../utils/http.js";

/**
 * Validate req.body / req.query / req.params with a zod schema.
 * Replaces the validated value so controllers operate on coerced data.
 */
export function validate(schema, source = "body") {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join(".") || source}: ${issue.message}`)
        .join("; ");
      return next(new ApiError(400, message));
    }
    req[source] = result.data;
    return next();
  };
}
