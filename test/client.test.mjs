import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { describe, it } from 'node:test';
import { inspect } from 'node:util';
import {
  ApiError,
  AuthenticationError,
  ConflictError,
  ConnectionError,
  FasterMessage,
  InsufficientBalanceError,
  InvalidRequestError,
  NotFoundError,
  NotImplementedError,
  PermissionError,
  RateLimitError,
  ServerError,
  Webhook,
} from '../dist/esm/index.js';

const json = (status, body, headers = {}) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
const refus = (status, code, extra = {}, headers = {}) =>
  json(status, { error: { type: 'invalid_request', code, message: `refus ${code}`, ...extra } }, headers);

/** Un faux `fetch` qui rejoue ses réponses dans l'ordre et note chaque appel. */
function monter(reponses, options = {}) {
  const calls = [];
  const sleeps = [];
  const fm = new FasterMessage({
    username: 'alice',
    password: 'motdepasse',
    apiKey: 'fm_test_abc',
    fetch: async (url, init) => {
      calls.push({ url, ...init, json: init.body ? JSON.parse(init.body) : undefined });
      const next = reponses.shift();
      if (next instanceof Error) throw next;
      return typeof next === 'function' ? next(init) : next;
    },
    sleep: async (ms) => { sleeps.push(ms); },
    ...options,
  });
  return { fm, calls, sleeps };
}

describe('construction', () => {
  for (const manque of ['username', 'password', 'apiKey']) {
    it(`refuse l'absence de ${manque}`, () => {
      const options = { username: 'a', password: 'b', apiKey: 'c', [manque]: '' };
      assert.throws(() => new FasterMessage(options), TypeError);
    });
  }

  it('reconnaît une clé de test et une clé réelle', () => {
    assert.equal(new FasterMessage({ username: 'a', password: 'b', apiKey: 'fm_test_x' }).testMode, true);
    assert.equal(new FasterMessage({ username: 'a', password: 'b', apiKey: 'fm_live_x' }).testMode, false);
  });

  it('refuse de tourner dans un navigateur', () => {
    globalThis.window = {};
    globalThis.document = {};
    try {
      assert.throws(() => new FasterMessage({ username: 'a', password: 'b', apiKey: 'c' }), /navigateur/);
    } finally {
      delete globalThis.window;
      delete globalThis.document;
    }
  });

  it('n’écrit aucun identifiant par console.log ni JSON.stringify', () => {
    const fm = new FasterMessage({ username: 'alice', password: 'motdepasse', apiKey: 'fm_live_secret' });
    for (const texte of [inspect(fm, { depth: 10 }), JSON.stringify(fm), inspect(fm.sms, { depth: 10, showHidden: true })]) {
      assert.doesNotMatch(texte, /alice|motdepasse|fm_live_secret|YWxpY2U/);
    }
  });
});

