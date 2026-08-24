/* global React */
const { useState: apiUseState, useEffect: apiUseEffect, useCallback: apiUseCallback, useRef: apiUseRef } = React;

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
  const [state, setState] = apiUseState({
    loading: true,
    connected: false,
    profile: null,
    error: null,
    subscription: null,
    beta: null,
    billingReady: false,
  });

  const refresh = apiUseCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const me = await apiFetch('/api/me');
      setState({
        loading: false,
        connected: Boolean(me.connected),
        profile: me.profile || null,
        error: null,
        steamApiKeyConfigured: me.steamApiKeyConfigured,
        subscription: me.subscription || null,
        beta: me.beta || me.subscription?.beta || null,
        billingReady: Boolean(me.billingReady),
      });
    } catch (error) {
      setState({
        loading: false,
        connected: false,
        profile: null,
        error,
        subscription: null,
        beta: null,
        billingReady: false,
      });
    }
  }, []);

  apiUseEffect(() => { refresh(); }, [refresh]);

  return {
    ...state,
    planId: state.subscription?.planId || 'free',
    entitlements: state.subscription?.entitlements || {
      itemDisplayLimit: null,
      desktopDownload: false,
      topInvestors: true,
    },
    login: () => {
      window.location.href = '/api/auth/steam';
    },
    logout: async () => {
      await apiFetch('/api/auth/logout', { method: 'POST' });
      await refresh();
    },
    refresh,
  };
}

async function unlockBetaViaTelegram(payload) {
  return apiFetch('/api/beta/telegram-unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
}

async function startInvestorTrial(payload) {
  return apiFetch('/api/trials/investor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
}

function useBetaConfig() {
  const [state, setState] = apiUseState({
    loading: true,
    beta: false,
    channelUrl: 'https://t.me/cs2skinshead',
    channelUsername: 'cs2skinshead',
    botUsername: null,
    unlockReady: false,
    channelUnlockReady: false,
    error: null,
  });

  const reload = apiUseCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await apiFetch('/api/beta');
      setState({
        loading: false,
        beta: Boolean(data.beta),
        channelUrl: data.channelUrl || 'https://t.me/cs2skinshead',
        channelUsername: data.channelUsername || 'cs2skinshead',
        botUsername: data.botUsername || null,
        unlockReady: Boolean(data.unlockReady),
        channelUnlockReady: Boolean(data.channelUnlockReady),
        error: null,
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error }));
    }
  }, []);

  apiUseEffect(() => { reload(); }, [reload]);

  return { ...state, reload };
}

function usePlans(locale) {
  const [state, setState] = apiUseState({
    loading: true,
    plans: [],
    current: null,
    billingReady: false,
    beta: null,
    error: null,
  });

  const reload = apiUseCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const lang = String(locale || '').trim();
      const data = await apiFetch(lang ? `/api/plans?locale=${encodeURIComponent(lang)}` : '/api/plans');
      setState({
        loading: false,
        plans: Array.isArray(data.plans) ? data.plans : [],
        current: data.current || null,
        billingReady: Boolean(data.billingReady),
        beta: data.beta || null,
        error: null,
      });
    } catch (error) {
      setState({ loading: false, plans: [], current: null, billingReady: false, beta: null, error });
    }
  }, [locale]);

  apiUseEffect(() => { reload(); }, [reload]);

  return { ...state, reload };
}

function useTopInvestors(enabled = true) {
  const [state, setState] = apiUseState({ loading: false, data: null, error: null, locked: false });

  const reload = apiUseCallback(async () => {
    if (!enabled) return;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await apiFetch('/api/top-investors');
      setState({ loading: false, data, error: null, locked: false });
    } catch (error) {
      setState({
        loading: false,
        data: null,
        error,
        locked: error?.code === 'plan_required',
      });
    }
  }, [enabled]);

  apiUseEffect(() => { reload(); }, [reload]);

  return { ...state, reload };
}

function useTopInvestorsActivityFeed(enabled = true) {
  const [state, setState] = apiUseState({ loading: false, data: null, error: null });

  const reload = apiUseCallback(async ({ silent = false } = {}) => {
    if (!enabled) return;
    setState((current) => ({
      ...current,
      loading: silent && current.data ? current.loading : true,
      error: null,
    }));
    try {
      const data = await apiFetch('/api/top-investors/activity');
      setState({ loading: false, data, error: null });
    } catch (error) {
      setState((current) => ({
        loading: false,
        data: silent ? current.data : null,
        error,
      }));
    }
  }, [enabled]);

  apiUseEffect(() => {
    reload();
    if (!enabled) return undefined;
    const timer = setInterval(() => reload({ silent: true }), 20000);
    return () => clearInterval(timer);
  }, [reload, enabled]);

  return { ...state, reload };
}

