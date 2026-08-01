/**
 * Error carrying an HTTP status code. Thrown from controllers/middleware and
 * consumed by `errorHandler`, which reads `statusCode`.
 */
export class ErrorResponse extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = "ErrorResponse";
  }
}
