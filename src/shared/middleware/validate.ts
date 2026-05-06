import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ApiResponse } from '../utils/apiResponse';

type RequestSection = 'body' | 'query' | 'params';

export const validate =
  (schema: ZodSchema, section: RequestSection = 'body') =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[section]);

    if (!result.success) {
      const errors = formatZodErrors(result.error);
      ApiResponse.error(res, 'Validation failed', 422, errors);
      return;
    }

    // Express 5: req.query and req.params are read-only getters — use res.locals
    // req.body is still writable so we keep that working as before
    if (section === 'body') {
      req.body = result.data;
    } else {
      res.locals[section] = result.data;
    }

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