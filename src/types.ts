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

/** Canaux qu'une étape de repli peut viser. Seuls `sms` et `email` partent aujourd'hui. */
export type FallbackChannel = Channel;

export type FallbackState = 'blocked' | 'watching' | 'triggered' | 'not_needed' | 'failed' | 'expired' | (string & {});

export type FallbackReason =
  | 'channel_not_available'
  | 'invalid_recipient'
  | 'sender_not_allowed'
  | 'channel_not_priced'
  | 'insufficient_balance'
  | 'recipient_blocked'
  | 'destination_not_available'
  | 'ttl_too_short'
  | 'rate_limited'
  | 'account_not_active'
  | 'send_failed'
  | (string & {});

/** Issue simulée avec une clé `fm_test_` : refusée en `400` avec une clé réelle. */
export type TestOutcome = 'failed' | 'delivered';

/** Contenu d'une étape vers l'e-mail : tout est facultatif, l'API complète le reste. */
export interface FallbackEmailContent extends OpenRecord {
  subject?: string;
  text?: string;
  html?: string;
}

/** Contenu d'une étape vers le SMS : obligatoire. */
export type FallbackSmsContent = string | (OpenRecord & { text: string; unicode?: boolean });

interface FallbackStepCommon extends OpenRecord {
  /** Destinataire du repli : numéro pour le SMS, adresse pour l'e-mail. */
  to: string;
  from: string;
}

export interface SmsFallbackStep extends FallbackStepCommon {
  channel: 'sms';
  content: FallbackSmsContent;
}

export interface EmailFallbackStep extends FallbackStepCommon {
  channel: 'email';
  content?: FallbackEmailContent;
}

/** Acceptées par l'API, mais l'étape répond « non disponible ». */
export interface OtherFallbackStep extends FallbackStepCommon {
  channel: 'whatsapp' | 'voice';
  content?: unknown;
}

/** Une étape demandée : les étapes sont essayées dans l'ordre du tableau. */
export type FallbackStep = SmsFallbackStep | EmailFallbackStep | OtherFallbackStep;

/** Ce que l'API dit d'une étape demandée. */
export interface FallbackStepOutcome extends OpenRecord {
  channel: FallbackChannel;
  will_run: boolean;
  reason: FallbackReason | null;
  /** Le message de repli parti pour cette étape, s'il y en a un. */
  message_id: string | null;
}

/** Le repli rendu par l'API : `null` quand aucun n'a été demandé. */
export interface FallbackOutcome extends OpenRecord {
  will_run: boolean;
  state: FallbackState;
  steps: FallbackStepOutcome[];
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
  /** Sur un message de repli : l'identifiant du message d'origine. */
  fallback_of: string | null;
  /** `null` sans repli demandé. */
  fallback?: FallbackOutcome | null;
  error: MessageError | null;
  created_at: string;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
}

interface SendCommon extends OpenRecord {
  to: string;
  /** Étapes de repli, dans l'ordre. Refusé par `sms.sendBatch()`. */
  fallback?: FallbackStep[];
  /** Avec une clé `fm_test_` seulement. */
  test_outcome?: TestOutcome;
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
  /** Le lot refuse le repli (`400`). */
  fallback?: never;
  content?: string | OpenRecord;
  from?: string;
  client_reference?: string;
  scheduled_at?: string;
  callback_url?: string;
}

export interface SendSmsBatchParams extends OpenRecord {
  /** De 1 à 500 lignes. */
  messages: SmsBatchLine[];
  /** Le lot refuse le repli (`400`) : envoyez un par un avec `sms.send()`. */
  fallback?: never;
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
  /** Repli vers l'e-mail : un `content` propre doit contenir `{code}`. */
  fallback?: FallbackStep[];
  /** Avec une clé `fm_test_` seulement. */
  test_outcome?: TestOutcome;
  /** Adresse http(s) du rappel de repli ; à défaut, celle du compte. */
  callback_url?: string;
}

export interface Otp extends OpenRecord {
  id: string;
  status: string;
  attempts_remaining: number;
  /** `null` sans repli demandé. */
  fallback?: FallbackOutcome | null;
}

/**
 * Corps du rappel de repli, reconnu à `event === 'fallback'`. Envoyé quand le repli part
 * (`state: 'triggered'`) ou ne peut pas partir (`state: 'failed'`), jamais avec une clé de test.
 */
export interface FallbackWebhookEvent extends OpenRecord {
  event: 'fallback';
  /** L'identifiant rendu à l'envoi : le message principal, ou la demande OTP si `kind` vaut `otp`. */
  id: string;
  kind: 'message' | 'otp';
  /** Le canal principal. */
  channel: Channel;
  client_reference: string | null;
  fallback: FallbackOutcome;
  /** ISO 8601. */
  event_at: string;
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
