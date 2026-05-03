const SteamAuth = require('node-steam-openid');

let steamAuth;

function getSteamAuth() {
  if (!process.env.STEAM_API_KEY) {
    const error = new Error('STEAM_API_KEY is required for Steam login. Add it to .env.');
    error.status = 500;
    error.code = 'missing_steam_api_key';
    throw error;
  }

  if (!steamAuth) {
    const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    steamAuth = new SteamAuth({
      realm: baseUrl,
      returnUrl: `${baseUrl}/api/auth/steam/callback`,
      apiKey: process.env.STEAM_API_KEY,
    });
  }

  return steamAuth;
}

async function getSteamRedirectUrl() {
  return getSteamAuth().getRedirectUrl();
}

async function authenticateSteam(req) {
  const user = await getSteamAuth().authenticate(req);
  const steamId = String(user.steamid || user.id || user._json?.steamid || '').trim();

  if (!/^\d{17}$/.test(steamId)) {
    const error = new Error('Steam authentication succeeded but did not return a valid SteamID64.');
    error.status = 502;
    error.code = 'invalid_steam_auth_response';
    throw error;
  }

  return {
    steamId,
    raw: user,
  };
}

module.exports = {
  getSteamRedirectUrl,
  authenticateSteam,
};
