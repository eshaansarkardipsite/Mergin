import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

export function parseBody<T>(schema: ZodType<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: 'Validation failed.',
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return null;
  }
  return result.data;
}

export function notFound(res: Response, what = 'Resource'): void {
  res.status(404).json({ error: `${what} not found.` });
}

export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

export { escapeCsvCell as csvEscape } from '../shared/csv';
