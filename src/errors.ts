/** Toute erreur levée par le SDK. */
export class FasterMessageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export interface ApiErrorDetails {
  status: number;
  code: string;
  type?: string;
  param?: string | null;
  requestId?: string | null;
  retryAfter?: number | null;
}

/**
 * Refus de l'API. Testez `code`, qui est stable : `message` est un libellé en
 * anglais, susceptible d'être reformulé.
 */
export class ApiError extends FasterMessageError {
  readonly status: number;
  readonly code: string;
  readonly type: string;
  readonly param: string | null;
  readonly requestId: string | null;
  readonly retryAfter: number | null;

  constructor(message: string, details: ApiErrorDetails) {
    super(message);
    this.status = details.status;
    this.code = details.code;
    this.type = details.type ?? '';
    this.param = details.param ?? null;
    this.requestId = details.requestId ?? null;
    this.retryAfter = details.retryAfter ?? null;
  }
}

/** 400 : la requête est à corriger. */
export class InvalidRequestError extends ApiError {}
/** 401 : identifiant, mot de passe ou clé refusés. */
export class AuthenticationError extends ApiError {}
/** 402 : solde insuffisant, le compte débité est à recharger. */
export class InsufficientBalanceError extends ApiError {}
/** 403 : opération interdite à ce compte. */
export class PermissionError extends ApiError {}
/** 404 : ressource introuvable. */
export class NotFoundError extends ApiError {}
/** 409 : conflit, par exemple un groupe non vide ou une clé d'idempotence réutilisée. */
export class ConflictError extends ApiError {}
/** 429 : débit dépassé, voir `retryAfter`. */
export class RateLimitError extends ApiError {}
/** 501 : fonction déclarée au contrat mais pas encore servie. */
export class NotImplementedError extends ApiError {}
/** 5xx : panne côté API. */
export class ServerError extends ApiError {}

/**
 * Coupure réseau ou délai dépassé. L'appel a pu aboutir : rejouez avec
 * `idempotencyKey`, jamais avec une nouvelle clé.
 */
export class ConnectionError extends FasterMessageError {
  idempotencyKey: string | null = null;
}
