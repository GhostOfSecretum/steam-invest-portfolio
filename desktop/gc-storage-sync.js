const path = require('path');
const { app } = require('electron');
const Store = require('electron-store');
const SteamUser = require('steam-user');
const GlobalOffensive = require('globaloffensive');
const { LoginSession, EAuthTokenPlatformType } = require('steam-session');
const { buildItemFields } = require('./gc-item-names');
const { t, DEFAULT_LANG, normalizeLang } = require('./i18n');

const langStore = new Store({ encryptionKey: 'steam-invest-local-only' });
function tx(key, vars) {
  return t(normalizeLang(langStore.get('lang', DEFAULT_LANG)), key, vars);
}

const STORAGE_UNIT_DEF_INDEX = 1201;
const GC_CONNECT_TIMEOUT_MS = 120000;
const CASKET_DELAY_MS = 400;
const LOGON_RETRIES = 3;

function getCacheDir() {
  return path.join(app.getPath('userData'), 'gc-schema');
}

function isSessionReplacedError(err) {
  const msg = String(err?.message || err || '');
  return msg.includes('LogonSessionReplaced') || err?.eresult === 34;
}

async function renewRefreshToken(refreshToken) {
  const loginSession = new LoginSession(EAuthTokenPlatformType.SteamClient);
  loginSession.refreshToken = refreshToken;
  // steam-session never had startWithRefresh; renewRefreshToken is the method
  // that both refreshes the access token and may rotate the refresh token.
  await loginSession.renewRefreshToken();
  if (!loginSession.refreshToken) {
    throw new Error(tx('errNoStorageRefreshToken'));
  }
  return loginSession.refreshToken;
}

function getCasketContentsAsync(csgo, casketId) {
  return new Promise((resolve, reject) => {
    csgo.getCasketContents(String(casketId), (err, items) => {
      if (err) reject(err);
      else resolve(items || []);
    });
  });
}

function waitForGc(csgo, user) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Game Coordinator connection timed out'));
    }, GC_CONNECT_TIMEOUT_MS);

    const onConnected = () => {
      cleanup();
      resolve();
    };

    const onError = (err) => {
      cleanup();
      reject(err || new Error('Steam client error'));
    };

    const cleanup = () => {
      clearTimeout(timer);
      csgo.removeListener('connectedToGC', onConnected);
      user.removeListener('error', onError);
    };

    if (csgo.haveGCSession) {
      cleanup();
      resolve();
      return;
    }

    csgo.once('connectedToGC', onConnected);
    user.once('error', onError);
  });
}

function logOnWithToken(user, refreshToken, expectedSteamId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Steam login timed out'));
    }, GC_CONNECT_TIMEOUT_MS);

    const onLoggedOn = () => {
      const actual = user.steamID?.getSteamID64?.();
      if (expectedSteamId && actual && actual !== expectedSteamId) {
        cleanup();
        user.logOff();
        reject(new Error('Steam account does not match paired profile'));
        return;
      }
      user.requestFreeLicense([730], (err) => {
        if (err) console.warn('[gc-storage] free license request:', err.message);
        user.gamesPlayed([730], true);
      });
      cleanup();
      resolve();
    };

    const onError = (err) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timer);
      user.removeListener('loggedOn', onLoggedOn);
      user.removeListener('error', onError);
    };

    user.once('loggedOn', onLoggedOn);
    user.once('error', onError);
    user.logOn({
      refreshToken,
      machineName: 'SteamInvestPortfolio',
    });
  });
}

