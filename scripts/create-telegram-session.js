require('dotenv').config();

const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { getTelegramClientOptions } = require('../server/services/telegram');

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = String(process.env.TELEGRAM_API_HASH || '').trim();

if (!Number.isFinite(apiId) || !apiId || !apiHash) {
  console.error('Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env before running this script.');
  process.exit(1);
}

const rl = readline.createInterface({ input, output });

async function ask(prompt) {
  return rl.question(prompt);
}

(async () => {
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, getTelegramClientOptions({
    connectionRetries: 5,
  }));

  await client.start({
    phoneNumber: () => ask('Phone number: '),
    password: () => ask('Two-factor password, if enabled: '),
    phoneCode: () => ask('Telegram code: '),
    onError: (error) => console.error(error.message),
  });

  console.log('\nTELEGRAM_SESSION=');
  console.log(client.session.save());
  await client.disconnect();
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
  });