function useTopInvestorActivity(steamId, enabled = true) {
  const [state, setState] = apiUseState({ loading: false, syncing: false, data: null, error: null });
  const requestSeq = apiUseRef(0);

  const load = apiUseCallback(async ({ sync = false, silent = false } = {}) => {
    const id = String(steamId || '').trim();
    if (!enabled || !/^\d{17}$/.test(id)) {
      setState({ loading: false, syncing: false, data: null, error: null });
      return;
    }

    const seq = ++requestSeq.current;
    setState((current) => ({
      ...current,
      loading: silent && current.data ? current.loading : true,
      syncing: Boolean(sync),
      error: null,
    }));

    try {
      const suffix = sync ? '?sync=1' : '';
      const data = await apiFetch(`/api/top-investors/${encodeURIComponent(id)}/activity${suffix}`);
      if (seq !== requestSeq.current) return;
      setState({ loading: false, syncing: false, data, error: null });
    } catch (error) {
      if (seq !== requestSeq.current) return;
      setState((current) => ({
        loading: false,
        syncing: false,
        data: silent ? current.data : null,
        error,
      }));
    }
  }, [enabled, steamId]);

  apiUseEffect(() => {
    load({ sync: false });
    if (!enabled) return undefined;
    const timer = setInterval(() => load({ sync: false, silent: true }), 20000);
    return () => clearInterval(timer);
  }, [load, enabled]);

  const sync = apiUseCallback(() => load({ sync: true }), [load]);

  return { ...state, reload: () => load({ sync: false }), sync };
}

function usePortfolio(auth, portfolioId = null, publicProfileUrl = '') {
  const [state, setState] = apiUseState({ loading: false, data: null, error: null });
  const requestSeq = apiUseRef(0);

  const load = apiUseCallback(async (sync = false) => {
    const seq = ++requestSeq.current;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const params = new URLSearchParams();
      if (sync) params.set('sync', '1');
      if (publicProfileUrl) {
        params.set('profile', publicProfileUrl);
      } else if (portfolioId) {
        params.set('portfolioId', portfolioId);
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const endpoint = publicProfileUrl ? '/api/portfolio/public' : '/api/portfolio';
      const data = await apiFetch(`${endpoint}${suffix}`);
      // Ignore outdated responses when the user switches portfolios quickly.
      if (seq !== requestSeq.current) return;
      if (Number.isFinite(data?.steamRubRate) && data.steamRubRate > 0) {
        FX_RATES.rub = data.steamRubRate;
      }
      if (Number.isFinite(data?.steamCnyRate) && data.steamCnyRate > 0) {
        FX_RATES.cny = data.steamCnyRate;
      }
      setState({ loading: false, data, error: null });
    } catch (error) {
      if (seq !== requestSeq.current) return;
      setState((current) => ({ loading: false, data: current.data, error }));
    }
  }, [auth?.connected, portfolioId, publicProfileUrl]);

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
        if (Number.isFinite(data.steamCnyRate) && data.steamCnyRate > 0) {
          FX_RATES.cny = data.steamCnyRate;
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

function useItemHistory(marketHashName, days = 30, anchorPrice = null, currency = null) {
  const [state, setState] = apiUseState({ loading: false, data: null, error: null });
  const resolvedCurrency = currency || getActiveCurrency();

  apiUseEffect(() => {
    if (!marketHashName) return;
    let active = true;
    setState((prev) => ({ loading: true, data: prev.data, error: null }));
    const params = new URLSearchParams({
      days: String(days),
      marketHashName,
      currency: resolvedCurrency,
    });
    if (Number.isFinite(anchorPrice) && anchorPrice > 0) {
      params.set('anchor', String(anchorPrice));
    }
    apiFetch(`/api/market/history?${params.toString()}`)
      .then((data) => { if (active) setState({ loading: false, data, error: null }); })
      .catch((error) => { if (active) setState({ loading: false, data: null, error }); });
    return () => { active = false; };
  }, [marketHashName, days, anchorPrice, resolvedCurrency]);

  return state;
}

function useItemOffers(marketHashName, currency = null) {
  const [state, setState] = apiUseState({ loading: false, data: null, error: null });
  const resolvedCurrency = currency || getActiveCurrency();

  apiUseEffect(() => {
    if (!marketHashName) return;
    let active = true;
    setState((prev) => ({ loading: true, data: prev.data, error: null }));
    const params = new URLSearchParams({ marketHashName, currency: resolvedCurrency });
    apiFetch(`/api/market/offers?${params.toString()}`)
      .then((data) => { if (active) setState({ loading: false, data, error: null }); })
      .catch((error) => { if (active) setState({ loading: false, data: null, error }); });
    return () => { active = false; };
  }, [marketHashName, resolvedCurrency]);

  return state;
}

function useItemVariants(marketHashName, currency = null) {
  const [state, setState] = apiUseState({ loading: false, data: null, error: null });
  const resolvedCurrency = currency || getActiveCurrency();

  apiUseEffect(() => {
    if (!marketHashName) return;
    let active = true;
    setState((prev) => ({ loading: true, data: prev.data, error: null }));
    const params = new URLSearchParams({ marketHashName, currency: resolvedCurrency });
    apiFetch(`/api/market/variants?${params.toString()}`)
      .then((data) => { if (active) setState({ loading: false, data, error: null }); })
      .catch((error) => { if (active) setState({ loading: false, data: null, error }); });
    return () => { active = false; };
  }, [marketHashName, resolvedCurrency]);

  return state;
}

function useMultiWearHistory(names, days = 30, currency = null) {
  const [state, setState] = apiUseState({ loading: false, data: null, error: null });
  const resolvedCurrency = currency || getActiveCurrency();
  const list = Array.isArray(names) ? names.filter(Boolean) : [];
  const depKey = list.join('||');

  apiUseEffect(() => {
    if (!list.length) {
      setState({ loading: false, data: null, error: null });
      return;
    }
    let active = true;
    setState((prev) => ({ loading: true, data: prev.data, error: null }));
    const params = new URLSearchParams({ days: String(days), currency: resolvedCurrency });
    for (const name of list) params.append('names', name);
    apiFetch(`/api/market/history-multi?${params.toString()}`)
      .then((data) => { if (active) setState({ loading: false, data, error: null }); })
      .catch((error) => { if (active) setState({ loading: false, data: null, error }); });
    return () => { active = false; };
  }, [depKey, days, resolvedCurrency]);

  return state;
}

function useArmoryRoi(currency = null) {
  const [state, setState] = apiUseState({ loading: true, data: null, error: null });
  const resolvedCurrency = currency || getActiveCurrency();
  // Server Armory ROI currently prices in USD/RUB; CNY is converted client-side.
  const apiCurrency = resolvedCurrency === 'cny' ? 'usd' : resolvedCurrency;

  const load = apiUseCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await apiFetch(`/api/armory/roi?currency=${encodeURIComponent(apiCurrency)}`);
      if (Number.isFinite(data.rubPerUsd) && data.rubPerUsd > 0) {
        FX_RATES.rub = data.rubPerUsd;
      }
      setState({ loading: false, data, error: null });
    } catch (error) {
      setState({ loading: false, data: null, error });
    }
  }, [apiCurrency]);

  apiUseEffect(() => { load(); }, [load]);

  return { ...state, reload: load };
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
  cny: 7.25,
};

