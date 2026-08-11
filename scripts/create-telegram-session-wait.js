require('dotenv').config();

const fs = require('fs');
const { execSync } = require('child_process');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { getTelegramClientOptions } = require('../server/services/telegram');

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = String(process.env.TELEGRAM_API_HASH || '').trim();
const phone = String(process.env.TELEGRAM_PHONE || '').trim();
const codeFile = String(process.env.TELEGRAM_CODE_FILE || '/tmp/telegram-login-code').trim();
const passwordFile = String(process.env.TELEGRAM_PASSWORD_FILE || '/tmp/telegram-login-password').trim();
const timeoutMs = Number(process.env.TELEGRAM_CODE_TIMEOUT_MS || 5 * 60 * 1000);

if (!Number.isFinite(apiId) || !apiId || !apiHash) {
  console.error('Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env before running this script.');
  process.exit(1);
}
if (!phone) {
  console.error('Set TELEGRAM_PHONE before running this script.');
  process.exit(1);
}

function waitForFileValue(filePath, label) {
  const started = Date.now();
  console.error(`Waiting for ${label} in ${filePath} ...`);
  while (Date.now() - started < timeoutMs) {
    try {
      if (fs.existsSync(filePath)) {
        const value = String(fs.readFileSync(filePath, 'utf8') || '').trim();
        if (value) {
          try { fs.writeFileSync(filePath, '', 'utf8'); } catch (_) {}
          try { fs.unlinkSync(filePath); } catch (_) {}
          console.error(`Got ${label}.`);
          return value;
        }
      }
    } catch (_) {
      // keep waiting
    }
    // Busy-wait: gramJS may keep the event loop busy during auth.
    execSync('sleep 1');
  }
  throw new Error(`Timed out waiting for ${label} in ${filePath}`);
}

(async () => {
  for (const filePath of [codeFile, passwordFile]) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) {
      // ignore
    }
  }

  const client = new TelegramClient(
    new StringSession(''),
    apiId,
    apiHash,
    getTelegramClientOptions({ connectionRetries: 5 }),
  );

  let passwordAttempts = 0;
  await client.start({
    phoneNumber: async () => phone,
    phoneCode: async () => waitForFileValue(codeFile, 'Telegram login code'),
    password: async () => {
      passwordAttempts += 1;
      if (passwordAttempts > 3) {
        throw new Error('Too many 2FA password attempts. Stop and retry later.');
      }
      return waitForFileValue(passwordFile, '2FA password');
    },
    onError: (error) => {
      const message = String(error?.message || error || '');
      console.error(message);
      if (/wait of \d+ seconds is required/i.test(message)) {
        throw error;
      }
    },
  });

  console.log('\nTELEGRAM_SESSION=');
  console.log(client.session.save());
  await client.disconnect();
})().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
