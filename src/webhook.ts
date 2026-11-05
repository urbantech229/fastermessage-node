import { createHmac, timingSafeEqual } from 'node:crypto';

/** Vérification des rappels reçus sur votre serveur. */
export const Webhook = {
  /**
   * Vrai si le rappel vient bien de la plateforme.
   *
   * @param rawBody   le corps BRUT, avant tout décodage JSON
   * @param signature l'en-tête `X-Fastermessage-Signature`
   * @param secret    le secret généré dans « Intégration & API »
   */
  isGenuine(rawBody: string | Uint8Array, signature: string | null | undefined, secret: string): boolean {
    if (typeof signature !== 'string' || !secret) return false;
    const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`);
    const received = Buffer.from(signature.trim());
    return expected.length === received.length && timingSafeEqual(expected, received);
  },
};
