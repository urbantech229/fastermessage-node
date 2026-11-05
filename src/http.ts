import { randomBytes } from 'node:crypto';
import {
  ApiError,
  AuthenticationError,
  ConflictError,
  ConnectionError,
  InsufficientBalanceError,
  InvalidRequestError,
  NotFoundError,
  NotImplementedError,
  PermissionError,
  RateLimitError,
  ServerError,
} from './errors.js';

export const VERSION = '0.1.2';

/** Au-delà, le SDK ne bloque pas votre programme : il rend la main avec RateLimitError. */
const MAX_RETRY_AFTER_SECONDS = 60;

/** Un même appel rejoué garde sa clé : c'est ce qui rend une reprise sans risque. */
const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export interface RequestOptions {
  /** Votre clé, pour survivre à un redémarrage de votre programme. */
  idempotencyKey?: string;
  /** Repris par `X-Request-Id`, pour relier l'appel à vos journaux. */
  requestId?: string;
  /** Annule l'appel. Une annulation n'est jamais rejouée. */
  signal?: AbortSignal;
}

export interface RequesterConfig {
  authorization: string;
  apiKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  fetch?: typeof globalThis.fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

interface Call {
  query?: object;
  body?: object;
  options?: RequestOptions | undefined;
}

/** Le chemin unique de tous les appels : en-têtes, idempotence, reprises, erreurs. */
export class Requester {
  readonly #config: RequesterConfig;

  constructor(config: RequesterConfig) {
    this.#config = config;
  }

  async request<T>(method: string, path: string, { query, body, options = {} }: Call = {}): Promise<T> {
    checkHeader('idempotencyKey', options.idempotencyKey);
    checkHeader('requestId', options.requestId);

    const url = this.#config.baseUrl + path + queryString(query);
    const headers: Record<string, string> = {
      Authorization: this.#config.authorization,
      'X-Api-Key': this.#config.apiKey,
      Accept: 'application/json',
      'User-Agent': `fastermessage-node/${VERSION}`,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.requestId !== undefined) headers['X-Request-Id'] = options.requestId;

    let idempotencyKey: string | null = null;
    if (MUTATING.has(method)) {
      idempotencyKey = options.idempotencyKey ?? `sdk-${randomBytes(16).toString('hex')}`;
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const payload = body === undefined ? undefined : JSON.stringify(body);
    const sleep = this.#config.sleep ?? defaultSleep;

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      let text: string;
      try {
        const timeout = AbortSignal.timeout(this.#config.timeout);
        const fetchFn = this.#config.fetch ?? globalThis.fetch;
        response = await fetchFn(url, {
          method,
          headers,
          ...(payload === undefined ? {} : { body: payload }),
          // Une redirection recopierait la clé d'API vers l'adresse de destination.
          redirect: 'manual',
          signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
        });
        text = await response.text();
      } catch (cause) {
        if (options.signal?.aborted) throw options.signal.reason;
        if (attempt >= this.#config.maxRetries) {
          const error = new ConnectionError(`Connexion à l'API impossible : ${describe(cause)}`, { cause });
          error.idempotencyKey = idempotencyKey;
          throw error;
        }
        await sleep(backoff(attempt));
        continue;
      }

      if (response.status < 300) return decode<T>(response, text);

      const failure = toError(response, text);
      const wait = retryDelay(failure, attempt);
      if (wait === null || attempt >= this.#config.maxRetries) throw failure;
      await sleep(wait);
    }
  }
}

function checkHeader(name: string, value: string | undefined): void {
  if (value !== undefined && !/^[\x20-\x7e]*$/.test(value)) {
    throw new TypeError(`${name} contient des caractères invalides.`);
  }
}

function queryString(query: object | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.append(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

/**
 * Reprise seulement si la même requête peut réussir plus tard. Un 429 sans
 * `Retry-After` est le plafond OTP par numéro, à l'échelle de l'heure : le rejouer
 * ne servirait à rien. Le 501 dit une fonction non servie, jamais une panne.
 */
function retryDelay(failure: ApiError, attempt: number): number | null {
  if (failure.status === 429) {
    if (failure.retryAfter === null || failure.retryAfter > MAX_RETRY_AFTER_SECONDS) return null;
    return failure.retryAfter * 1000;
  }
  if (failure.code === 'idempotency_key_in_flight') return backoff(attempt);
  if (failure.status >= 500 && failure.status !== 501) return backoff(attempt);
  return null;
}

function backoff(attempt: number): number {
  return Math.min(8000, 500 * 2 ** attempt) * (1 + Math.random() * 0.25);
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function decode<T>(response: Response, text: string): T {
  if (response.status === 204 || text.trim() === '') return undefined as T;
  const data = parse(text);
  if (typeof data !== 'object' || data === null) {
    throw new ServerError("Réponse illisible de l'API.", {
      status: response.status,
      code: 'invalid_response',
      type: 'api_error',
      requestId: response.headers.get('x-request-id'),
    });
  }
  return data as T;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toError(response: Response, text: string): ApiError {
  const decoded = parse(text) as { error?: Record<string, unknown> } | null;
  const error = decoded && typeof decoded.error === 'object' && decoded.error !== null ? decoded.error : {};
  const status = response.status;
  const retryAfter = response.headers.get('retry-after');
  const ErrorClass = errorClass(status);

  return new ErrorClass(stringOrNull(error.message) ?? `Erreur HTTP ${status}.`, {
    status,
    code: stringOrNull(error.code) ?? `http_${status}`,
    type: stringOrNull(error.type) ?? '',
    param: stringOrNull(error.param),
    requestId: stringOrNull(error.request_id) ?? response.headers.get('x-request-id'),
    retryAfter: retryAfter !== null && /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter) : null,
  });
}

function errorClass(status: number): typeof ApiError {
  switch (status) {
    case 400: return InvalidRequestError;
    case 401: return AuthenticationError;
    case 402: return InsufficientBalanceError;
    case 403: return PermissionError;
    case 404: return NotFoundError;
    case 409: return ConflictError;
    case 429: return RateLimitError;
    case 501: return NotImplementedError;
    default: return status >= 500 ? ServerError : ApiError;
  }
}
