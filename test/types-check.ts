// Vérifié par `tsc` seulement : un exemple de ce que voit un projet TypeScript.
import { ApiError, FasterMessage, type Message } from '../src/index.js';

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
