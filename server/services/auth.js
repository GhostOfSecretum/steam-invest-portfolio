const { isSteamCommunityCoolingDown, markCommunityRateLimited } = require('./steam');

const STEAM_OPENID = {
  ns: 'http://specs.openid.net/auth/2.0',
  opEndpoint: 'https://steamcommunity.com/openid/login',
  claimedIdPrefix: 'https://steamcommunity.com/openid/id/',
  identifierSelect: 'http://specs.openid.net/auth/2.0/identifier_select',
};

const VERIFY_TIMEOUT_MS = 8000;
const OPENID_PROXY_UA = 'Mozilla/5.0';
const OPENID_BLOCK_MS = 30 * 60 * 1000;

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

function normalizeOpenIdBody(body) {
  let text = String(body || '').replace(/\\([_*])/g, '$1');
  const markdownIdx = text.search(/Markdown Content:\s*/i);
  if (markdownIdx >= 0) {
    text = text.slice(markdownIdx).replace(/^Markdown Content:\s*/i, '');
  }
  return text;
}

function openIdValidity(body) {
  const payload = normalizeOpenIdBody(body);
  if (/is_valid\s*:\s*true\b/i.test(payload)) return true;
  if (/is_valid\s*:\s*false\b/i.test(payload)) return false;
  return null;
}

function looksLikeOpenIdAssertion(body) {
  return openIdValidity(body) != null;
}

function bodySnippet(body) {
  return String(body || '').replace(/\s+/g, ' ').slice(0, 180);
}

function markOpenIdOriginBlocked(retryAfterSec) {
  markCommunityRateLimited(retryAfterSec, { minMs: OPENID_BLOCK_MS });
}

async function postOpenIdDirect(body) {
  let response;
  try {
    response = await fetch(STEAM_OPENID.opEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/plain,text/html,*/*',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error?.name === 'TimeoutError' || error?.cause?.name === 'TimeoutError'
      ? `timeout after ${VERIFY_TIMEOUT_MS}ms`
      : ((error && error.message) || 'Steam OpenID verification failed.');
    console.warn(`[auth] Steam OpenID direct verify failed: ${reason}`);
    throw authError(
      'Steam did not answer the login check. Please try again in a moment.',
      502,
      'steam_openid_verify_failed',
    );
  }

  const text = await response.text();
  if (looksLikeOpenIdAssertion(text)) return text;

  console.warn(`[auth] Steam OpenID direct verify HTTP ${response.status} (not an OpenID assertion): ${bodySnippet(text)}`);
  if (response.status === 403 || response.status === 429 || response.ok) {
    markOpenIdOriginBlocked(Number(response.headers.get('retry-after')));
  }
  throw authError(`Steam returned HTTP ${response.status}.`, 502, 'steam_openid_verify_failed');
}

async function fetchOpenIdViaProxy(body) {
  const target = `${STEAM_OPENID.opEndpoint}?${body}`;
  const response = await fetch(`https://r.jina.ai/${target}`, {
    headers: {
      Accept: 'text/plain,text/html,*/*',
      'User-Agent': OPENID_PROXY_UA,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    throw authError(
      'Steam did not answer the login check. Please try again in a moment.',
      502,
      'steam_openid_verify_failed',
    );
  }
  return response.text();
}

async function postOpenIdVerification(body) {
  if (!isSteamCommunityCoolingDown()) {
    try {
      return await postOpenIdDirect(body);
    } catch (error) {
      console.warn('[auth] Steam OpenID direct verify failed, using proxy:', error.message);
    }
  } else {
    console.warn('[auth] Steam community is cooling down; verifying OpenID via proxy');
  }
  return fetchOpenIdViaProxy(body);
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

  const body = await postOpenIdVerification(verifyParams.toString());
  const validity = openIdValidity(body);

  if (validity !== true) {
    console.warn(`[auth] Steam OpenID assertion rejected (${validity == null ? 'no is_valid field' : 'is_valid:false'}): ${bodySnippet(body)}`);
    if (validity == null) {
      throw authError(
        'Steam did not answer the login check. Please try again in a moment.',
        502,
        'steam_openid_verify_failed',
      );
    }
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
