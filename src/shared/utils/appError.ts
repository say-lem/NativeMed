/**
 * Operational error — thrown from services/controllers for known failure cases
 * (bad input, not found, unauthorised, etc.).
 * Distinguishes from unexpected programmer errors so the error handler
 * can respond gracefully rather than crashing.
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly isOperational: boolean;
  
    constructor(message: string, statusCode = 500) {
      super(message);
      this.statusCode = statusCode;
      this.isOperational = true;
  
      // Maintain proper prototype chain in transpiled TS
      Object.setPrototypeOf(this, AppError.prototype);
      Error.captureStackTrace(this, this.constructor);
    }
  }