# FasterMessage Node.js

SDK Node.js officiel de l'API FasterMessage v2 : SMS, e-mail, codes de vérification (OTP), contacts et webhooks.

Node.js 20.3 ou plus récent. Aucune dépendance. Types TypeScript inclus, en ESM comme en CommonJS.

```bash
npm install @fastermessage/sdk
```

> Côté serveur seulement : le client porte vos identifiants et refuse de démarrer dans un navigateur.

## Démarrage

```js
import { FasterMessage } from '@fastermessage/sdk';
// CommonJS : const { FasterMessage } = require('@fastermessage/sdk');

const fm = new FasterMessage({
  username: process.env.FM_API_USER,
  password: process.env.FM_API_PASSWORD,
  apiKey: process.env.FM_API_KEY, // fm_test_… simule, fm_live_… envoie et débite
});

const message = await fm.sms.send({
  to: '+2290160000000',
  from: 'FASTERMSG',
  content: 'Votre commande est prete.',
  client_reference: 'cmd-42',
});

console.log(message.id, message.status); // queued
```

Sur le domaine d'API de votre marque : `new FasterMessage({ ..., baseUrl: 'https://api.votre-marque.com' })`. L'adresse doit être en `https` : `http` n'est accepté que vers la machine locale.

## Ce que fait le SDK

| Besoin | Appel |
|---|---|
| SMS | `fm.sms.send()`, `fm.sms.sendBatch()` (500 lignes) |
| E-mail | `fm.email.send()` |
| Canal en paramètre | `fm.messages.send()` |
| Suivi | `fm.messages.get()`, `list()`, `all()` |
| OTP | `fm.otp.request()`, `fm.otp.verify()` |
| Contacts | `fm.contacts`, `fm.contactGroups` : `create`, `get`, `list`, `all`, `update`, `delete` |
| Compte | `fm.account.balance()`, `credits()`, `allCredits()` |
| Webhooks | `Webhook.isGenuine()` |

Les paramètres et les réponses gardent les noms de champs de l'API (`client_reference`, `created_at`) : un champ ajouté par l'API est disponible sans mise à jour du SDK. La référence complète est dans la [documentation de l'API](https://www.fastermessage.com/docs).

`all()` parcourt toutes les pages et ne demande la suivante que si vous continuez :

```js
for await (const contact of fm.contacts.all({ group_id: 'g_123' })) {
  console.log(contact.phone_number);
}
```

WhatsApp et la voix ne sont pas encore servis par l'API v2.

## Rejeux sans double envoi

Chaque écriture porte une clé `Idempotency-Key` générée. Le SDK rejoue seul, avec la même clé et deux fois au plus, une coupure réseau, un `5xx` (sauf `501`) et un `429` qui annonce `Retry-After` (60 secondes au plus : au-delà, il lève `RateLimitError` avec `retryAfter`).

Passez votre propre clé pour survivre à un redémarrage de votre programme :

```js
await fm.sms.send(params, { idempotencyKey: 'commande-42-confirmation' });
```

## Erreurs

```js
import { ApiError, ConnectionError, InsufficientBalanceError } from '@fastermessage/sdk';

try {
  await fm.sms.send(params);
} catch (error) {
  if (error instanceof InsufficientBalanceError) {
    // Rechargez le compte débité.
  } else if (error instanceof ApiError) {
    // Testez code, stable, et non le message.
    console.error(error.status, error.code, error.param, error.requestId);
  } else if (error instanceof ConnectionError) {
    // L'appel a pu aboutir : rejouez avec error.idempotencyKey, jamais avec une nouvelle clé.
  } else {
    throw error;
  }
}
```

Erreurs : `InvalidRequestError` (400), `AuthenticationError` (401), `InsufficientBalanceError` (402), `PermissionError` (403), `NotFoundError` (404), `ConflictError` (409), `RateLimitError` (429), `NotImplementedError` (501), `ServerError` (5xx).

Dans un lot, lisez toujours `errors` : un retour normal ne garantit pas que toutes les lignes soient parties.

## Webhooks

Vérifiez la signature sur le corps **brut**, avant tout décodage JSON. Avec Express :

```js
import express from 'express';
import { Webhook } from '@fastermessage/sdk';

const app = express();

app.post('/webhooks/fastermessage', express.raw({ type: 'application/json' }), (req, res) => {
  const genuine = Webhook.isGenuine(req.body, req.get('X-Fastermessage-Signature'), process.env.FM_WEBHOOK_SECRET);
  if (!genuine) return res.sendStatus(401);

  res.sendStatus(200); // Répondez sous 10 secondes, traitez ensuite.
  const event = JSON.parse(req.body);
});
```

Générez le secret dans « Intégration & API ». Le rappel SMS a le format `uuid`, `level`, `status` ; le rappel e-mail `id`, `status`, `error`.

## Tests

```bash
npm install
npm test
```

## Licence

MIT.
