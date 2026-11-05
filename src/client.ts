import { Requester } from './http.js';
import { Account, ContactGroups, Contacts, Email, Messages, OtpResource, Sms } from './resources.js';

export const DEFAULT_BASE_URL = 'https://api.fastermessage.com';

export interface FasterMessageOptions {
  /** Identifiant d'API, compte débité. */
  username: string;
  /** Mot de passe d'API. */
  password: string;
  /** Clé `fm_live_…` (réel) ou `fm_test_…` (simulé). */
  apiKey: string;
  /** Le domaine d'API de votre marque, le cas échéant. */
  baseUrl?: string;
  /** Délai de chaque tentative, en millisecondes. 30 000 par défaut. */
  timeout?: number;
  /** Nombre de reprises après la première tentative. 2 par défaut. */
  maxRetries?: number;
  /** Remplace `fetch`, par exemple pour passer par un proxy ou pour vos tests. */
  fetch?: typeof globalThis.fetch;
  /** Remplace l'attente entre deux reprises, surtout utile dans vos tests. */
  sleep?: (milliseconds: number) => Promise<void>;
}

/** Point d'entrée du SDK. Côté serveur seulement : il porte vos identifiants. */
export class FasterMessage {
  readonly sms: Sms;
  readonly email: Email;
  readonly messages: Messages;
  readonly otp: OtpResource;
  readonly contacts: Contacts;
  readonly contactGroups: ContactGroups;
  readonly account: Account;
  readonly #testMode: boolean;

  constructor(options: FasterMessageOptions) {
    const { username, password, apiKey } = options ?? ({} as FasterMessageOptions);
    if (!username || !password || !apiKey) {
      throw new TypeError("L'identifiant, le mot de passe et la clé d'API sont tous obligatoires.");
    }
    if ('window' in globalThis && 'document' in globalThis) {
      throw new Error('Le SDK FasterMessage ne s’utilise pas dans un navigateur : vos identifiants y seraient publics.');
    }

    this.#testMode = apiKey.includes('_test_');

    const http = new Requester({
      authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      apiKey,
      baseUrl: (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
      timeout: options.timeout ?? 30_000,
      maxRetries: Math.max(0, options.maxRetries ?? 2),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.sleep ? { sleep: options.sleep } : {}),
    });

    this.sms = new Sms(http);
    this.email = new Email(http);
    this.messages = new Messages(http);
    this.otp = new OtpResource(http);
    this.contacts = new Contacts(http);
    this.contactGroups = new ContactGroups(http);
    this.account = new Account(http);
  }

  /** Vrai avec une clé de test : messages et OTP simulés, mais contacts et soldes réels. */
  get testMode(): boolean {
    return this.#testMode;
  }

  /** Évite d'écrire le moindre détail du client dans un journal par `console.log`. */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `FasterMessage { testMode: ${this.#testMode} }`;
  }
}