const CURRENCIES = ['usd', 'rub', 'cny'];

function getRubPerUsdRate() {
  return FX_RATES.rub || 92;
}

function getCnyPerUsdRate() {
  return FX_RATES.cny || 7.25;
}

function usdBasisToInputDraft(usdAmount, currencyKey) {
  const key = normalizeCurrencyCode(currencyKey) || getActiveCurrency();
  if (!Number.isFinite(usdAmount)) return '';
  if (key === 'usd') return String(Math.round(usdAmount * 100) / 100);
  if (key === 'rub') return String(Math.round(usdAmount * getRubPerUsdRate() * 100) / 100);
  if (key === 'cny') return String(Math.round(usdAmount * getCnyPerUsdRate() * 100) / 100);
  return String(usdAmount);
}

const CURRENCY_META = {
  usd: { locale: 'en-US', currency: 'USD' },
  rub: { locale: 'ru-RU', currency: 'RUB' },
  cny: { locale: 'zh-CN', currency: 'CNY' },
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

// Prefer Steam's native price for the active currency when available, so we don't
// drift from steamcommunity.com due to FX conversion. Falls back to USD * rate.
function formatItemPrice(item, fallbackUsd, { digits = 2 } = {}) {
  const currencyKey = getActiveCurrency();
  if (currencyKey === 'rub' && Number.isFinite(item?.priceRub)) {
    return formatMoney(item.priceRub, { digits, currency: 'rub' });
  }
  const usdValue = Number.isFinite(fallbackUsd) ? fallbackUsd : item?.value ?? item?.price;
  return formatMoney(usdValue, { digits });
}

// Portfolio row / stack total: prefer native Steam RUB asks so the list matches the
// item page and steamcommunity.com (USD × default FX 92 drifts by ~10–15%).
function formatHoldingValue(item, { digits = 2, compact = false } = {}) {
  const qty = Number(item?.qty) > 0 ? Number(item.qty) : 1;
  const currencyKey = getActiveCurrency();
  if (currencyKey === 'rub' && Number.isFinite(item?.priceRub)) {
    return formatMoney(item.priceRub * qty, { digits, compact, currency: 'rub' });
  }
  const usdTotal = Number.isFinite(item?.totalValue)
    ? item.totalValue
    : (Number.isFinite(item?.value) ? item.value * qty : null);
  return formatMoney(usdTotal, { digits, compact });
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

function useItemBySlug(slug, enabled = true) {
  const [state, setState] = apiUseState({ loading: false, data: null, error: null });

  apiUseEffect(() => {
    if (!enabled || !slug) {
      setState({ loading: false, data: null, error: null });
      return undefined;
    }

    let active = true;
    setState({ loading: true, data: null, error: null });
    apiFetch(`/api/items/by-slug/${encodeURIComponent(slug)}`)
      .then((payload) => {
        if (!active) return;
        setState({ loading: false, data: payload.item || null, error: null });
      })
      .catch((error) => {
        if (!active) return;
        setState({ loading: false, data: null, error });
      });

    return () => { active = false; };
  }, [slug, enabled]);

  return state;
}

function useCollectionBySlug(slug, enabled = true) {
  const [state, setState] = apiUseState({
    loading: false,
    data: null,
    error: null,
    page: 1,
  });

  const loadPage = apiUseCallback(async (page, { append = false } = {}) => {
    if (!slug) return;
    setState((current) => ({
      ...current,
      loading: true,
      error: null,
      data: append ? current.data : null,
    }));
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '24' });
      const payload = await apiFetch(`/api/collections/${encodeURIComponent(slug)}?${params}`);
      setState((current) => {
        const prevItems = append && current.data?.items ? current.data.items : [];
        const nextItems = [...prevItems, ...(payload.items || [])];
        return {
          loading: false,
          error: null,
          page,
          data: {
            ...payload,
            items: nextItems,
          },
        };
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error,
        data: append ? current.data : null,
      }));
    }
  }, [slug]);

  apiUseEffect(() => {
    if (!enabled || !slug) {
      setState({ loading: false, data: null, error: null, page: 1 });
      return undefined;
    }
    loadPage(1, { append: false });
    return undefined;
  }, [slug, enabled, loadPage]);

  const loadMore = apiUseCallback(() => {
    if (!state.data?.hasMore || state.loading) return;
    loadPage(state.page + 1, { append: true });
  }, [loadPage, state.data?.hasMore, state.loading, state.page]);

  return { ...state, loadMore, reload: () => loadPage(1, { append: false }) };
}