describe('en-têtes et chemins', () => {
  it('envoie l’authentification, la clé et le corps JSON', async () => {
    const { fm, calls } = monter([json(201, { id: 'm1', status: 'queued' })]);
    const message = await fm.sms.send({ to: '+2290160000000', from: 'FASTERMSG', content: 'é' });
    assert.equal(message.status, 'queued');
    assert.equal(calls[0].url, 'https://api.fastermessage.com/v2/sms/send');
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].headers.Authorization, `Basic ${Buffer.from('alice:motdepasse').toString('base64')}`);
    assert.equal(calls[0].headers['X-Api-Key'], 'fm_test_abc');
    assert.equal(calls[0].headers['Content-Type'], 'application/json');
    assert.match(calls[0].headers['User-Agent'], /^fastermessage-node\/\d/);
    assert.equal(calls[0].json.content, 'é');
  });

  it('utilise le domaine de la marque, sans double barre', async () => {
    const { fm, calls } = monter([json(200, { balances: [] })], { baseUrl: 'https://api.marque.test/' });
    await fm.account.balance();
    assert.equal(calls[0].url, 'https://api.marque.test/v2/balance');
  });

  it('encode un identifiant et ignore les filtres vides', async () => {
    const { fm, calls } = monter([json(200, { id: 'x' }), json(200, { data: [], has_more: false, next_cursor: null })]);
    await fm.messages.get('a/b c');
    await fm.messages.list({ channel: 'email', status: undefined, limit: 5 });
    assert.equal(calls[0].url, 'https://api.fastermessage.com/v2/messages/a%2Fb%20c');
    assert.equal(calls[1].url, 'https://api.fastermessage.com/v2/messages?channel=email&limit=5');
    assert.equal(calls[1].headers['Idempotency-Key'], undefined);
  });

  it('transmet X-Request-Id', async () => {
    const { fm, calls } = monter([json(201, {})]);
    await fm.email.send({ to: 'a@b.test', content: { subject: 's', text: 't' } }, { requestId: 'r-1' });
    assert.equal(calls[0].url, 'https://api.fastermessage.com/v2/email/send');
    assert.equal(calls[0].headers['X-Request-Id'], 'r-1');
  });

  it('routes des autres ressources', async () => {
    const { fm, calls } = monter(Array.from({ length: 9 }, () => json(200, { id: 'i' })));
    await fm.sms.sendBatch({ from: 'F', content: 'c', messages: [{ to: '1' }] });
    await fm.messages.send({ channel: 'sms', to: '1', content: 'c' });
    await fm.contacts.create({ group_id: 'g', phone_number: '1' });
    await fm.contacts.createBatch({ group_id: 'g', contacts: [{ phone_number: '1' }] });
    await fm.contacts.update('c1', { consent: 'out' });
    await fm.contactGroups.create({ name: 'n' });
    await fm.contactGroups.update('g1', { name: 'm' });
    await fm.contactGroups.get('g1');
    await fm.account.credits({ limit: 3 });
    assert.deepEqual(calls.map((c) => `${c.method} ${c.url.replace('https://api.fastermessage.com', '')}`), [
      'POST /v2/sms/batch', 'POST /v2/messages', 'POST /v2/contacts', 'POST /v2/contacts/batch', 'PATCH /v2/contacts/c1',
      'POST /v2/contact-groups', 'PATCH /v2/contact-groups/g1', 'GET /v2/contact-groups/g1', 'GET /v2/credits?limit=3',
    ]);
  });
});

describe('OTP', () => {
  it('prend le SMS par défaut, sans écraser un canal choisi', async () => {
    const { fm, calls } = monter([json(201, {}), json(201, {})]);
    await fm.otp.request({ to: '1', from: 'F' });
    await fm.otp.request({ to: '1', channel: 'email' });
    assert.equal(calls[0].url, 'https://api.fastermessage.com/v2/otp');
    assert.equal(calls[0].json.channel, 'sms');
    assert.equal(calls[1].json.channel, 'email');
  });

  it('vérifie avec l’identifiant et le code', async () => {
    const { fm, calls } = monter([json(200, { status: 'approved' })]);
    assert.equal((await fm.otp.verify('o1', '000000')).status, 'approved');
    assert.equal(calls[0].url, 'https://api.fastermessage.com/v2/otp/verify');
    assert.deepEqual(calls[0].json, { id: 'o1', code: '000000' });
  });
});

