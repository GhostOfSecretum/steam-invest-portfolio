const STEAM_OPENID = {
  ns: 'http://specs.openid.net/auth/2.0',
  opEndpoint: 'https://steamcommunity.com/openid/login',
  claimedIdPrefix: 'https://steamcommunity.com/openid/id/',
  identifierSelect: 'http://specs.openid.net/auth/2.0/identifier_select',
};

function resolveBaseUrl(req) {
  const configured = String(process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;

  if (!req) {
    return `http://localhost:${process.env.PORT || 3000}`;
  }

  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  if (!host) {
    return `http://localhost:${process.env.PORT || 3000}`;
  }

  return `${proto}://${host}`;
}

function callbackUrl(baseUrl) {
  return `${baseUrl}/api/auth/steam/callback`;
}

function authError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function getOpenIdParams(req) {
  const rawUrl = String(req.originalUrl || req.url || '');
  const query = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?') + 1) : '';
  const parsed = new URLSearchParams(query);
  const params = {};
  for (const [key, value] of parsed.entries()) {
    if (key.startsWith('openid.')) params[key] = value;
  }
  return params;
}

async function getSteamRedirectUrl(req) {
  const baseUrl = resolveBaseUrl(req);
  const params = new URLSearchParams({
    'openid.ns': STEAM_OPENID.ns,
    'openid.mode': 'checkid_setup',
    'openid.return_to': callbackUrl(baseUrl),
    'openid.realm': baseUrl,
    'openid.identity': STEAM_OPENID.identifierSelect,
    'openid.claimed_id': STEAM_OPENID.identifierSelect,
  });
  return `${STEAM_OPENID.opEndpoint}?${params.toString()}`;
}

async function authenticateSteam(req) {
  const searchParams = getOpenIdParams(req);

  if (searchParams['openid.ns'] !== STEAM_OPENID.ns) {
    throw authError('Claimed identity is not valid.', 400, 'invalid_openid_response');
  }
  if (searchParams['openid.mode'] !== 'id_res') {
    throw authError('Claimed identity is not valid.', 400, 'invalid_openid_response');
  }
  if (searchParams['openid.op_endpoint'] !== STEAM_OPENID.opEndpoint) {
    throw authError('Claimed identity is not valid.', 400, 'invalid_openid_response');
  }
  if (searchParams['openid.return_to'] !== callbackUrl(resolveBaseUrl(req))) {
    throw authError('Claimed identity is not valid.', 400, 'invalid_openid_response');
  }
  if (!String(searchParams['openid.claimed_id'] || '').startsWith(STEAM_OPENID.claimedIdPrefix)) {
    throw authError('Claimed identity is not valid.', 400, 'invalid_openid_response');
  }
  if (!String(searchParams['openid.identity'] || '').startsWith(STEAM_OPENID.claimedIdPrefix)) {
    throw authError('Claimed identity is not valid.', 400, 'invalid_openid_response');
  }

  const verifyParams = new URLSearchParams(searchParams);
  verifyParams.set('openid.mode', 'check_authentication');

  let body;
  try {
    const response = await fetch(STEAM_OPENID.opEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: verifyParams.toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw authError(`Steam returned HTTP ${response.status}.`, 502, 'steam_openid_verify_failed');
    }
    body = await response.text();
  } catch (error) {
    if (error && error.code === 'steam_openid_verify_failed') throw error;
    throw authError(
      (error && error.message) || 'Steam OpenID verification failed.',
      502,
      'steam_openid_verify_failed',
    );
  }

  if (!/(^|\n)is_valid\s*:\s*true(\r?\n|$)/.test(body)) {
    throw authError('Failed to authenticate user.', 401, 'steam_openid_not_authenticated');
  }

  const claimed = String(searchParams['openid.claimed_id'] || '');
  if (!/^https?:\/\/steamcommunity\.com\/openid\/id\/\d+$/.test(claimed)) {
    throw authError('Claimed identity is not valid.', 400, 'invalid_openid_claim');
  }
  const steamId = claimed.replace(/^https?:\/\/steamcommunity\.com\/openid\/id\//, '').trim();
  if (!/^\d{17}$/.test(steamId)) {
    throw authError(
      'Steam authentication succeeded but did not return a valid SteamID64.',
      502,
      'invalid_steam_auth_response',
    );
  }

  return {
    steamId,
    raw: {
      claimedIdentifier: claimed,
      steamid: steamId,
    },
  };
}

module.exports = {
  resolveBaseUrl,
  getSteamRedirectUrl,
  authenticateSteam,
};
