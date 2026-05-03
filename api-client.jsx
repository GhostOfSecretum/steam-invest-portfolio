/* global React */
const { useState: apiUseState, useEffect: apiUseEffect, useCallback: apiUseCallback } = React;

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Accept': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || `Request failed with ${response.status}`);
    error.status = response.status;
    error.code = data.code || 'request_failed';
    throw error;
  }

  return data;
}

function useAuth() {
  const [state, setState] = apiUseState({ loading: true, connected: false, profile: null, error: null });

  const refresh = apiUseCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const me = await apiFetch('/api/me');
      setState({ loading: false, connected: Boolean(me.connected), profile: me.profile || null, error: null, steamApiKeyConfigured: me.steamApiKeyConfigured });
    } catch (error) {
      setState({ loading: false, connected: false, profile: null, error });
    }
  }, []);

  apiUseEffect(() => { refresh(); }, [refresh]);

  return {
    ...state,
    login: () => {
      if (state.steamApiKeyConfigured === false) {
        window.alert('Add STEAM_API_KEY to .env and restart the server before linking Steam.');
        return;
      }
      window.location.href = '/api/auth/steam';
    },
    logout: async () => {
      await apiFetch('/api/auth/logout', { method: 'POST' });
      await refresh();
    },
    refresh,
  };
}

function usePortfolio(auth) {
  const [state, setState] = apiUseState({ loading: false, data: null, error: null });

  const load = apiUseCallback(async (sync = false) => {
    if (!auth?.connected) {
      setState({ loading: false, data: null, error: null });
      return;
    }

    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await apiFetch(`/api/portfolio${sync ? '?sync=1' : ''}`);
      setState({ loading: false, data, error: null });
    } catch (error) {
      setState({ loading: false, data: null, error });
    }
  }, [auth?.connected]);

  apiUseEffect(() => { load(false); }, [load]);

  return { ...state, reload: load };
}

function useMarketSnapshot(fallback = {}) {
  const [state, setState] = apiUseState({ loading: true, data: fallback, error: null });

  apiUseEffect(() => {
    let active = true;
    apiFetch('/api/market/snapshot')
      .then((data) => {
        if (!active) return;
        if (Number.isFinite(data.steamRubRate) && data.steamRubRate > 0) {
          FX_RATES.rub = data.steamRubRate;
        }
        setState({ loading: false, data, error: null });
      })
      .catch((error) => { if (active) setState({ loading: false, data: fallback, error }); });
    return () => { active = false; };
  }, []);

  return state;
}

function useMarketCatalog(params) {
  const [state, setState] = apiUseState({ loading: true, data: null, error: null });
  const query = params?.query || '';
  const page = params?.page || 1;
  const pageSize = params?.pageSize || 12;
  const category = params?.category || 'all';
  const rarity = params?.rarity || 'all';
  const wear = params?.wear || 'all';
  const special = params?.special || 'all';
  const sort = params?.sort || 'popular';

  apiUseEffect(() => {
    let active = true;
    const search = new URLSearchParams({
      query: String(query),
      page: String(page),
      pageSize: String(pageSize),
      category: String(category),
      rarity: String(rarity),
      wear: String(wear),
      special: String(special),
      sort: String(sort),
    });

    setState((current) => ({ loading: true, data: current.data, error: null }));
    apiFetch(`/api/market/catalog?${search}`)
      .then((data) => { if (active) setState({ loading: false, data, error: null }); })
      .catch((error) => { if (active) setState((current) => ({ loading: false, data: current.data, error })); });

    return () => { active = false; };
  }, [query, page, pageSize, category, rarity, wear, special, sort]);

  return state;
}

function useItemHistory(marketHashName, days = 30) {
  const [state, setState] = apiUseState({ loading: false, data: null, error: null });

  apiUseEffect(() => {
    if (!marketHashName) return;
    let active = true;
    setState((prev) => ({ loading: true, data: prev.data, error: null }));
    apiFetch(`/api/market/history?days=${days}&marketHashName=${encodeURIComponent(marketHashName)}`)
      .then((data) => { if (active) setState({ loading: false, data, error: null }); })
      .catch((error) => { if (active) setState({ loading: false, data: null, error }); });
    return () => { active = false; };
  }, [marketHashName, days]);

  return state;
}

function useCsNews() {
  const [state, setState] = apiUseState({ loading: true, data: null, error: null });

  const load = apiUseCallback(async () => {
    setState((current) => ({ loading: true, data: current.data, error: null }));
    try {
      const data = await apiFetch('/api/news/cs2');
      setState({ loading: false, data, error: null });
    } catch (error) {
      setState((current) => ({ loading: false, data: current.data, error }));
    }
  }, []);

  apiUseEffect(() => { load(); }, [load]);

  return { ...state, reload: load };
}

const FX_RATES = {
  usd: 1,
  rub: 92,
};

function getRubPerUsdRate() {
  return FX_RATES.rub || 92;
}

function usdBasisToInputDraft(usdAmount, currencyKey) {
  const key = normalizeCurrencyCode(currencyKey) || getActiveCurrency();
  if (!Number.isFinite(usdAmount)) return '';
  if (key === 'usd') return String(Math.round(usdAmount * 100) / 100);
  if (key === 'rub') return String(Math.round(usdAmount * getRubPerUsdRate() * 100) / 100);
  return String(usdAmount);
}

const CURRENCY_META = {
  usd: { locale: 'en-US', currency: 'USD' },
  rub: { locale: 'ru-RU', currency: 'RUB' },
};

function getActiveCurrency() {
  const key = String(window.__currency || 'usd').toLowerCase();
  return CURRENCY_META[key] ? key : 'usd';
}

function normalizeCurrencyCode(value) {
  const key = String(value || '').trim().toLowerCase();
  return CURRENCY_META[key] ? key : null;
}

function formatMoney(value, { digits = 2, compact = false, currency } = {}) {
  if (!Number.isFinite(value)) return 'N/A';
  const explicitCurrency = normalizeCurrencyCode(currency);
  const currencyKey = explicitCurrency || getActiveCurrency();
  const meta = CURRENCY_META[currencyKey];
  const converted = explicitCurrency ? value : value * (FX_RATES[currencyKey] || 1);
  return new Intl.NumberFormat(meta.locale, {
    style: 'currency',
    currency: meta.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    notation: compact ? 'compact' : 'standard',
    compactDisplay: compact ? 'short' : undefined,
  }).format(converted);
}

function formatUsd(value, digits = 2) {
  return formatMoney(value, { digits });
}

function formatItemMoney(value, currencyCode, digits = 2) {
  return formatMoney(value, { digits, currency: currencyCode });
}

function compactUsd(value, options = {}) {
  if (!Number.isFinite(value)) return formatMoney(0, { digits: 0, compact: Boolean(options.compact) });
  return formatMoney(value, {
    digits: options.digits ?? 0,
    compact: Boolean(options.compact),
  });
}

function withSteamImageSize(url, width = 640, height = 360) {
  if (!url || !String(url).includes('/economy/image/')) return url;
  const cleanUrl = String(url).replace(/\/\d+fx\d+f(?=$|[?#])/, '');
  return `${cleanUrl}/${width}fx${height}f`;
}

Object.assign(window, {
  apiFetch,
  useAuth,
  usePortfolio,
  useMarketSnapshot,
  useMarketCatalog,
  useItemHistory,
  useCsNews,
  formatUsd,
  formatItemMoney,
  compactUsd,
  getActiveCurrency,
  getRubPerUsdRate,
  usdBasisToInputDraft,
  withSteamImageSize,
});
