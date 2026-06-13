require('dotenv').config();

const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');

const envPath = path.resolve(process.cwd(), process.env.ENV_FILE || '.env');
const session = String(process.argv[2] || process.env.TELEGRAM_SESSION || '').trim();

async function readSessionFromStdin() {
  const rl = readline.createInterface({ input, output });
  try {
    return String(await rl.question('Paste TELEGRAM_SESSION value: ')).trim();
  } finally {
    rl.close();
  }
}

function updateEnvFile(nextSession) {
  const lines = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
    : [];
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (!line.startsWith('TELEGRAM_SESSION=')) return line;
    replaced = true;
    return `TELEGRAM_SESSION=${nextSession}`;
  });
  if (!replaced) nextLines.push(`TELEGRAM_SESSION=${nextSession}`);
  fs.writeFileSync(envPath, `${nextLines.filter((line, index, arr) => line.length || index < arr.length - 1).join('\n')}\n`, 'utf8');
}

(async () => {
  const nextSession = session || await readSessionFromStdin();
  if (!nextSession) {
    console.error('Telegram session value is required.');
    process.exit(1);
  }
  updateEnvFile(nextSession);
  console.log(`Updated TELEGRAM_SESSION in ${envPath}`);
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