async function connectSteamUser(user, refreshToken, expectedSteamId) {
  let token = refreshToken;
  let lastError = null;

  for (let attempt = 1; attempt <= LOGON_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        token = await renewRefreshToken(token);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
      await logOnWithToken(user, token, expectedSteamId);
      return token;
    } catch (err) {
      lastError = err;
      console.warn(`[gc-storage] logon attempt ${attempt}/${LOGON_RETRIES}:`, err.message);
      if (!isSessionReplacedError(err) || attempt === LOGON_RETRIES) {
        throw err;
      }
      try {
        user.logOff();
      } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  throw lastError || new Error('Steam login failed');
}

async function mapGcItem(gcItem, storageUnitId, storageUnitName) {
  const fields = await buildItemFields(gcItem, getCacheDir());
  return {
    assetid: String(gcItem.id),
    classid: String(gcItem.def_index || ''),
    instanceid: '0',
    amount: Number(gcItem.quantity || 1),
    ...fields,
    marketUrl: fields.marketHashName
      ? `https://steamcommunity.com/market/listings/730/${encodeURIComponent(fields.marketHashName)}`
      : null,
    descriptions: [],
    tags: [],
    inStorage: true,
    storageUnitId: String(storageUnitId),
    storageUnitName: storageUnitName || tx('storageUnitFallback'),
  };
}

async function fetchStorageContents(refreshToken, expectedSteamId) {
  let token = refreshToken;
  try {
    token = await renewRefreshToken(refreshToken);
  } catch (err) {
    console.warn('[gc-storage] token pre-refresh failed, using stored token:', err.message);
  }

  const user = new SteamUser();
  const csgo = new GlobalOffensive(user);

  try {
    token = await connectSteamUser(user, token, expectedSteamId);
    await waitForGc(csgo, user);

    const caskets = (csgo.inventory || []).filter(
      (item) => item.def_index === STORAGE_UNIT_DEF_INDEX && (item.casket_contained_item_count || 0) > 0,
    );

    console.log(`[gc-storage] found ${caskets.length} Хранилищ with contents`);
    const results = [];

    for (const casket of caskets) {
      const unitName = casket.custom_name || tx('storageUnitFallback');
      const contents = await getCasketContentsAsync(csgo, casket.id);
      console.log(`[gc-storage] unit "${unitName}" (${casket.id}): ${contents.length} items`);
      for (const item of contents) {
        if (item.casket_id && String(item.casket_id) !== String(casket.id)) continue;
        results.push(await mapGcItem(item, casket.id, unitName));
      }
      if (caskets.length > 1) {
        await new Promise((r) => setTimeout(r, CASKET_DELAY_MS));
      }
    }

    return { items: results, refreshToken: token };
  } finally {
    try {
      user.logOff();
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 800));
  }
}

// Invalidates the token at Valve, so deleting our local copy is not the only
// thing standing between a stolen disk image and the account. Steam has no
// endpoint that accepts a bare refresh token: IAuthenticationService/RevokeToken
// needs an access token, and the only way to get one is to spend the refresh
// token first. RevokeRefreshToken would avoid that but requires a signature over
// the token id that only Steam's own clients can produce.
async function revokeRefreshToken(refreshToken) {
  const loginSession = new LoginSession(EAuthTokenPlatformType.SteamClient);
  loginSession.refreshToken = refreshToken;
  await loginSession.refreshAccessToken();
  if (!loginSession.accessToken) {
    throw new Error(tx('errNoRevokeAccessToken'));
  }

  const response = await fetch('https://api.steampowered.com/IAuthenticationService/RevokeToken/v1/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      access_token: loginSession.accessToken,
      token: refreshToken,
      // Permanent, not Logout: the point is to make the token unusable, not to
      // end one session.
      revoke_action: '1',
    }),
  });

  if (!response.ok) {
    throw new Error(tx('errSteamHttp', { status: response.status }));
  }
}

async function startQrLogin({ onQrUrl, onAuthenticated }) {
  const session = new LoginSession(EAuthTokenPlatformType.SteamClient);

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      session.removeAllListeners();
      fn(value);
    };

    session.on('authenticated', async () => {
      try {
        const refreshToken = session.refreshToken;
        const accountName = session.accountName;
        if (!refreshToken) throw new Error('No refresh token received from Steam');
        if (onAuthenticated) onAuthenticated({ accountName });
        finish(resolve, { refreshToken, accountName });
      } catch (err) {
        finish(reject, err);
      }
    });

    session.on('error', (err) => finish(reject, err));
    session.on('timeout', () => finish(reject, new Error('Steam login timed out')));

    session.startWithQR()
      .then(({ qrChallengeUrl }) => {
        if (onQrUrl) onQrUrl(qrChallengeUrl);
      })
      .catch((err) => finish(reject, err));
  });
}

module.exports = {
  fetchStorageContents,
  startQrLogin,
  revokeRefreshToken,
};
