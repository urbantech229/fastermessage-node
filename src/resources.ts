import type { RequestOptions, Requester } from './http.js';
import type {
  Balance,
  Contact,
  ContactBatchResult,
  ContactGroup,
  ContactQuery,
  CreateContactBatchParams,
  CreateContactGroupParams,
  CreateContactParams,
  CreditMovement,
  CreditQuery,
  Message,
  MessageQuery,
  Otp,
  Page,
  PageQuery,
  RequestOtpParams,
  SendEmailParams,
  SendMessageParams,
  SendSmsBatchParams,
  SendSmsParams,
  SmsBatchResult,
  UpdateContactGroupParams,
  UpdateContactParams,
} from './types.js';

const segment = encodeURIComponent;

/** Parcourt toutes les pages, en demandant la suivante seulement quand il le faut. */
async function* paginate<T>(http: Requester, path: string, query: object): AsyncGenerator<T, void, undefined> {
  let cursor: string | null | undefined = (query as PageQuery).cursor;
  for (;;) {
    const page: Page<T> = await http.request<Page<T>>('GET', path, { query: { ...query, cursor } });
    yield* page.data ?? [];
    cursor = page.next_cursor;
    if (page.has_more !== true || cursor === null || cursor === undefined) return;
  }
}

export class Sms {
  readonly #http: Requester;
  constructor(http: Requester) { this.#http = http; }

  send(params: SendSmsParams, options?: RequestOptions): Promise<Message> {
    return this.#http.request('POST', '/v2/sms/send', { body: params, options });
  }

  /** Jusqu'à 500 lignes. Lisez toujours `errors` : un retour normal ne garantit pas que toutes soient parties. */
  sendBatch(params: SendSmsBatchParams, options?: RequestOptions): Promise<SmsBatchResult> {
    return this.#http.request('POST', '/v2/sms/batch', { body: params, options });
  }
}

export class Email {
  readonly #http: Requester;
  constructor(http: Requester) { this.#http = http; }

  send(params: SendEmailParams, options?: RequestOptions): Promise<Message> {
    return this.#http.request('POST', '/v2/email/send', { body: params, options });
  }
}

export class Messages {
  readonly #http: Requester;
  constructor(http: Requester) { this.#http = http; }

  /** Envoi avec le canal en paramètre. WhatsApp et la voix répondent aujourd'hui `501`. */
  send(params: SendMessageParams, options?: RequestOptions): Promise<Message> {
    return this.#http.request('POST', '/v2/messages', { body: params, options });
  }

  get(id: string): Promise<Message> {
    return this.#http.request('GET', `/v2/messages/${segment(id)}`);
  }

  list(query: MessageQuery = {}): Promise<Page<Message>> {
    return this.#http.request('GET', '/v2/messages', { query });
  }

  all(query: MessageQuery = {}): AsyncGenerator<Message, void, undefined> {
    return paginate<Message>(this.#http, '/v2/messages', query);
  }
}

export class OtpResource {
  readonly #http: Requester;
  constructor(http: Requester) { this.#http = http; }

  request(params: RequestOtpParams, options?: RequestOptions): Promise<Otp> {
    return this.#http.request('POST', '/v2/otp', { body: { channel: 'sms', ...params }, options });
  }

  verify(id: string, code: string): Promise<Otp> {
    return this.#http.request('POST', '/v2/otp/verify', { body: { id, code } });
  }
}

export class Contacts {
  readonly #http: Requester;
  constructor(http: Requester) { this.#http = http; }

  create(params: CreateContactParams): Promise<Contact> {
    return this.#http.request('POST', '/v2/contacts', { body: params });
  }

  /** Crée jusqu'à 500 contacts dans un groupe. */
  createBatch(params: CreateContactBatchParams, options?: RequestOptions): Promise<ContactBatchResult> {
    return this.#http.request('POST', '/v2/contacts/batch', { body: params, options });
  }

  get(id: string): Promise<Contact> {
    return this.#http.request('GET', `/v2/contacts/${segment(id)}`);
  }

  list(query: ContactQuery = {}): Promise<Page<Contact>> {
    return this.#http.request('GET', '/v2/contacts', { query });
  }

  all(query: ContactQuery = {}): AsyncGenerator<Contact, void, undefined> {
    return paginate<Contact>(this.#http, '/v2/contacts', query);
  }

  update(id: string, params: UpdateContactParams): Promise<Contact> {
    return this.#http.request('PATCH', `/v2/contacts/${segment(id)}`, { body: params });
  }

  /** Suppression définitive. Ce n'est pas un désabonnement : pour cela, `consent: 'out'`. */
  async delete(id: string): Promise<void> {
    await this.#http.request('DELETE', `/v2/contacts/${segment(id)}`);
  }
}

export class ContactGroups {
  readonly #http: Requester;
  constructor(http: Requester) { this.#http = http; }

  create(params: CreateContactGroupParams): Promise<ContactGroup> {
    return this.#http.request('POST', '/v2/contact-groups', { body: params });
  }

  get(id: string): Promise<ContactGroup> {
    return this.#http.request('GET', `/v2/contact-groups/${segment(id)}`);
  }

  list(query: PageQuery = {}): Promise<Page<ContactGroup>> {
    return this.#http.request('GET', '/v2/contact-groups', { query });
  }

  all(query: PageQuery = {}): AsyncGenerator<ContactGroup, void, undefined> {
    return paginate<ContactGroup>(this.#http, '/v2/contact-groups', query);
  }

  update(id: string, params: UpdateContactGroupParams): Promise<ContactGroup> {
    return this.#http.request('PATCH', `/v2/contact-groups/${segment(id)}`, { body: params });
  }

  /** Refusé en `409` tant que le groupe contient des contacts. */
  async delete(id: string): Promise<void> {
    await this.#http.request('DELETE', `/v2/contact-groups/${segment(id)}`);
  }
}

export class Account {
  readonly #http: Requester;
  constructor(http: Requester) { this.#http = http; }

  async balance(): Promise<Balance[]> {
    const { balances } = await this.#http.request<{ balances?: Balance[] }>('GET', '/v2/balance');
    return balances ?? [];
  }

  credits(query: CreditQuery = {}): Promise<Page<CreditMovement>> {
    return this.#http.request('GET', '/v2/credits', { query });
  }

  allCredits(query: CreditQuery = {}): AsyncGenerator<CreditMovement, void, undefined> {
    return paginate<CreditMovement>(this.#http, '/v2/credits', query);
  }
}