describe('idempotence et reprises', () => {
  it('génère une clé par écriture, différente à chaque appel', async () => {
    const { fm, calls } = monter([json(201, {}), json(201, {})]);
    await fm.sms.send({ to: '1', from: 'F', content: 'c' });
    await fm.sms.send({ to: '1', from: 'F', content: 'c' });
    assert.match(calls[0].headers['Idempotency-Key'], /^sdk-[0-9a-f]{32}$/);
    assert.notEqual(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
  });

  it('respecte la clé fournie', async () => {
    const { fm, calls } = monter([json(201, {})]);
    await fm.sms.send({ to: '1', from: 'F', content: 'c' }, { idempotencyKey: 'cmd-42' });
    assert.equal(calls[0].headers['Idempotency-Key'], 'cmd-42');
  });

  it('rejoue un 5xx avec la même clé, puis réussit', async () => {
    const { fm, calls, sleeps } = monter([refus(500, 'internal_error'), refus(503, 'unavailable'), json(201, { id: 'm' })]);
    assert.equal((await fm.sms.send({ to: '1', from: 'F', content: 'c' })).id, 'm');
    assert.equal(calls.length, 3);
    assert.equal(calls[0].headers['Idempotency-Key'], calls[2].headers['Idempotency-Key']);
    assert.equal(sleeps.length, 2);
    assert.ok(sleeps[1] > sleeps[0]);
  });

  it('s’arrête après les reprises prévues', async () => {
    const { fm, calls } = monter([refus(500, 'a'), refus(500, 'b'), refus(500, 'c')]);
    await assert.rejects(fm.account.balance(), ServerError);
    assert.equal(calls.length, 3);
  });

  it('maxRetries à 0 ne rejoue rien', async () => {
    const { fm, calls } = monter([refus(500, 'a')], { maxRetries: 0 });
    await assert.rejects(fm.account.balance(), ServerError);
    assert.equal(calls.length, 1);
  });

  for (const [status, code] of [[400, 'missing_parameter'], [402, 'insufficient_balance'], [501, 'not_implemented']]) {
    it(`ne rejoue jamais un ${status}`, async () => {
      const { fm, calls } = monter([refus(status, code)]);
      await assert.rejects(fm.sms.send({ to: '1', from: 'F', content: 'c' }), ApiError);
      assert.equal(calls.length, 1);
    });
  }

  it('attend Retry-After sur un 429, puis rejoue', async () => {
    const { fm, calls, sleeps } = monter([refus(429, 'rate_limited', {}, { 'Retry-After': '7' }), json(200, { balances: [] })]);
    await fm.account.balance();
    assert.equal(calls.length, 2);
    assert.deepEqual(sleeps, [7000]);
  });

  it('ne rejoue pas un 429 sans Retry-After', async () => {
    const { fm, calls } = monter([refus(429, 'otp_rate_limited')]);
    const erreur = await fm.otp.request({ to: '1' }).catch((e) => e);
    assert.ok(erreur instanceof RateLimitError);
    assert.equal(erreur.retryAfter, null);
    assert.equal(calls.length, 1);
  });

  it('rejoue une clé encore en cours de traitement', async () => {
    const { fm, calls } = monter([refus(409, 'idempotency_key_in_flight'), json(201, { id: 'm' })]);
    await fm.sms.send({ to: '1', from: 'F', content: 'c' });
    assert.equal(calls.length, 2);
  });

  it('rejoue une coupure réseau, puis donne la clé à réutiliser', async () => {
    const coupure = () => new TypeError('fetch failed');
    const { fm, calls } = monter([coupure(), coupure(), coupure()]);
    const erreur = await fm.sms.send({ to: '1', from: 'F', content: 'c' }).catch((e) => e);
    assert.ok(erreur instanceof ConnectionError);
    assert.equal(calls.length, 3);
    assert.equal(erreur.idempotencyKey, calls[0].headers['Idempotency-Key']);
    assert.match(erreur.message, /fetch failed/);
  });

  it('transforme un délai dépassé en ConnectionError', async () => {
    const lent = (init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    });
    const { fm, calls } = monter([lent], { timeout: 10, maxRetries: 0 });
    await assert.rejects(fm.account.balance(), ConnectionError);
    assert.equal(calls.length, 1);
  });

  it('ne rejoue jamais une annulation demandée par l’appelant', async () => {
    const controle = new AbortController();
    const motif = new Error('annulé');
    const annule = () => { controle.abort(motif); throw new DOMException('aborted', 'AbortError'); };
    const { fm, calls } = monter([annule]);
    await assert.rejects(fm.sms.send({ to: '1', from: 'F', content: 'c' }, { signal: controle.signal }), (e) => e === motif);
    assert.equal(calls.length, 1);
  });
});