function useFavoriteProfiles() {
  const [state, setState] = apiUseState({ loading: true, profiles: [], error: null });

  const reload = apiUseCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await apiFetch('/api/favorite-profiles');
      setState({ loading: false, profiles: Array.isArray(data.profiles) ? data.profiles : [], error: null });
    } catch (error) {
      setState({ loading: false, profiles: [], error });
    }
  }, []);

  apiUseEffect(() => { reload(); }, [reload]);

  const add = apiUseCallback(async (payload) => {
    const data = await apiFetch('/api/favorite-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await reload();
    return data.profile;
  }, [reload]);

  const remove = apiUseCallback(async (steamId) => {
    await apiFetch(`/api/favorite-profiles/${encodeURIComponent(steamId)}`, { method: 'DELETE' });
    await reload();
  }, [reload]);

  const isFavorite = apiUseCallback((steamId) => {
    const id = String(steamId || '');
    return state.profiles.some((entry) => entry.steamId === id);
  }, [state.profiles]);

  return { ...state, reload, add, remove, isFavorite };
}

Object.assign(window, {
  apiFetch,
  useAuth,
  unlockBetaViaTelegram,
  startInvestorTrial,
  useBetaConfig,
  usePortfolio,
  useFavoriteProfiles,
  usePlans,
  useTopInvestors,
  useTopInvestorsActivityFeed,
  useTopInvestorActivity,
  useMarketSnapshot,
  useMarketCatalog,
  useItemHistory,
  useItemOffers,
  useItemVariants,
  useMultiWearHistory,
  useItemBySlug,
  useCollectionBySlug,
  useArmoryRoi,
  useCsNews,
  formatMoney,
  formatUsd,
  formatItemMoney,
  formatItemPrice,
  formatHoldingValue,
  compactUsd,
  getActiveCurrency,
  getRubPerUsdRate,
  getCnyPerUsdRate,
  CURRENCIES,
  usdBasisToInputDraft,
  withSteamImageSize,
});
