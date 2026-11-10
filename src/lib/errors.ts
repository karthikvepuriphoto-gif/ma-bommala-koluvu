export class AuthExpiredError extends Error {
  constructor() {
    super("auth-expired");
    this.name = "AuthExpiredError";
  }
}

export class OfflineError extends Error {
  constructor() {
    super("offline");
    this.name = "OfflineError";
  }
}

export function isAuthError(error: unknown): boolean {
  return error instanceof AuthExpiredError;
}