describe('redirections', () => {
  it('demande à fetch de ne jamais les suivre', async () => {
    const { fm, calls } = monter([json(200, { balances: [] })]);
    await fm.account.balance();
    assert.equal(calls[0].redirect, 'manual');
  });

  it('une vraie redirection ne recopie pas la clé vers sa destination', async () => {
    const recues = [];
    const piege = createServer((req, res) => { recues.push(req.headers['x-api-key']); res.end('{}'); });
    await new Promise((resolve) => piege.listen(0, '127.0.0.1', resolve));
    const api = createServer((req, res) => {
      res.writeHead(302, { Location: `http://127.0.0.1:${piege.address().port}/v2/balance` });
      res.end();
    });
    await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
    try {
      const fm = new FasterMessage({
        username: 'a', password: 'b', apiKey: 'fm_live_secret', baseUrl: `http://127.0.0.1:${api.address().port}`, maxRetries: 0,
      });
      const erreur = await fm.account.balance().catch((e) => e);
      assert.ok(erreur instanceof ApiError);
      assert.equal(erreur.status, 302);
      assert.deepEqual(recues, []);
    } finally {
      api.close();
      piege.close();
      api.closeAllConnections();
      piege.closeAllConnections();
    }
  });
});

describe('erreurs', () => {
  for (const [status, Classe] of [
    [400, InvalidRequestError], [401, AuthenticationError], [402, InsufficientBalanceError], [403, PermissionError],
    [404, NotFoundError], [409, ConflictError], [429, RateLimitError], [501, NotImplementedError], [503, ServerError],
  ]) {
    it(`${status} donne ${Classe.name}`, async () => {
      const { fm } = monter([refus(status, 'code_stable')], { maxRetries: 0 });
      const erreur = await fm.account.balance().catch((e) => e);
      assert.ok(erreur instanceof Classe);
      assert.ok(erreur instanceof ApiError);
      assert.equal(erreur.name, Classe.name);
      assert.equal(erreur.status, status);
      assert.equal(erreur.code, 'code_stable');
    });
  }

  it('garde champ fautif, type et identifiant de requête', async () => {
    const { fm } = monter([refus(400, 'missing_parameter', { param: 'from', request_id: 'r-9' })]);
    const erreur = await fm.sms.send({ to: '1', content: 'c' }).catch((e) => e);
    assert.equal(erreur.param, 'from');
    assert.equal(erreur.requestId, 'r-9');
    assert.equal(erreur.type, 'invalid_request');
    assert.equal(erreur.message, 'refus missing_parameter');
  });

  it('prend l’identifiant de requête dans l’en-tête s’il manque au corps', async () => {
    const { fm } = monter([refus(404, 'not_found', {}, { 'X-Request-Id': 'r-h' })]);
    assert.equal((await fm.messages.get('x').catch((e) => e)).requestId, 'r-h');
  });

  it('survit à un corps d’erreur qui n’est pas du JSON', async () => {
    const { fm } = monter([new Response('<html>Bad gateway</html>', { status: 400 })]);
    const erreur = await fm.account.balance().catch((e) => e);
    assert.equal(erreur.code, 'http_400');
    assert.equal(erreur.message, 'Erreur HTTP 400.');
  });

  it('un autre 4xx reste une ApiError', async () => {
    const { fm } = monter([refus(422, 'unprocessable')]);
    const erreur = await fm.account.balance().catch((e) => e);
    assert.equal(erreur.constructor, ApiError);
  });

  it('refuse une réponse réussie illisible', async () => {
    const { fm } = monter([new Response('pas du json', { status: 200 })]);
    const erreur = await fm.account.balance().catch((e) => e);
    assert.ok(erreur instanceof ServerError);
    assert.equal(erreur.code, 'invalid_response');
  });
});

