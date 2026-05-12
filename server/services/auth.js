const openid = require('openid');
const url = require('url');

const OPENID_CHECK = {
  ns: 'http://specs.openid.net/auth/2.0',
  op_endpoint: 'https://steamcommunity.com/openid/login',
  claimed_id: 'https://steamcommunity.com/openid/id/',
  identity: 'https://steamcommunity.com/openid/id/',
};

let relyingParty;

function getBaseUrl() {
  return String(process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
}

function getRelyingParty() {
  if (!relyingParty) {
    const baseUrl = getBaseUrl();
    relyingParty = new openid.RelyingParty(
      `${baseUrl}/api/auth/steam/callback`,
      baseUrl,
      true,
      true,
      [],
    );
  }
  return relyingParty;
}

async function getSteamRedirectUrl() {
  return new Promise((resolve, reject) => {
    getRelyingParty().authenticate('https://steamcommunity.com/openid', false, (error, authUrl) => {
      if (error) {
        const err = new Error((error && error.message) || String(error) || 'Steam OpenID failed to start.');
        err.status = 502;
        err.code = 'steam_openid_start_failed';
        reject(err);
        return;
      }
      if (!authUrl) {
        const err = new Error('Steam OpenID did not return a redirect URL.');
        err.status = 502;
        err.code = 'steam_openid_no_redirect';
        reject(err);
        return;
      }
      resolve(authUrl);
    });
  });
}

async function authenticateSteam(req) {
  const searchParams = url.parse(req.url || '', true).query || {};

  if (searchParams['openid.ns'] !== OPENID_CHECK.ns) {
    const err = new Error('Claimed identity is not valid.');
    err.status = 400;
    err.code = 'invalid_openid_response';
    throw err;
  }
  if (searchParams['openid.op_endpoint'] !== OPENID_CHECK.op_endpoint) {
    const err = new Error('Claimed identity is not valid.');
    err.status = 400;
    err.code = 'invalid_openid_response';
    throw err;
  }
  if (!String(searchParams['openid.claimed_id'] || '').startsWith(OPENID_CHECK.claimed_id)) {
    const err = new Error('Claimed identity is not valid.');
    err.status = 400;
    err.code = 'invalid_openid_response';
    throw err;
  }
  if (!String(searchParams['openid.identity'] || '').startsWith(OPENID_CHECK.identity)) {
    const err = new Error('Claimed identity is not valid.');
    err.status = 400;
    err.code = 'invalid_openid_response';
    throw err;
  }

  return new Promise((resolve, reject) => {
    getRelyingParty().verifyAssertion(req, (error, result) => {
      if (error) {
        const err = new Error((error && error.message) || String(error) || 'Steam OpenID verification failed.');
        err.status = 401;
        err.code = 'steam_openid_verify_failed';
        reject(err);
        return;
      }
      if (!result || !result.authenticated) {
        const err = new Error('Failed to authenticate user.');
        err.status = 401;
        err.code = 'steam_openid_not_authenticated';
        reject(err);
        return;
      }
      const claimed = String(result.claimedIdentifier || '');
      if (!/^https?:\/\/steamcommunity\.com\/openid\/id\/\d+$/.test(claimed)) {
        const err = new Error('Claimed identity is not valid.');
        err.status = 400;
        err.code = 'invalid_openid_claim';
        reject(err);
        return;
      }
      const steamId = claimed.replace(/^https?:\/\/steamcommunity\.com\/openid\/id\//, '').trim();
      if (!/^\d{17}$/.test(steamId)) {
        const err = new Error('Steam authentication succeeded but did not return a valid SteamID64.');
        err.status = 502;
        err.code = 'invalid_steam_auth_response';
        reject(err);
        return;
      }
      resolve({
        steamId,
        raw: {
          claimedIdentifier: claimed,
          steamid: steamId,
        },
      });
    });
  });
}

module.exports = {
  getSteamRedirectUrl,
  authenticateSteam,
};
