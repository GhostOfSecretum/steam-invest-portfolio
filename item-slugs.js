/* Shared slug helpers for CS2 market_hash_name URLs. */
(function initItemSlugs(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined') {
    root.ItemSlugs = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createItemSlugs() {
  const WEAR_SLUGS = [
    ['factory-new', 'Factory New'],
    ['minimal-wear', 'Minimal Wear'],
    ['field-tested', 'Field-Tested'],
    ['well-worn', 'Well-Worn'],
    ['battle-scarred', 'Battle-Scarred'],
  ];

  const WEAR_LABEL_TO_SLUG = Object.fromEntries(WEAR_SLUGS.map(([slug, label]) => [label, slug]));

  // Sticker / patch / charm finishes living in trailing parentheses (not weapon wear).
  const FINISH_SLUGS = [
    ['lenticular', 'Lenticular'],
    ['glitter', 'Glitter'],
    ['holo', 'Holo'],
    ['foil', 'Foil'],
    ['gold', 'Gold'],
  ];

  const FINISH_LABEL_TO_SLUG = Object.fromEntries(FINISH_SLUGS.map(([slug, label]) => [label, slug]));
  const FINISH_LABEL_PATTERN = FINISH_SLUGS.map(([, label]) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const FINISH_PAREN_RE = new RegExp(`\\((${FINISH_LABEL_PATTERN})\\)$`, 'i');

  const CURATED_MARKET_HASH_NAMES = [
    'AK-47 | Redline (Field-Tested)',
    'M4A4 | Asiimov (Battle-Scarred)',
    'AWP | Dragon Lore (Factory New)',
    'Karambit | Doppler (Factory New)',
    'Glock-18 | Fade (Factory New)',
    'M4A1-S | Hyper Beast (Minimal Wear)',
    'Desert Eagle | Blaze (Factory New)',
    'USP-S | Kill Confirmed (Field-Tested)',
    'Butterfly Knife | Tiger Tooth (Factory New)',
    'AWP | Lightning Strike (Factory New)',
    'AK-47 | Vulcan (Minimal Wear)',
    "Sport Gloves | Pandora's Box (Field-Tested)",
    'AK-47 | Wild Lotus (Minimal Wear)',
    'M4A4 | Howl (Minimal Wear)',
    'AWP | Dragon Lore (Minimal Wear)',
    'StatTrak™ AK-47 | Redline (Field-Tested)',
    '★ Butterfly Knife | Fade (Factory New)',
  ];

  const WEAPON_PREFIXES = [
    'sport gloves', 'driver gloves', 'hand wraps', 'moto gloves', 'specialist gloves',
    'broken fang gloves', 'hydra gloves', 'bloodhound gloves',
    'm4a1-s', 'glock-18', 'desert eagle', 'usp-s', 'dual berettas', 'five-seven', 'cz75-auto',
    'butterfly knife', 'karambit', 'm9 bayonet', 'bayonet', 'flip knife', 'gut knife',
    'huntsman knife', 'falchion knife', 'bowie knife', 'shadow daggers', 'navaja knife',
    'stiletto knife', 'talon knife', 'ursus knife', 'classic knife', 'paracord knife',
    'survival knife', 'nomad knife', 'skeleton knife',
    'ak-47', 'm4a4', 'awp', 'aug', 'sg 553', 'famas', 'galil ar', 'ssg 08', 'scar-20', 'g3sg1',
    'mac-10', 'mp9', 'mp7', 'ump-45', 'p90', 'pp-bizon', 'mp5-sd',
    'nova', 'xm1014', 'sawed-off', 'mag-7', 'negev', 'm249',
    'tec-9', 'p250', 'r8 revolver',
  ].sort((a, b) => b.length - a.length);

  const SKIN_OVERRIDES = {
    'pandoras box': "Pandora's Box",
    'howl': 'Howl',
    'dragon lore': 'Dragon Lore',
    'wild lotus': 'Wild Lotus',
    'kill confirmed': 'Kill Confirmed',
    'hyper beast': 'Hyper Beast',
    'lightning strike': 'Lightning Strike',
    'tiger tooth': 'Tiger Tooth',
  };

  function marketHashNameToSlug(marketHashName) {
    let name = String(marketHashName || '').trim();
    let prefix = '';
    if (name.startsWith('StatTrak™ ')) {
      prefix = 'stattrak-';
      name = name.slice('StatTrak™ '.length);
    } else if (name.startsWith('Souvenir ')) {
      prefix = 'souvenir-';
      name = name.slice('Souvenir '.length);
    }
    if (name.startsWith('★ ')) name = name.slice(2);

    let wearSlug = '';
    const wearMatch = name.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/);
    if (wearMatch) {
      wearSlug = WEAR_LABEL_TO_SLUG[wearMatch[1]] || '';
      name = name.replace(/\s*\([^)]+\)\s*$/, '').trim();
    }

    let finishSlug = '';
    const finishMatch = name.match(new RegExp(`\\s*\\((${FINISH_LABEL_PATTERN})\\)\\s*`, 'i'));
    if (finishMatch) {
      const finishLabel = FINISH_SLUGS.find(([, label]) => label.toLowerCase() === finishMatch[1].toLowerCase())?.[1];
      finishSlug = finishLabel ? (FINISH_LABEL_TO_SLUG[finishLabel] || '') : '';
      name = name
        .replace(finishMatch[0], ' ')
        .replace(/\s*\|\s*\|/g, ' | ')
        .replace(/\s+/g, ' ')
        .replace(/\s*\|\s*$/g, '')
        .trim();
    }

    const core = name
      .toLowerCase()
      .replace(/'/g, '')
      .replace(/\|/g, ' ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-');

    let slug = `${prefix}${core}`;
    if (finishSlug) slug += `-${finishSlug}`;
    if (wearSlug) slug += `-${wearSlug}`;
    return slug;
  }

  function parseSlug(slug) {
    let value = String(slug || '').toLowerCase().trim();
    if (!value) return null;

    let prefix = '';
    if (value.startsWith('stattrak-')) {
      prefix = 'stattrak';
      value = value.slice('stattrak-'.length);
    } else if (value.startsWith('souvenir-')) {
      prefix = 'souvenir';
      value = value.slice('souvenir-'.length);
    }

    let wear = null;
    for (const [wearSlug, wearLabel] of WEAR_SLUGS) {
      if (value.endsWith(`-${wearSlug}`)) {
        wear = wearLabel;
        value = value.slice(0, -(wearSlug.length + 1));
        break;
      }
    }

    let finish = null;
    for (const [finishSlug, finishLabel] of FINISH_SLUGS) {
      if (value.endsWith(`-${finishSlug}`)) {
        finish = finishLabel;
        value = value.slice(0, -(finishSlug.length + 1));
        break;
      }
    }

    return { prefix, wear, finish, core: value };
  }

  function splitCoreSlug(core) {
    const text = core.replace(/-/g, ' ');
    for (const weapon of WEAPON_PREFIXES) {
      if (text === weapon) return { weapon, skin: '' };
      if (text.startsWith(`${weapon} `)) {
        return { weapon, skin: text.slice(weapon.length + 1) };
      }
    }
    const idx = core.indexOf('-');
    if (idx === -1) return { weapon: core.replace(/-/g, ' '), skin: '' };
    return {
      weapon: core.slice(0, idx).replace(/-/g, ' '),
      skin: core.slice(idx + 1).replace(/-/g, ' '),
    };
  }

  function capitalizeSegment(segment) {
    return segment.split(' ').map((word) => {
      if (/^m\d/.test(word) || /^ak-/.test(word) || /^sg/.test(word) || /^ssg/.test(word) || /^cz/.test(word) || /^r8/.test(word) || /^mp/.test(word) || /^pp-/.test(word)) {
        return word.toUpperCase();
      }
      if (word.length <= 3 && word !== 'the') return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }

  function formatSkinName(skin) {
    const normalized = skin.trim().toLowerCase();
    if (!normalized) return '';
    if (SKIN_OVERRIDES[normalized]) return SKIN_OVERRIDES[normalized];
    return capitalizeSegment(normalized);
  }

  function slugToMarketHashName(slug) {
    const parsed = parseSlug(slug);
    if (!parsed) return null;

    const curated = SLUG_INDEX.get(slug);
    if (curated) return curated;

    const { weapon, skin } = splitCoreSlug(parsed.core);
    const weaponName = capitalizeSegment(weapon);
    const skinName = formatSkinName(skin);
    let prefix = '';
    if (parsed.prefix === 'stattrak') prefix = 'StatTrak™ ';
    if (parsed.prefix === 'souvenir') prefix = 'Souvenir ';

    let name = skinName ? `${weaponName} | ${skinName}` : weaponName;
    if (parsed.finish) name += ` (${parsed.finish})`;
    if (parsed.wear) name += ` (${parsed.wear})`;
    return `${prefix}${name}`;
  }

  function buildSlugIndex(items) {
    const map = new Map();
    for (const marketHashName of items) {
      map.set(marketHashNameToSlug(marketHashName), marketHashName);
    }
    return map;
  }

  const SLUG_INDEX = buildSlugIndex(CURATED_MARKET_HASH_NAMES);

  function getCuratedMarketHashNames() {
    return [...CURATED_MARKET_HASH_NAMES];
  }

  function getCuratedSlugs() {
    return CURATED_MARKET_HASH_NAMES.map((name) => marketHashNameToSlug(name));
  }

  function buildItemSeoMeta({ marketHashName, slug, price, iconUrl, siteUrl = 'https://skinshead.pro' }) {
    const safeSlug = slug || marketHashNameToSlug(marketHashName);
    const url = `${siteUrl}/item/${safeSlug}`;
    const priceLabel = Number.isFinite(price) ? ` — $${price.toFixed(2)}` : '';
    const title = `${marketHashName}${priceLabel} | CS2 price · SkinsHead`;
    const description = `Live CS2 price for ${marketHashName} on SkinsHead: market value, price history, and marketplace offers.`;
    const descriptionRu = `Цена CS2 для ${marketHashName} на SkinsHead: рыночная стоимость, история цены и предложения площадок.`;

    return {
      marketHashName,
      slug: safeSlug,
      url,
      title,
      description,
      descriptionRu,
      ogImage: iconUrl || `${siteUrl}/logo-cs2-candles-variant-02.png`,
    };
  }

  return {
    WEAR_SLUGS,
    CURATED_MARKET_HASH_NAMES,
    marketHashNameToSlug,
    parseSlug,
    slugToMarketHashName,
    getCuratedMarketHashNames,
    getCuratedSlugs,
    buildItemSeoMeta,
    SLUG_INDEX,
  };
});
