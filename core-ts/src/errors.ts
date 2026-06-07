export class GridzError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GridzError";
    this.code = code;
  }
}
