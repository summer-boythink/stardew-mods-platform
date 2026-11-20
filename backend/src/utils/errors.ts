/**
 * HTTP error with a status code. The global error middleware turns this into
 * `{ error, ...extra }` without leaking stack traces or upstream details.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly extra: Record<string, unknown> | undefined;

  constructor(status: number, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.extra = extra;
  }
}
