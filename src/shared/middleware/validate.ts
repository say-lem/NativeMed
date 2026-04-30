import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ApiResponse } from '../utils/apiResponse';

type RequestSection = 'body' | 'query' | 'params';

/**
 * Validates a section of the request against a Zod schema.
 * On failure returns 422 with formatted field errors.
 *
 * Usage: router.post('/', validate(createCourseSchema), controller)
 * Usage: router.get('/', validate(paginationSchema, 'query'), controller)
 */
export const validate =
  (schema: ZodSchema, section: RequestSection = 'body') =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[section]);

    if (!result.success) {
      const errors = formatZodErrors(result.error);
      ApiResponse.error(res, 'Validation failed', 422, errors);
      return;
    }

    // Replace the raw section with the parsed (coerced + stripped) data
    req[section] = result.data;
    next();
  };

function formatZodErrors(error: ZodError): Record<string, string[]> {
  return error.issues.reduce<Record<string, string[]>>((acc, issue) => {
    const key = issue.path.join('.') || 'root';
    if (!acc[key]) acc[key] = [];
    acc[key].push(issue.message);
    return acc;
  }, {});
}