describe('réponses vides et pagination', () => {
  it('un 204 donne undefined', async () => {
    const { fm, calls } = monter([new Response(null, { status: 204 }), new Response(null, { status: 204 })]);
    assert.equal(await fm.contacts.delete('c/1'), undefined);
    assert.equal(await fm.contactGroups.delete('g1'), undefined);
    assert.equal(calls[0].method, 'DELETE');
    assert.equal(calls[0].url, 'https://api.fastermessage.com/v2/contacts/c%2F1');
    assert.ok(calls[0].headers['Idempotency-Key']);
  });

  it('balance renvoie la liste des soldes', async () => {
    const { fm } = monter([json(200, { balances: [{ channel: 'sms', amount: 3, currency: 'XOF' }] })]);
    assert.deepEqual(await fm.account.balance(), [{ channel: 'sms', amount: 3, currency: 'XOF' }]);
  });

  it('all parcourt les pages et garde les filtres', async () => {
    const { fm, calls } = monter([
      json(200, { data: [{ id: 1 }, { id: 2 }], has_more: true, next_cursor: 'c2' }),
      json(200, { data: [{ id: 3 }], has_more: false, next_cursor: null }),
    ]);
    const vus = [];
    for await (const contact of fm.contacts.all({ group_id: 'g', limit: 2 })) vus.push(contact.id);
    assert.deepEqual(vus, [1, 2, 3]);
    assert.equal(calls[0].url, 'https://api.fastermessage.com/v2/contacts?group_id=g&limit=2');
    assert.equal(calls[1].url, 'https://api.fastermessage.com/v2/contacts?group_id=g&limit=2&cursor=c2');
  });

  it('all ne demande pas la page suivante si on s’arrête avant', async () => {
    const { fm, calls } = monter([json(200, { data: [{ id: 1 }, { id: 2 }], has_more: true, next_cursor: 'c2' })]);
    for await (const message of fm.messages.all()) { assert.equal(message.id, 1); break; }
    assert.equal(calls.length, 1);
  });

  it('all s’arrête sans curseur, même si has_more est vrai', async () => {
    const { fm, calls } = monter([json(200, { data: [{ id: 1 }], has_more: true, next_cursor: null })]);
    const vus = [];
    for await (const g of fm.contactGroups.all()) vus.push(g);
    assert.equal(vus.length, 1);
    assert.equal(calls.length, 1);
  });

  it('allCredits parcourt les mouvements', async () => {
    const { fm, calls } = monter([json(200, { data: [{ id: 'm' }], has_more: false, next_cursor: null })]);
    const vus = [];
    for await (const m of fm.account.allCredits({ type: 'debit' })) vus.push(m.id);
    assert.deepEqual(vus, ['m']);
    assert.equal(calls[0].url, 'https://api.fastermessage.com/v2/credits?type=debit');
  });
});

describe('webhooks', () => {
  const corps = '{"id":"m1","status":"delivered"}';
  const signe = (texte, secret = 'whsec') => `sha256=${createHmac('sha256', secret).update(texte).digest('hex')}`;

  it('accepte une signature juste, en texte ou en octets', () => {
    assert.equal(Webhook.isGenuine(corps, signe(corps), 'whsec'), true);
    assert.equal(Webhook.isGenuine(Buffer.from(corps), ` ${signe(corps)} `, 'whsec'), true);
  });

  it('refuse un corps modifié, un autre secret, ou une signature absente', () => {
    assert.equal(Webhook.isGenuine(`${corps} `, signe(corps), 'whsec'), false);
    assert.equal(Webhook.isGenuine(corps, signe(corps, 'autre'), 'whsec'), false);
    assert.equal(Webhook.isGenuine(corps, null, 'whsec'), false);
    assert.equal(Webhook.isGenuine(corps, undefined, 'whsec'), false);
    assert.equal(Webhook.isGenuine(corps, signe(corps), ''), false);
  });

  it('refuse sans planter une signature de mauvaise longueur', () => {
    assert.equal(Webhook.isGenuine(corps, 'sha256=court', 'whsec'), false);
    assert.equal(Webhook.isGenuine(corps, 'é'.repeat(71), 'whsec'), false);
  });
});
