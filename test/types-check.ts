// Vérifié par `tsc` seulement : un exemple de ce que voit un projet TypeScript.
import { ApiError, FasterMessage, type FallbackState, type FallbackStepOutcome, type FallbackWebhookEvent, type Message, type Otp } from '../src/index.js';

const fm = new FasterMessage({ username: 'a', password: 'b', apiKey: 'c', timeout: 1000 });

export async function exemple(): Promise<string> {
  const message: Message = await fm.sms.send({ to: '1', from: 'F', content: 'c', client_reference: 'r' }, { idempotencyKey: 'k' });
  const champAjouteParLApi = message['un_champ_futur'];
  // @ts-expect-error `from` est obligatoire pour un SMS.
  await fm.sms.send({ to: '1', content: 'c' });
  // @ts-expect-error un groupe exige son nom.
  await fm.contactGroups.create({});
  for await (const contact of fm.contacts.all({ group_id: 'g' })) void contact.phone_number;
  try {
    await fm.account.balance();
  } catch (error) {
    if (error instanceof ApiError) return error.code;
  }
  return `${message.status} ${String(champAjouteParLApi)}`;
}

export async function repli(): Promise<string | undefined> {
  const message = await fm.sms.send({
    to: '1',
    from: 'F',
    content: 'c',
    fallback: [{ channel: 'email', to: 'a@b.test', from: 'no-reply@b.test' }],
    test_outcome: 'failed',
  });
  const etape: FallbackStepOutcome | undefined = message.fallback?.steps[0];
  // @ts-expect-error vers le SMS, l'étape exige son contenu.
  await fm.sms.send({ to: '1', from: 'F', content: 'c', fallback: [{ channel: 'sms', to: '2', from: 'F' }] });
  // @ts-expect-error le lot refuse le repli.
  await fm.sms.sendBatch({ messages: [{ to: '1' }], fallback: [] });
  const otp: Otp = await fm.otp.request({
    to: '1',
    fallback: [{ channel: 'email', to: 'a@b.test', from: 'no-reply@b.test', content: { text: 'Code : {code}' } }],
    callback_url: 'https://exemple.test/repli',
  });
  const rappel = JSON.parse('{}') as FallbackWebhookEvent;
  const etat: FallbackState = rappel.fallback.state;
  return `${otp.fallback?.state ?? ''} ${etat} ${etape?.reason ?? ''}`;
}
