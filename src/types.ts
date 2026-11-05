/**
 * Les réponses gardent les noms de champs de l'API. La signature ouverte de chaque
 * ressource rend disponible un champ ajouté par l'API sans mise à jour du SDK.
 */
export interface OpenRecord {
  [field: string]: unknown;
}

export type Channel = 'sms' | 'email' | 'whatsapp' | 'voice';
export type Consent = 'in' | 'out' | (string & {});

export interface Page<T> extends OpenRecord {
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface PageQuery {
  limit?: number;
  cursor?: string;
}

export interface MessageError extends OpenRecord {
  code: string;
  message: string;
  provider_code: string | null;
}

export interface MessageRefund extends OpenRecord {
  amount: number;
  currency: string;
  refunded_at: string;
}

export interface FallbackOutcome extends OpenRecord {
  will_run: boolean;
  reason: string | null;
  message: string;
  requested: Channel[];
}

export interface Message extends OpenRecord {
  id: string;
  channel: Channel;
  status: string;
  to: string;
  from: string;
  units: number;
  price: number | null;
  currency: string;
  refund: MessageRefund | null;
  client_reference: string | null;
  fallback_of: string | null;
  fallback?: FallbackOutcome | null;
  error: MessageError | null;
  created_at: string;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
}

interface SendCommon extends OpenRecord {
  to: string;
  fallback?: unknown[];
  callback_url?: string;
  scheduled_at?: string;
  client_reference?: string;
}

export interface SendSmsParams extends SendCommon {
  /** Sender ID approuvé : obligatoire, sans repli. */
  from: string;
  content: string | OpenRecord;
}

export interface EmailContent extends OpenRecord {
  subject: string;
  text?: string;
  html?: string;
}

export interface SendEmailParams extends SendCommon {
  from?: string;
  content: EmailContent;
}

export interface SendMessageParams extends SendCommon {
  channel: Channel;
  from?: string;
  content: unknown;
}

export interface SmsBatchLine extends OpenRecord {
  to: string;
  content?: string | OpenRecord;
  from?: string;
  client_reference?: string;
  scheduled_at?: string;
  callback_url?: string;
}

export interface SendSmsBatchParams extends OpenRecord {
  /** De 1 à 500 lignes. */
  messages: SmsBatchLine[];
  from?: string;
  content?: string | OpenRecord;
  scheduled_at?: string;
  callback_url?: string;
}

export interface BatchLineError extends OpenRecord {
  index: number;
  code: string;
  message: string;
  param?: string;
  to?: string;
}

export interface SmsBatchResult extends OpenRecord {
  total: number;
  accepted: number;
  rejected: number;
  data: (Message & { index: number })[];
  /** Une entrée par ligne refusée : le reste du lot est bien parti. */
  errors: BatchLineError[];
}

export interface MessageQuery extends PageQuery {
  channel?: Channel;
  status?: string;
  [filter: string]: unknown;
}

export interface RequestOtpParams extends OpenRecord {
  to: string;
  /** `sms` par défaut. */
  channel?: Channel;
  from?: string;
  length?: number;
  ttl_seconds?: number;
  template?: string;
  client_reference?: string;
}

export interface Otp extends OpenRecord {
  id: string;
  status: string;
  attempts_remaining: number;
}

export interface ContactFields extends OpenRecord {
  email?: string;
  whatsapp?: boolean;
  consent?: Consent;
  fields?: string[];
}

export interface CreateContactParams extends ContactFields {
  group_id: string;
  phone_number: string;
}

export interface UpdateContactParams extends OpenRecord {
  group_id?: string;
  phone_number?: string;
  email?: string | null;
  whatsapp?: boolean;
  consent?: Consent;
  fields?: string[];
}

export interface CreateContactBatchParams extends OpenRecord {
  group_id: string;
  /** De 1 à 500 lignes. */
  contacts: (ContactFields & { phone_number: string })[];
  on_duplicate?: string;
}

export interface Contact extends OpenRecord {
  id: string;
  group_id: string;
  phone_number: string;
  consent: Consent;
}

export interface ContactBatchResult extends OpenRecord {
  created: number;
  invalid: number;
}

export interface ContactQuery extends PageQuery {
  group_id?: string;
  consent?: Consent;
  search?: string;
}

export interface CreateContactGroupParams extends OpenRecord {
  name: string;
  fields?: string[];
}

export interface UpdateContactGroupParams extends OpenRecord {
  name?: string;
  fields?: string[];
}

export interface ContactGroup extends OpenRecord {
  id: string;
  name: string;
  contacts_count: number;
  fields: string[];
}

export interface Balance extends OpenRecord {
  channel: Channel;
  amount: number;
  currency: string;
}

export interface CreditMovement extends OpenRecord {
  id: string;
  type: 'credit' | 'debit' | 'refund';
  channel: Channel;
  amount: number;
  currency: string;
}

export interface CreditQuery extends PageQuery {
  type?: 'credit' | 'debit' | 'refund';
  [filter: string]: unknown;
}
