/**
 * Clash 精简动态版覆写脚本（按自建版兼容结构重构）
 */
function main(config) {
  if (!config || !Array.isArray(config.proxies)) return config;
  const existingGroups = Array.isArray(config['proxy-groups']) ? config['proxy-groups'] : [];
  const existingGroupMap = Object.fromEntries(existingGroups.map(g => [g.name, g]));
  const QURE_BASE = 'https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/';
  const qIcon = name => QURE_BASE + name + '.png';

  config.profile = {
    ...(config.profile || {}),
    'store-selected': true,
    'store-fake-ip': true
  };

  config['mixed-port'] = config['mixed-port'] || 7890;
  config['allow-lan'] = false;
  config['tcp-concurrent'] = config['tcp-concurrent'] ?? false;

  config['mode'] = 'rule';

  config['log-level'] = config['log-level'] || 'info';
  config.ipv6 = false;

  config['unified-delay'] = true;
  config['find-process-mode'] = 'strict';
  config['global-client-fingerprint'] = config['global-client-fingerprint'] || 'chrome';

  const localDns = ['223.5.5.5', '119.29.29.29'];
  const cnDns = ['https://dns.alidns.com/dns-query', 'https://doh.pub/dns-query', ...localDns];
  const trustDns = ['https://dns.cloudflare.com/dns-query', 'https://1.1.1.1/dns-query', 'https://dns.google/dns-query'];
  const directChoices = ['🇨🇳 直连 | IPv4优先', '🇨🇳 直连 | IPv6优先', '🇨🇳 直连 | 双栈', '全球直连'];

  config.dns = {
    enable: true,
    listen: '0.0.0.0:1053',
    ipv6: false,
    'prefer-h3': false,

    'respect-rules': true,
    'use-hosts': true,
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.1/16',
    'fake-ip-filter': [
      '*.lan', '*.local', '*.localdomain', '*.home.arpa',
      'localhost.ptlogin2.qq.com', 'msftconnecttest.com', 'msftncsi.com',
      'time.windows.com', 'time.apple.com', 'pool.ntp.org', 'ntp.*.com', 'ntp.*.cn',
      'stun.*', 'stun.*.*', 'stun.*.*.*', 'turn.*', 'turn.*.*', 'relay.*',
      'cable.auth.com', '*.srv.nintendo.net', '*.stun.playstation.net',
      'xbox.*.microsoft.com', '*.xboxlive.com', '*.battle.net', '*.battlenet.com.cn',
      '*.wotgame.cn', '*.wggames.cn', '*.wowsgame.cn', '*.wargaming.net',
      'router.asus.com', 'routerlogin.net', 'www.routerlogin.com',
      'tplogin.cn', 'tplinkwifi.net', 'miwifi.com', 'mediatek.com', 'plex.direct',
      'ultimateota.d.miui.com', 'superota.d.miui.com', 'bigota.d.miui.com', '*.d.miui.com',
      'etl-xlmc-ssl.sandai.net', '*.xlmc.sandai.net', '*.shub.sandai.net', '*.rcv.sandai.net'

    ],
    nameserver: cnDns,
    'default-nameserver': localDns,
    'proxy-server-nameserver': localDns,

    'nameserver-policy': {
      'geosite:private': localDns,

      'geosite:cn': cnDns,
      'geosite:geolocation-!cn': trustDns,
      'domain:openai.com': trustDns,
      'domain:chatgpt.com': trustDns,
      'domain:github.com': trustDns,
      'domain:githubusercontent.com': trustDns,
      'domain:discord.com': trustDns,
      'domain:play.google.com': trustDns,
      'domain:play.googleapis.com': trustDns,
      'domain:android.clients.google.com': trustDns,
      'domain:dl.google.com': trustDns,
      'domain:youtube.com': trustDns,
      'domain:youtubei.googleapis.com': trustDns,
      'domain:youtube.googleapis.com': trustDns,
      'domain:sponsor.ajay.app': trustDns,
      'domain:returnyoutubedislikeapi.com': trustDns,
      'domain:ultimateota.d.miui.com': cnDns,

      'domain:superota.d.miui.com': cnDns,
      'domain:bigota.d.miui.com': cnDns,
      'domain:etl-xlmc-ssl.sandai.net': cnDns

    },
    'fallback-filter': {
      geoip: true,
      'geoip-code': 'CN',
      ipcidr: ['240.0.0.0/4'],
      domain: [
        '+.google.com', '+.youtube.com', '+.twitter.com', '+.x.com', '+.telegram.org', '+.t.me',
        '+.facebook.com', '+.fbcdn.net', '+.instagram.com', '+.whatsapp.com', '+.whatsapp.net',
        '+.openai.com', '+.chatgpt.com', '+.github.com', '+.githubusercontent.com', '+.discord.com', '+.reddit.com'
      ]
    },
    fallback: trustDns
  };


  const invalidProxyNamePatterns = [
    /(?:剩余流量|重置|到期|官网|官方|公告|通知|最新|售后|telegram|电报|套餐|订阅|使用说明|请使用|客户端|更新订阅|复制链接|浏览器打开|https?:\/\/|@\w+)/i
  ];
  function isRealProxyName(name) {
    if (!name) return false;
    if (/^(urltest|select|fallback|load-balance)\b/i.test(name)) return false;
    if (/\b\d+\/\d+\b/.test(name)) return false;
    return !invalidProxyNamePatterns.some(re => re.test(name));
  }

  const proxies = config.proxies.filter(p => p && p.name && isRealProxyName(p.name));

  const unique = arr => [...new Set(arr.filter(Boolean))];

  const uniqueBy = (arr, keyFn) => {
    const seen = new Set();
    return arr.filter(item => {
      const key = keyFn(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const residentialNamePatterns = [
  /家宽/i, /家庭宽带/i, /住宅/i, /原生/i, /home/i, /residential/i
];
  function isResidentialProxyName(name) {
    return residentialNamePatterns.some(re => re.test(String(name || '')));
  }
  const cleanProxies = uniqueBy(proxies, p => p && p.name);
  const residentialProxies = cleanProxies.filter(p => isResidentialProxyName(p.name));
  const builtInDirectProxies = [

    {
      name: '🇨🇳 直连 | IPv4优先',
      type: 'direct',
      'ip-version': 'ipv4-prefer',
    },
    {
      name: '🇨🇳 直连 | IPv6优先',
      type: 'direct',
      'ip-version': 'ipv6-prefer',
    },
    {
      name: '🇨🇳 直连 | 双栈',
      type: 'direct',
    },
  ];
  config.proxies = uniqueBy(cleanProxies.concat(builtInDirectProxies), p => p && p.name);

  const allProxyNames = cleanProxies.map(p => p.name);

  function hasWholeWord(text, word) {
    const escaped = String(word || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z])' + escaped + '([^a-z]|$)', 'i').test(text);
  }

  const regionGroups = {
    '香港': [],
    '台湾': [],
    '日本': [],
    '新加坡': [],
    '美国': [],
    '韩国': [],
    '俄罗斯': [],
    '欧盟': [],
    '其他地区': []
  };

  const keywordMap = {
    '香港': ['香港', 'hk', 'hong kong', 'hongkong', 'hkg'],
    '台湾': ['台湾', '台灣', 'tw', 'taiwan', 'taipei', 'taichung', 'kaohsiung'],
    '日本': ['日本', 'jp', 'japan', 'tokyo', 'osaka', 'nagoya', 'saitama'],
    '新加坡': ['新加坡', 'sg', 'singapore', 'sgp'],
    '美国': ['美国', 'us', 'usa', 'united states', 'america', 'los angeles', 'san jose', 'seattle', 'chicago', 'new york', 'silicon valley', 'las vegas', 'phoenix', 'dallas'],
    '韩国': ['韩国', '南韩', 'kr', 'korea', 'seoul', 'busan'],
   '俄罗斯': ['俄罗斯', 'ru', 'russia', 'moscow', 'moskva', 'saint petersburg', 'st. petersburg'],
    '欧盟': ['英国', 'gb', 'uk', 'britain', 'united kingdom', 'london', 'manchester', '德国', 'de', 'germany', 'frankfurt', 'berlin', 'munich', '法国', 'fr', 'france', 'paris', 'marseille', '荷兰', 'nl', 'netherlands', 'amsterdam', 'rotterdam', '土耳其', 'tr', 'turkey', 'istanbul', '欧盟', '欧洲', 'europe', 'european union'],
    '其他地区': ['印度', 'india', 'in', '马来西亚', 'malaysia', 'my', '越南', 'vietnam', 'vn', '加拿大', 'canada', 'ca', '澳大利亚', '澳洲', 'australia', 'au', '悉尼', 'sydney', '墨尔本', 'melbourne', '新西兰', 'new zealand', 'nz', '奥克兰', 'auckland', '阿联酋', 'uae', 'dubai', '迪拜', '泰国', 'thailand', 'th', '曼谷', 'bangkok', '菲律宾', 'philippines', 'ph', '马尼拉', 'manila', '印度尼西亚', '印尼', 'indonesia', 'id', '雅加达', 'jakarta']
  };

  const regionPriority = ['香港', '台湾', '日本', '新加坡', '美国', '韩国', '俄罗斯', '欧盟', '其他地区'];

  function normalizeRegionName(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/(?:\uD83C[\uDDE6-\uDDFF]){2}/g, ' ')
      .replace(/[\u2600-\u27BF]/g, ' ')
      .replace(/[|｜¦•·・,，;；:：/\_+-–—()\[\]{}<>【】「」『』]/g, ' ')
      .replace(/\b(vip|svip|倍率|x\d+|iepl|iplc|bgp|cn2|gia|game|games|gaming|stream|media|unlock|nf|奈飞|netflix|disney|hbo|max|prime|chatgpt|gpt|ai|home|residential|station|server|node|premium|traffic|test|testing|expire|plan|used|aws|hy2|anytls)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matchRegion(name) {
    const normalized = normalizeRegionName(name);
    if (!normalized) return '其他地区';

    const compact = normalized.replace(/\s+/g, '');

    for (const regionName of regionPriority) {
      const keywords = keywordMap[regionName] || [];
      for (const keyword of keywords) {
        const lowerKeyword = String(keyword).toLowerCase();
        if (/^[a-z]{2,3}$/.test(lowerKeyword)) {
          if (hasWholeWord(normalized, lowerKeyword)) return regionName;
          continue;
        }
        if (normalized.includes(lowerKeyword) || compact.includes(lowerKeyword.replace(/\s+/g, ''))) return regionName;
      }
    }

    const recoveryPatterns = [
      ['香港', /(香港|hong\s?kong|hongkong|\bhk\b|\bhkg\b)/i],
      ['台湾', /(台湾|台灣|taiwan|taipei|taichung|kaohsiung|\btw\b)/i],
      ['日本', /(日本|japan|tokyo|osaka|nagoya|\bjp\b)/i],
      ['新加坡', /(新加坡|singapore|\bsg\b|\bsgp\b)/i],
      ['美国', /(美国|united states|america|los angeles|san jose|new york|\bus\b|\busa\b)/i],
      ['韩国', /(韩国|南韩|korea|seoul|busan|\bkr\b)/i],
      ['俄罗斯', /(俄罗斯|russia|moscow|moskva|saint petersburg|st\. petersburg|\bru\b)/i],
      ['欧盟', /(英国|德国|法国|荷兰|土耳其|欧盟|欧洲|united kingdom|britain|england|germany|france|netherlands|turkey|europe|\buk\b|\bgb\b|\bde\b|\bfr\b|\bnl\b|\btr\b)/i],
      ['其他地区', /(加拿大|canada|\bca\b|澳大利亚|澳洲|australia|\bau\b|悉尼|sydney|墨尔本|melbourne|新西兰|new zealand|\bnz\b|奥克兰|auckland|阿联酋|\buae\b|迪拜|dubai|泰国|thailand|\bth\b|曼谷|bangkok|菲律宾|philippines|\bph\b|马尼拉|manila|印度尼西亚|印尼|indonesia|\bid\b|雅加达|jakarta)/i]
    ];

    for (const [regionName, pattern] of recoveryPatterns) {
      if (pattern.test(normalized)) return regionName;
    }

    return '其他地区';
  }

  for (const proxy of proxies) {
    regionGroups[matchRegion(proxy.name)].push(proxy.name);
  }
  const testUrl = 'http://www.gstatic.com/generate_204';
  const testInterval = 420;
  const testTolerance = 80;
  const testLazy = true;
  const fallbackInterval = 300;
  const fallbackTolerance = 180;
  const fallbackLazy = true;
  const regionUrlTestInterval = 300;
  const regionUrlTestTolerance = 180;

  function preserveGroup(group) {
    const oldGroup = existingGroupMap[group.name];

    if (group.type !== 'select') return group;
    if (!oldGroup || !Array.isArray(oldGroup.proxies) || !Array.isArray(group.proxies)) return group;
    if (group.name === '全球直连') {
      return { ...group, proxies: ['DIRECT'] };
    }
    const oldProxies = oldGroup.proxies.filter(p => group.proxies.includes(p));
    const remaining = group.proxies.filter(p => !oldProxies.includes(p));
    return { ...group, proxies: oldProxies.concat(remaining) };
  }

  function ensureGroupList(list, extraDefaults) {
    const merged = unique([].concat(list || [], extraDefaults || []));
    return merged.length ? merged : ['DIRECT'];
  }
  function makeUrlTestGroup(name, icon, nodes, interval, tolerance) {
    const proxies = unique(nodes || []);
    const normalizedInterval = typeof interval === 'number' ? interval : testInterval;
    const normalizedTolerance = typeof tolerance === 'number' ? tolerance : testTolerance;
    return {
      name,
      type: 'url-test',
      icon,
      url: testUrl,
      interval: normalizedInterval,
      tolerance: normalizedTolerance,
      lazy: testLazy,
      proxies: proxies.length ? proxies : ['DIRECT']
    };
  }

  function makeSelectGroup(name, icon, list, extraDefaults = ['自动选择']) {
    return { name, type: 'select', icon, proxies: ensureGroupList(list, extraDefaults) };
  }
  function makeFallbackGroup(name, icon, list, extraDefaults = ['自动选择'], options = {}) {
    const proxies = ensureGroupList(list, extraDefaults);
    return {
      name,
      type: 'fallback',
      icon,
      url: options.url || testUrl,
      interval: options.interval || fallbackInterval,
      tolerance: options.tolerance || fallbackTolerance,
      lazy: typeof options.lazy === 'boolean' ? options.lazy : fallbackLazy,
      proxies
    };
  }

  function finalizeGroupList(groups) {
    return uniqueBy((groups || []).filter(Boolean), group => group && group.name);
  }

  function makeLoadBalanceGroup(name, icon, list, strategy = 'round-robin', extraDefaults = ['自动选择']) {

    return {
      name,
      type: 'load-balance',
      icon,
      url: testUrl,
      interval: testInterval,
      strategy,
      lazy: testLazy,
      proxies: ensureGroupList(list, extraDefaults)
    };
  }
  const regionIconMap = {

    '香港': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Hong_Kong.png',
    '台湾': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Taiwan.png',
    '日本': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Japan.png',
    '新加坡': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Singapore.png',
    '美国': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/United_States.png',
    '韩国': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Korea.png',
    '俄罗斯': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Russia.png',
    '欧盟': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/European_Union.png',
    '其他地区': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/World_Map.png'
  };

  const regionFlagMap = {
    '香港': '🇭🇰',
    '台湾': '🇹🇼',
    '日本': '🇯🇵',
    '新加坡': '🇸🇬',
    '美国': '🇺🇸',
    '韩国': '🇰🇷',
    '俄罗斯': '🇷🇺',
    '欧盟': '🇪🇺',
    '其他地区': '🌍',
  };
  const iconMap = {
    rocket: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Rocket.png',
    auto: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Auto.png',
    proxy: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Proxy.png',
    select: 'https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Static.png',
    fallback: 'https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Available.png',
    fallbackFinal: 'https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Available.png',
    balance: 'https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Round_Robin.png',

    home: 'https://api.iconify.design/tabler:home-filled.svg',
    global: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Global.png',
    russia: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Russia.png',
    direct: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Direct.png',
    final: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Final.png',
    meta: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/meta.svg',
    youtube: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/YouTube.png',
    youtubeFallback: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Streaming.png',
    aiFallback: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Bot.png',
    netflix: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Netflix.png',
    spotify: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Spotify.png',
    telegram: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Telegram.png',
    google: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Google_Search.png',
    twitter: 'https://api.iconify.design/simple-icons:x.svg',
    reddit: 'https://api.iconify.design/simple-icons:reddit.svg',
    discord: 'https://api.iconify.design/simple-icons:discord.svg',
    flare: 'https://api.iconify.design/tabler:flame-filled.svg?color=%2300d1b2',
    bluesky: 'https://api.iconify.design/simple-icons:bluesky.svg',
    mastodon: 'https://api.iconify.design/simple-icons:mastodon.svg',
    tiktok: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/TikTok.png',
    github: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/GitHub.png',
    ai: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/ChatGPT.png',
    niconico: 'https://api.iconify.design/simple-icons:niconico.svg',
    playstore: 'https://api.iconify.design/logos:google-play-icon.svg',
    fcm: 'https://fastly.jsdelivr.net/gh/MiToverG422/Qure@master/IconSet/Color/fcm.png',
    apple: 'https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Apple.png',
    microsoft: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Microsoft.png',
    streaming: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Netflix.png',
    china: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/China_Map.png',
    game: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Game.png',
    download: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Download.png',
    cloudflare: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Cloudflare.png',
    adblock: qIcon('Advertising'),
    jpkr: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/AbemaTV.png',
    homeRegion: 'https://api.iconify.design/tabler:home-filled.svg',
    social: 'https://api.iconify.design/simple-icons:reddit.svg',
    decentralized: 'https://api.iconify.design/simple-icons:bluesky.svg'

  };
  function makeFusionRegionGroupNames(label) {
    return {
      auto: label + '自动',
      manual: label + '手动',
      homeAuto: label + '家宽',
      homeManual: label + '家宽手动',
    };
  }




  const regionAutoMap = {};
  const regionAutoNames = [];
  const regionAutoGroups = [];
  const regionHomeAutoMap = {};
  const regionHomeAutoNames = [];
  const regionHomeAutoGroups = [];

  const regionAutoOrder = ['香港', '台湾', '美国', '日本', '新加坡', '韩国', '俄罗斯', '欧盟', '其他地区'];
  for (const regionName of regionAutoOrder) {
    if (!regionGroups[regionName] || regionGroups[regionName].length === 0) continue;

    const fusionNames = makeFusionRegionGroupNames(regionName);
    regionAutoMap[regionName] = fusionNames.auto;
    regionAutoNames.push(fusionNames.auto);
    regionAutoGroups.push(makeUrlTestGroup(fusionNames.auto, regionIconMap[regionName], regionGroups[regionName], regionUrlTestInterval, regionUrlTestTolerance));
    const residentialRegionNodes = regionGroups[regionName].filter(name => isResidentialProxyName(name));

    if (residentialRegionNodes.length > 0) {
      regionHomeAutoMap[regionName] = fusionNames.homeAuto;
      regionHomeAutoNames.push(fusionNames.homeAuto);
      regionHomeAutoGroups.push(makeUrlTestGroup(fusionNames.homeAuto, regionIconMap[regionName], residentialRegionNodes, regionUrlTestInterval, regionUrlTestTolerance));
    }

  }


  function getRegionAuto(name) {
    return regionAutoMap[name] || null;
  }
  function getRegionHomeAuto(name) {
    return regionHomeAutoMap[name] || null;
  }
  function buildRegionChain(names) {
    return names.map(getRegionAuto).filter(Boolean);
  }
  function buildRegionHomeChain(names) {
    return names.map(getRegionHomeAuto).filter(Boolean);
  }

  function buildNodeChain(patterns) {
    return allProxyNames.filter(name => patterns.some(pattern => pattern.test(name)));
  }
  const globalHomeNodes = unique(residentialProxies.map(p => p.name));
  const fusionVisibleRegions = unique(regionAutoNames.concat(regionHomeAutoNames));

  const autoFallbackNodes = unique(buildRegionChain(['香港', '台湾', '日本', '新加坡', '美国', '韩国', '欧盟', '其他地区']).concat(allProxyNames));

  const balanceNodes = unique(buildRegionChain(['香港', '台湾', '日本', '新加坡', '美国', '韩国', '欧盟']).concat(allProxyNames));
  const jpKrFallbackNodes = buildRegionChain(['日本', '韩国']);
  const hkTwFallbackNodes = buildRegionChain(['香港', '台湾']);
  const usEuFallbackNodes = buildRegionChain(['美国', '欧盟']);
  const youtubeFallbackNodes = unique([].concat(
    buildNodeChain([/俄罗斯/i, /俄(罗斯)?/i, /\bRU\b/i, /🇷🇺/]),
    regionGroups['欧盟'],
    regionGroups['其他地区'],
    buildNodeChain([/澳门/i, /\bMO\b/i, /🇲🇴/]),
    regionGroups['香港'],
    regionGroups['新加坡'],
    regionGroups['日本'],
    regionGroups['台湾'],
    regionGroups['美国']
  ));
  const aiFallbackNodes = unique([].concat(

    buildRegionChain(['台湾', '美国', '日本', '新加坡', '韩国', '其他地区'])
  ));
  const cloudflareGroupChoices = unique([].concat(
    ['自动选择', '欧美故障转移', '全球直连', '全球手动'],

    buildNodeChain([/cloudflare/i, /\bCF\b/i, /WARP/i, /1\.1\.1\.1/]),
    buildRegionChain(['美国', '新加坡', '日本', '香港', '台湾', '欧盟'])
  ));
  const downloadGroupChoices = unique([].concat(
    ['自动选择', '欧美故障转移', '全球手动'],

    buildRegionChain(['美国', '欧盟', '新加坡', '日本', '香港', '台湾', '韩国'])
  ));
  const fallbackGroups = [
    makeFallbackGroup('自动兜底', iconMap.fallbackFinal, autoFallbackNodes, [], {
      interval: 300,
      tolerance: 180,
      lazy: true
    }),
    makeFallbackGroup('港台故障转移', 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Available_1.png', hkTwFallbackNodes, ['自动兜底'], {

      interval: 300,
      tolerance: 180,
      lazy: true
    }),
     makeFallbackGroup('日韩故障转移', qIcon('JP'), jpKrFallbackNodes, ['自动兜底'], {

      interval: 300,
      tolerance: 180,
      lazy: true
    }),
    makeFallbackGroup('欧美故障转移', iconMap.global, usEuFallbackNodes, ['自动兜底'], {
      interval: 300,
      tolerance: 180,
      lazy: true
    }),
    makeFallbackGroup('YouTube无广节点优先组', iconMap.youtubeFallback, youtubeFallbackNodes, ['自动兜底'], {
      interval: 300,
      tolerance: 180,
      lazy: true
    }),
    makeFallbackGroup('国外AI故障转移', iconMap.aiFallback, aiFallbackNodes, ['自动兜底'], {
      interval: 300,
      tolerance: 180,
      lazy: true
    })
  ].filter(Boolean);


  const loadBalanceGroups = [
    makeLoadBalanceGroup('负载均衡', iconMap.balance, balanceNodes, 'round-robin', ['自动选择'])
  ].filter(Boolean);

  const globalHomeGroup = globalHomeNodes.length
    ? makeUrlTestGroup('全球家宽', iconMap.home, globalHomeNodes, regionUrlTestInterval, regionUrlTestTolerance)
    : null;
  const fallbackNames = fallbackGroups.map(group => group.name);
  const loadBalanceNames = loadBalanceGroups.map(group => group.name);
  const baseChoices = ['自动选择', '负载均衡', '全球手动']

    .concat(fallbackNames)
    .concat(loadBalanceNames)
    .concat(globalHomeGroup ? ['全球家宽'] : [])
    .concat(fusionVisibleRegions)
    .concat(proxies.map(p => p.name));

  const commonChoices = ['节点选择'].concat(baseChoices.filter(name => name !== 'YouTube无广节点优先组' && name !== '国外AI故障转移'));
  const youtubeOnlyChoices = ['节点选择', 'YouTube无广节点优先组'].concat(baseChoices.filter(name => name !== '国外AI故障转移'));
  const aiOnlyChoices = ['节点选择', '国外AI故障转移'].concat(baseChoices.filter(name => name !== 'YouTube无广节点优先组'));

  function makeOrderedChoices(first, pool) {
    const source = pool || baseChoices;
    return first.concat(source.filter(name => first.indexOf(name) === -1));
  }

  const metaChoices = makeOrderedChoices(['自动选择'], commonChoices);
  const youtubeChoices = makeOrderedChoices(['YouTube无广节点优先组', '节点选择'], youtubeOnlyChoices);
  const spotifyChoices = makeOrderedChoices(['港台故障转移'], commonChoices);
  const telegramChoices = makeOrderedChoices(['自动选择'], commonChoices);
  const googleChoices = makeOrderedChoices(['港台故障转移'], commonChoices);
  const playStoreChoices = makeOrderedChoices(['自动选择'], commonChoices);

  const domesticChoices = directChoices.concat(fusionVisibleRegions);
  const microsoftChoices = makeOrderedChoices(['全球直连', '自动选择'], commonChoices);
  const streamingChoices = makeOrderedChoices(['自动选择'], commonChoices);
  const gameChoices = makeOrderedChoices(['自动选择'], commonChoices);

  const twitterChoices = makeOrderedChoices(['自动选择'], commonChoices);


  const socialChoices = makeOrderedChoices(['自动选择'], commonChoices);
  const decentralizedChoices = makeOrderedChoices(['欧美故障转移'], commonChoices);
  const tiktokChoices = makeOrderedChoices(['港台故障转移'], commonChoices);
  const niconicoChoices = makeOrderedChoices(['日韩故障转移'], commonChoices);
  const aiChoices = makeOrderedChoices(['国外AI故障转移', '节点选择'], aiOnlyChoices);
  const githubChoices = makeOrderedChoices(['自动选择'], commonChoices);
  const jpKrChoices = makeOrderedChoices(['日韩故障转移'], commonChoices);
   const proxyGroups = [
    makeSelectGroup('节点选择', iconMap.rocket, ['自动选择', '负载均衡', '全球手动'].concat(fallbackNames).concat(globalHomeGroup ? ['全球家宽'] : []).concat(fusionVisibleRegions)),

    makeUrlTestGroup('自动选择', iconMap.auto, allProxyNames, 300, 50),
    ...loadBalanceGroups,
    makeSelectGroup('全球手动', iconMap.select, allProxyNames),

    ...fallbackGroups,
    makeSelectGroup('YouTube', iconMap.youtube, youtubeChoices),
    makeSelectGroup('TikTok', iconMap.tiktok, tiktokChoices),
    makeSelectGroup('Meta', iconMap.meta, metaChoices),
    makeSelectGroup('Twitter', iconMap.twitter, twitterChoices),
    makeSelectGroup('Niconico', iconMap.niconico, niconicoChoices),
    makeSelectGroup('日韩生态区', iconMap.jpkr, jpKrChoices),

    makeSelectGroup('Spotify', iconMap.spotify, spotifyChoices),
    makeSelectGroup('Telegram', iconMap.telegram, telegramChoices),
    makeSelectGroup('Google', iconMap.google, googleChoices),
    makeSelectGroup('谷歌商店', iconMap.playstore, playStoreChoices),
    makeSelectGroup('微软服务', iconMap.microsoft, microsoftChoices),
    makeSelectGroup('国内服务', iconMap.china, ['全球直连'].concat(directChoices.filter(x => x !== '全球直连')).concat(domesticChoices.filter(x => x !== '全球直连' && !directChoices.includes(x)))),

    makeSelectGroup('流媒体', iconMap.streaming, streamingChoices),
    makeSelectGroup('GitHub', iconMap.github, githubChoices),
    makeSelectGroup('AI', iconMap.ai, aiChoices),
    makeSelectGroup('国外游戏', iconMap.game, gameChoices),

    makeSelectGroup('社交信息流', iconMap.social, socialChoices),
    makeSelectGroup('去中心化平台', iconMap.decentralized, decentralizedChoices),
    makeSelectGroup('FCM', iconMap.fcm, ['自动选择', '节点选择', '全球手动', '全球直连'].concat(fusionVisibleRegions).concat(allProxyNames)),
    makeSelectGroup('Apple', iconMap.apple, ['自动选择', '节点选择', '全球手动', '全球直连'].concat(fusionVisibleRegions).concat(allProxyNames)),

    makeSelectGroup('Cloudflare', iconMap.cloudflare || iconMap.global, cloudflareGroupChoices),
    makeSelectGroup('下载专用组', iconMap.download || iconMap.fallback, downloadGroupChoices),
    makeSelectGroup('广告拦截', iconMap.adblock, ['REJECT', 'REJECT-DROP', 'PASS']),
    makeSelectGroup('漏网之鱼', iconMap.final, ['自动选择', '全球手动'].concat(fallbackNames.filter(name => name !== 'YouTube无广节点优先组' && name !== '国外AI故障转移')).concat(fusionVisibleRegions)),

    makeSelectGroup('全球直连', iconMap.direct, ['DIRECT'], []),
  ]
    .concat(regionAutoOrder.flatMap(regionName => {
      const groups = [];
      const autoGroup = regionAutoGroups.find(group => group.name === (regionAutoMap[regionName] || ''));
      if (autoGroup) groups.push(autoGroup);
      return groups;

    }))
    .concat([
      ...regionHomeAutoGroups,
    ])

    .concat(globalHomeGroup ? [globalHomeGroup] : [])
    .map(preserveGroup);

  config['proxy-groups'] = finalizeGroupList(proxyGroups);
  config.rules = unique([
    // 广告拦截
    'DOMAIN-KEYWORD,adservice,广告拦截',

    'DOMAIN-SUFFIX,doubleclick.net,广告拦截',
    'DOMAIN-SUFFIX,googleadservices.com,广告拦截',
    'DOMAIN-SUFFIX,googlesyndication.com,广告拦截',
    'DOMAIN-SUFFIX,google-analytics.com,广告拦截',
    'DOMAIN-SUFFIX,googletagmanager.com,广告拦截',
    'DOMAIN-SUFFIX,googletagservices.com,广告拦截',
    'DOMAIN-SUFFIX,adnxs.com,广告拦截',
    'DOMAIN-SUFFIX,app-measurement.com,广告拦截',
    'DOMAIN-SUFFIX,admob.com,广告拦截',
    'DOMAIN-SUFFIX,ads-twitter.com,广告拦截',
    'DOMAIN-SUFFIX,adsrvr.org,广告拦截',
    'DOMAIN-SUFFIX,adservice.google.com,广告拦截',
    'DOMAIN-SUFFIX,adservice.google.com.hk,广告拦截',
    'DOMAIN-SUFFIX,criteo.com,广告拦截',
    'DOMAIN-SUFFIX,criteo.net,广告拦截',
    'DOMAIN-SUFFIX,doubleverify.com,广告拦截',
    'DOMAIN-SUFFIX,flurry.com,广告拦截',
    'DOMAIN-SUFFIX,inmobi.com,广告拦截',
    'DOMAIN-SUFFIX,kochava.com,广告拦截',
    'DOMAIN-SUFFIX,mathtag.com,广告拦截',
    'DOMAIN-SUFFIX,openx.net,广告拦截',
    'DOMAIN-SUFFIX,outbrain.com,广告拦截',
    'DOMAIN-SUFFIX,scorecardresearch.com,广告拦截',
    'DOMAIN-SUFFIX,taboola.com,广告拦截',
    'DOMAIN-SUFFIX,taboolasyndication.com,广告拦截',
    'DOMAIN-SUFFIX,smartadserver.com,广告拦截',
    'DOMAIN-SUFFIX,unityads.unity3d.com,广告拦截',
    'DOMAIN-SUFFIX,vungle.com,广告拦截',
    'DOMAIN-SUFFIX,byteoversea.com,广告拦截',
    'DOMAIN-SUFFIX,pglstatp-toutiao.com,广告拦截',
    'DOMAIN-SUFFIX,pangolin-sdk-toutiao.com,广告拦截',
    'DOMAIN-SUFFIX,pangolin.snssdk.com,广告拦截',
    'DOMAIN-SUFFIX,unionadjs.com,广告拦截',
    'DOMAIN-SUFFIX,tanx.com,广告拦截',
    'DOMAIN-SUFFIX,alimama.com,广告拦截',
    'DOMAIN-SUFFIX,mmstat.com,广告拦截',
    'DOMAIN-SUFFIX,gdt.qq.com,广告拦截',
    'DOMAIN-SUFFIX,e.qq.com,广告拦截',
    'DOMAIN-SUFFIX,guanggao.qq.com,广告拦截',
    'DOMAIN-SUFFIX,adnet.qq.com,广告拦截',
    'DOMAIN-SUFFIX,iadmatvideo.nosdn.127.net,广告拦截',
    'DOMAIN-SUFFIX,iadmusicmatvideo.nosdn.127.net,广告拦截',
    'DOMAIN-SUFFIX,mi.gdt.qq.com,广告拦截',
    'DOMAIN-SUFFIX,bdxiguaimg.com,广告拦截',
    'DOMAIN-KEYWORD,adsystem,广告拦截',
    'DOMAIN-KEYWORD,adserver,广告拦截',
    'DOMAIN-SUFFIX,sgsnssdk.com,广告拦截',
    'DOMAIN-SUFFIX,adsame.com,广告拦截',
    'DOMAIN-SUFFIX,adkwai.com,广告拦截',
    'DOMAIN-SUFFIX,e.kuaishou.com,广告拦截',
    'DOMAIN-SUFFIX,adukwai.com,广告拦截',
    'DOMAIN-SUFFIX,bdplus.baidu.com,广告拦截',
    'DOMAIN-SUFFIX,pos.baidu.com,广告拦截',
    'DOMAIN-SUFFIX,union.baidu.com,广告拦截',
    'DOMAIN-SUFFIX,cb.baidu.com,广告拦截',
    'DOMAIN-SUFFIX,dup.baidustatic.com,广告拦截',
    'DOMAIN-SUFFIX,cpro.baidu.com,广告拦截',
    'DOMAIN-SUFFIX,afd.baidu.com,广告拦截',
    'DOMAIN-SUFFIX,als.baidu.com,广告拦截',
    'DOMAIN-SUFFIX,nsclick.baidu.com,广告拦截',
    'DOMAIN-SUFFIX,mobads.baidu.com,广告拦截',
    'DOMAIN-SUFFIX,eclick.baidu.com,广告拦截',
    'DOMAIN-SUFFIX,wanfeng1.baidu.com,广告拦截',
    'DOMAIN-SUFFIX,wm.baidu.com,广告拦截',
    'DOMAIN-SUFFIX,duclick.baidu.com,广告拦截',
    'DOMAIN-SUFFIX,googleads.g.doubleclick.net,广告拦截',
    'DOMAIN-SUFFIX,static.doubleclick.net,广告拦截',
    'DOMAIN-SUFFIX,mediavisor.doubleclick.net,广告拦截',
    'DOMAIN-SUFFIX,adclick.g.doubleclick.net,广告拦截',
    'DOMAIN-SUFFIX,pagead2.googlesyndication.com,广告拦截',
    'DOMAIN-SUFFIX,partnerad.l.doubleclick.net,广告拦截',
    'DOMAIN-SUFFIX,securepubads.g.doubleclick.net,广告拦截',
    'DOMAIN-SUFFIX,adimg.uve.weibo.com,广告拦截',
    'DOMAIN-SUFFIX,alitui.weibo.com,广告拦截',
    'DOMAIN-SUFFIX,biz.weibo.com,广告拦截',
    'DOMAIN-SUFFIX,game.weibo.cn,广告拦截',
    'DOMAIN-SUFFIX,sax.sina.com.cn,广告拦截',
    'DOMAIN-SUFFIX,adbox.sina.com.cn,广告拦截',
    'DOMAIN-SUFFIX,d1ad.com,广告拦截',
    'DOMAIN-SUFFIX,adview.cn,广告拦截',
    'DOMAIN-SUFFIX,mediaplex.com,广告拦截',
    'DOMAIN-SUFFIX,miaozhen.com,广告拦截',
    'DOMAIN-SUFFIX,irs01.com,广告拦截',
    'DOMAIN-SUFFIX,admaster.com.cn,广告拦截',
    'DOMAIN-SUFFIX,adxvip.com,广告拦截',
    'DOMAIN-SUFFIX,adxpand.com,广告拦截',
    'DOMAIN-SUFFIX,beizi.biz,广告拦截',
    'DOMAIN-SUFFIX,admobile.top,广告拦截',
    'DOMAIN-SUFFIX,adpush.cn,广告拦截',
    // FCM / Google 推送
    'DOMAIN-SUFFIX,fcm.googleapis.com,FCM',
    'DOMAIN-SUFFIX,fcm-xmpp.googleapis.com,FCM',
    'DOMAIN-SUFFIX,mtalk.google.com,FCM',
    'DOMAIN-SUFFIX,mtalk4.google.com,FCM',
    'DOMAIN-SUFFIX,mtalk-staging.google.com,FCM',
    'DOMAIN-SUFFIX,fcmtoken.googleapis.com,FCM',
    'DST-PORT,5228,FCM',
    'DST-PORT,5229,FCM',
    'DST-PORT,5230,FCM',

    // 谷歌商店 / Play Store
    'PROCESS-NAME,com.android.vending,谷歌商店',
    'DOMAIN-SUFFIX,play.google.com,谷歌商店',
    'DOMAIN-SUFFIX,play.googleapis.com,谷歌商店',
    'DOMAIN-SUFFIX,play-fe.googleapis.com,谷歌商店',
    'DOMAIN-SUFFIX,play-pa.googleapis.com,谷歌商店',
    'DOMAIN-SUFFIX,playatoms-pa.googleapis.com,谷歌商店',
    'DOMAIN-SUFFIX,play-apps-download-frontend.googleapis.com,谷歌商店',
    'DOMAIN-SUFFIX,play-lh.googleusercontent.com,谷歌商店',
    'DOMAIN-SUFFIX,play-games.googleusercontent.com,谷歌商店',
    'DOMAIN-SUFFIX,market.android.com,谷歌商店',
    'DOMAIN-SUFFIX,android.clients.google.com,谷歌商店',
    'DOMAIN-SUFFIX,android.googleapis.com,谷歌商店',
    'DOMAIN-KEYWORD,googleplay,谷歌商店',

    // YouTube / Google 视频媒体
    'PROCESS-NAME,app.revanced.android.youtube,YouTube',
    'PROCESS-NAME,app.rvx.android.youtube,YouTube',
    'PROCESS-NAME,app.morphe.android.youtube,YouTube',
    'DOMAIN-SUFFIX,youtube.com,YouTube',
    'DOMAIN-SUFFIX,youtube-nocookie.com,YouTube',
    'DOMAIN-SUFFIX,youtu.be,YouTube',
    'DOMAIN-SUFFIX,yt.be,YouTube',
    'DOMAIN-SUFFIX,youtube.googleapis.com,YouTube',
    'DOMAIN-SUFFIX,youtubei.googleapis.com,YouTube',
    'DOMAIN-SUFFIX,googlevideo.com,YouTube',
    'DOMAIN-SUFFIX,ytimg.com,YouTube',
    'DOMAIN-SUFFIX,ggpht.com,YouTube',
    'DOMAIN-SUFFIX,yt3.ggpht.com,YouTube',
    'DOMAIN-SUFFIX,youtubekids.com,YouTube',
    'DOMAIN-SUFFIX,sponsor.ajay.app,YouTube',
    'DOMAIN-SUFFIX,returnyoutubedislikeapi.com,YouTube',

    // Google AI / Gemini
    'DOMAIN-SUFFIX,gemini.google.com,AI',
    'DOMAIN-SUFFIX,generativeai.google,AI',
    'DOMAIN-SUFFIX,generativelanguage.googleapis.com,AI',
    'DOMAIN-SUFFIX,proactivebackend-pa.googleapis.com,AI',
    'DOMAIN-SUFFIX,notebooklm.google.com,AI',

    // Google 下载 / 更新
    'DOMAIN-SUFFIX,dl.google.com,下载专用组',
    'DOMAIN-SUFFIX,dl.googleusercontent.com,下载专用组',
    'DOMAIN-SUFFIX,redirector.gvt1.com,下载专用组',
    'DOMAIN-SUFFIX,update.googleapis.com,下载专用组',
    'DOMAIN-SUFFIX,connectivitycheck.gstatic.com,下载专用组',

    // 国内服务
    'GEOSITE,CN,国内服务',


    // 腾讯系
    'DOMAIN-SUFFIX,wechat.com,国内服务',
    'DOMAIN-SUFFIX,weixin.qq.com,国内服务',
    'DOMAIN-SUFFIX,qq.com,国内服务',
    'DOMAIN-SUFFIX,gtimg.com,国内服务',
    'DOMAIN-SUFFIX,qpic.cn,国内服务',
    'DOMAIN-SUFFIX,tenpay.com,国内服务',
    'DOMAIN-SUFFIX,qqvideo.tc.qq.com,国内服务',
    'DOMAIN-SUFFIX,v.qq.com,国内服务',
    'DOMAIN-SUFFIX,hunyuan.tencent.com,国内服务',
    'DOMAIN-SUFFIX,yuanbao.tencent.com,国内服务',

    // 阿里系
    'DOMAIN-SUFFIX,alicdn.com,国内服务',
    'DOMAIN-SUFFIX,aliyun.com,国内服务',
    'DOMAIN-SUFFIX,aliyuncs.com,国内服务',
    'DOMAIN-SUFFIX,taobao.com,国内服务',
    'DOMAIN-SUFFIX,tmall.com,国内服务',
    'DOMAIN-SUFFIX,alipay.com,国内服务',
    'DOMAIN-SUFFIX,alipayobjects.com,国内服务',
    'DOMAIN-SUFFIX,youku.com,国内服务',
    'DOMAIN-SUFFIX,youkuimg.com,国内服务',
    'DOMAIN-SUFFIX,tongyi.com,国内服务',
    'DOMAIN-SUFFIX,tongyi.aliyun.com,国内服务',

    // 京东 / 电商 / 生活
    'DOMAIN-SUFFIX,jd.com,国内服务',
    'DOMAIN-SUFFIX,jdstatic.com,国内服务',
    'DOMAIN-SUFFIX,pinduoduo.com,国内服务',
    'DOMAIN-SUFFIX,smzdm.com,国内服务',
    'DOMAIN-SUFFIX,meituan.com,国内服务',
    'DOMAIN-SUFFIX,dianping.com,国内服务',
    'DOMAIN-SUFFIX,ctrip.com,国内服务',
    'DOMAIN-SUFFIX,12306.cn,国内服务',

    // B 站 / 视频内容
    'DOMAIN-SUFFIX,bilibili.com,国内服务',
    'DOMAIN-SUFFIX,biliapi.com,国内服务',
    'DOMAIN-SUFFIX,biliimg.com,国内服务',
    'DOMAIN-SUFFIX,bilivideo.com,国内服务',
    'DOMAIN-SUFFIX,bilivideo.cn,国内服务',
    'DOMAIN-SUFFIX,hdslb.com,国内服务',
    'DOMAIN-SUFFIX,iqiyi.com,国内服务',
    'DOMAIN-SUFFIX,iqiyipic.com,国内服务',
    'DOMAIN-SUFFIX,mgtv.com,国内服务',

    // 字节 / 抖音 / 豆包
    'DOMAIN-SUFFIX,douyin.com,国内服务',
    'DOMAIN-SUFFIX,douyincdn.com,国内服务',
    'DOMAIN-SUFFIX,bytecdn.cn,国内服务',
    'DOMAIN-SUFFIX,byteimg.com,国内服务',
    'DOMAIN-SUFFIX,byted.org,国内服务',
    'DOMAIN-SUFFIX,ibytedtos.com,国内服务',
    'DOMAIN-SUFFIX,iesdouyin.com,国内服务',
    'DOMAIN-SUFFIX,amemv.com,国内服务',
    'DOMAIN-SUFFIX,doubao.com,国内服务',
    'DOMAIN-SUFFIX,volces.com,国内服务',

    // 快手系
    'DOMAIN-SUFFIX,kuaishou.com,国内服务',
    'DOMAIN-SUFFIX,ksapisrv.com,国内服务',
    'DOMAIN-SUFFIX,kspkg.com,国内服务',
    'DOMAIN-SUFFIX,ksyuncdn.com,国内服务',

    // 社区 / 资讯
    'DOMAIN-SUFFIX,zhihu.com,国内服务',
    'DOMAIN-SUFFIX,zhimg.com,国内服务',
    'DOMAIN-SUFFIX,weibo.com,国内服务',
    'DOMAIN-SUFFIX,weibocdn.com,国内服务',
    'DOMAIN-SUFFIX,xiaohongshu.com,国内服务',
    'DOMAIN-SUFFIX,xhscdn.com,国内服务',
    'DOMAIN-SUFFIX,xhsglobal.com,国内服务',

    // 百度系
    'DOMAIN-SUFFIX,baidu.com,国内服务',
    'DOMAIN-SUFFIX,bdimg.com,国内服务',
    'DOMAIN-SUFFIX,bdstatic.com,国内服务',
    'DOMAIN-SUFFIX,qianfan.baidu.com,国内服务',
    'DOMAIN-SUFFIX,erniebot.com,国内服务',
    'DOMAIN-SUFFIX,yiyan.baidu.com,国内服务',

    // 网易 / 门户
    'DOMAIN-SUFFIX,163.com,国内服务',
    'DOMAIN-SUFFIX,126.net,国内服务',
    'DOMAIN-SUFFIX,126.com,国内服务',
    'DOMAIN-SUFFIX,sina.com.cn,国内服务',
    'DOMAIN-SUFFIX,sohu.com,国内服务',

    // 国产 AI
    'DOMAIN-SUFFIX,deepseek.com,国内服务',
    'DOMAIN-SUFFIX,deepseek.cn,国内服务',
    'DOMAIN-SUFFIX,moonshot.cn,国内服务',
    'DOMAIN-SUFFIX,kimi.com,国内服务',
    'DOMAIN-SUFFIX,minimaxi.com,国内服务',
    'DOMAIN-SUFFIX,xinghuo.xfyun.cn,国内服务',
    'DOMAIN-SUFFIX,sensenova.cn,国内服务',
    // Apple
    'DOMAIN-SUFFIX,apple.com,Apple',
    'DOMAIN-SUFFIX,icloud.com,Apple',
    'DOMAIN-SUFFIX,icloud-content.com,Apple',

    'DOMAIN-SUFFIX,itunes.apple.com,Apple',
    'DOMAIN-SUFFIX,apps.apple.com,Apple',
    'DOMAIN-SUFFIX,mzstatic.com,Apple',
    'DOMAIN-SUFFIX,apple-dns.net,Apple',
    'DOMAIN-SUFFIX,apple-mapkit.com,Apple',
    'DOMAIN-SUFFIX,cdn-apple.com,Apple',
    'DOMAIN-SUFFIX,apple.news,Apple',
    'DOMAIN-SUFFIX,applemusic.com,Apple',
    'DOMAIN-SUFFIX,appstore.com,Apple',
    'DOMAIN,time.apple.com,Apple',
    // AI
    'DOMAIN-SUFFIX,openai.com,AI',
    'DOMAIN-SUFFIX,chatgpt.com,AI',
    'DOMAIN-SUFFIX,oaistatic.com,AI',
    'DOMAIN-SUFFIX,oaiusercontent.com,AI',
    'DOMAIN-SUFFIX,openaiusercontent.com,AI',
    'DOMAIN-SUFFIX,chatgpt.livekit.cloud,AI',
    'DOMAIN-SUFFIX,openaiapi-site.azureedge.net,AI',
    'DOMAIN-SUFFIX,auth0.openai.com,AI',
    'DOMAIN-SUFFIX,identrust.com,AI',
    'DOMAIN-SUFFIX,ai.com,AI',
    'DOMAIN-SUFFIX,anthropic.com,AI',
    'DOMAIN-SUFFIX,claude.ai,AI',
    'DOMAIN-SUFFIX,claudeusercontent.com,AI',
    'DOMAIN-SUFFIX,anthropiccdn.com,AI',
    'DOMAIN-SUFFIX,perplexity.ai,AI',
    'DOMAIN-SUFFIX,perplexity.com,AI',
    'DOMAIN-SUFFIX,pplx.ai,AI',
    'DOMAIN-SUFFIX,groq.com,AI',
    'DOMAIN-SUFFIX,x.ai,AI',
    'DOMAIN-SUFFIX,api.x.ai,AI',
    'DOMAIN-SUFFIX,mistral.ai,AI',
    'DOMAIN-SUFFIX,lechat.ai,AI',
    'DOMAIN-SUFFIX,poe.com,AI',
    'DOMAIN-SUFFIX,poecdn.net,AI',
    'DOMAIN-SUFFIX,stability.ai,AI',
    'DOMAIN-SUFFIX,character.ai,AI',
    'DOMAIN-SUFFIX,c.ai,AI',
    'DOMAIN-SUFFIX,midjourney.com,AI',

    // 去中心化平台
    'PROCESS-NAME,io.metamask,去中心化平台',
    'PROCESS-NAME,io.metamask:bridge,去中心化平台',
    'PROCESS-NAME,io.metamask:fileprovider,去中心化平台',
    'DOMAIN-SUFFIX,metamask.io,去中心化平台',
    'DOMAIN,api2.branch.io,去中心化平台',
    'DOMAIN,cdn.branch.io,去中心化平台',

    // Cloudflare

    'DOMAIN-SUFFIX,cloudflare.com,Cloudflare',
    'DOMAIN-SUFFIX,cloudflare-dns.com,Cloudflare',
    'DOMAIN-SUFFIX,cloudflareclient.com,Cloudflare',
    'DOMAIN-SUFFIX,workers.dev,Cloudflare',
    'DOMAIN-SUFFIX,pages.dev,Cloudflare',
    'DOMAIN-SUFFIX,trycloudflare.com,Cloudflare',
    'DOMAIN-SUFFIX,cdnjs.cloudflare.com,Cloudflare',
    'DOMAIN-SUFFIX,challenges.cloudflare.com,Cloudflare',
    'DOMAIN,1.1.1.1,Cloudflare',

    // 下载专用组

    'DOMAIN-SUFFIX,download.windowsupdate.com,下载专用组',
    'DOMAIN-SUFFIX,windowsupdate.com,下载专用组',
    'DOMAIN-SUFFIX,update.microsoft.com,下载专用组',
    'DOMAIN-SUFFIX,delivery.mp.microsoft.com,下载专用组',
    'DOMAIN-SUFFIX,download.jetbrains.com,下载专用组',
    'DOMAIN-SUFFIX,download.docker.com,下载专用组',
    'DOMAIN-SUFFIX,packages.microsoft.com,下载专用组',
    'DOMAIN-SUFFIX,download.visualstudio.microsoft.com,下载专用组',
    'DOMAIN-SUFFIX,speed.hetzner.de,下载专用组',

    // 国外游戏

    'DOMAIN-SUFFIX,steamcommunity.com,国外游戏',
    'DOMAIN-SUFFIX,steampowered.com,国外游戏',
    'DOMAIN-SUFFIX,steamstatic.com,国外游戏',
    'DOMAIN-SUFFIX,steamcdn-a.akamaihd.net,国外游戏',
    'DOMAIN-SUFFIX,steamserver.net,国外游戏',
    'DOMAIN-SUFFIX,steamcontent.com,国外游戏',
    'DOMAIN-SUFFIX,steampipe.akamaized.net,国外游戏',
    'DOMAIN-SUFFIX,epicgames.com,国外游戏',
    'DOMAIN-SUFFIX,unrealengine.com,国外游戏',
    'DOMAIN-SUFFIX,epicgames-download1.akamaized.net,国外游戏',
    'DOMAIN-SUFFIX,download.epicgames.com,国外游戏',
    'DOMAIN-SUFFIX,riotgames.com,国外游戏',
    'DOMAIN-SUFFIX,leagueoflegends.com,国外游戏',
    'DOMAIN-SUFFIX,playvalorant.com,国外游戏',
    'DOMAIN-SUFFIX,riotcdn.net,国外游戏',
    'DOMAIN-SUFFIX,lol.secure.dyn.riotcdn.net,国外游戏',
    // Blizzard
    'DOMAIN-SUFFIX,battle.net,国外游戏',
    'DOMAIN-SUFFIX,blizzard.com,国外游戏',

    'DOMAIN-SUFFIX,blzddist1-a.akamaihd.net,国外游戏',

    // EA
    'DOMAIN-SUFFIX,ea.com,国外游戏',
    'DOMAIN-SUFFIX,origin.com,国外游戏',
    'DOMAIN-SUFFIX,origin-a.akamaihd.net,国外游戏',

    // Ubisoft
    'DOMAIN-SUFFIX,uplay.com,国外游戏',
    'DOMAIN-SUFFIX,ubisoft.com,国外游戏',
    'DOMAIN-SUFFIX,cdn.ubisoft.com,国外游戏',

    // Rockstar / GOG
    'DOMAIN-SUFFIX,rockstargames.com,国外游戏',
    'DOMAIN-SUFFIX,gog.com,国外游戏',

    // Roblox
    'DOMAIN-SUFFIX,roblox.com,国外游戏',
    'DOMAIN-SUFFIX,rbxcdn.com,国外游戏',

    // Mojang / Minecraft
    'DOMAIN-SUFFIX,minecraft.net,国外游戏',
    'DOMAIN-SUFFIX,mojang.com,国外游戏',
    'DOMAIN-SUFFIX,launcher.mojang.com,国外游戏',
    'DOMAIN-SUFFIX,piston-meta.mojang.com,国外游戏',

    // Nintendo
    'DOMAIN-SUFFIX,nintendo.com,国外游戏',
    'DOMAIN-SUFFIX,nintendo.net,国外游戏',
    'DOMAIN-SUFFIX,nintendo.co.jp,国外游戏',
    'DOMAIN-SUFFIX,cdn.nintendo.net,国外游戏',

    // PlayStation
    'DOMAIN-SUFFIX,sonyentertainmentnetwork.com,国外游戏',
    'DOMAIN-SUFFIX,playstation.com,国外游戏',
    'DOMAIN-SUFFIX,playstation.net,国外游戏',
    'DOMAIN-SUFFIX,psnprofiles.com,国外游戏',

    // Xbox Services
    'DOMAIN-SUFFIX,xboxservices.com,国外游戏',

    // Supercell
    'DOMAIN-SUFFIX,supercell.com,国外游戏',
    'DOMAIN-SUFFIX,supercell.net,国外游戏',

    // GitHub

    'DOMAIN-SUFFIX,github.com,GitHub',

    'DOMAIN-SUFFIX,githubusercontent.com,GitHub',
    'DOMAIN-SUFFIX,raw.githubusercontent.com,GitHub',
    'DOMAIN-SUFFIX,media.githubusercontent.com,GitHub',
    'DOMAIN-SUFFIX,codeload.github.com,GitHub',
    'DOMAIN-SUFFIX,objects.githubusercontent.com,GitHub',
    'DOMAIN-SUFFIX,release-assets.githubusercontent.com,GitHub',
    'DOMAIN-SUFFIX,github-releases.githubusercontent.com,GitHub',
    'DOMAIN-SUFFIX,githubassets.com,GitHub',
    'DOMAIN-SUFFIX,github.io,GitHub',
    'DOMAIN-SUFFIX,githubapp.com,GitHub',
    'DOMAIN-SUFFIX,github.dev,GitHub',

    // 微软服务
    'DOMAIN-SUFFIX,microsoft.com,微软服务',
    'DOMAIN-SUFFIX,microsoftonline.com,微软服务',
    'DOMAIN-SUFFIX,live.com,微软服务',
    'DOMAIN-SUFFIX,live.net,微软服务',
    'DOMAIN-SUFFIX,outlook.com,微软服务',
    'DOMAIN-SUFFIX,officeapps.live.com,微软服务',
    'DOMAIN-SUFFIX,onedrive.com,微软服务',
    'DOMAIN-SUFFIX,bing.com,微软服务',
    'DOMAIN-SUFFIX,bingapis.com,微软服务',
    'DOMAIN-SUFFIX,bingstatic.com,微软服务',
    'DOMAIN-SUFFIX,copilot.microsoft.com,微软服务',
    'DOMAIN-SUFFIX,msn.com,微软服务',
    'DOMAIN-SUFFIX,office.com,微软服务',
    'DOMAIN-SUFFIX,office.net,微软服务',
    'DOMAIN-SUFFIX,office365.com,微软服务',
    'DOMAIN-SUFFIX,microsoft365.com,微软服务',
    'DOMAIN-SUFFIX,sharepoint.com,微软服务',
    'DOMAIN-SUFFIX,skype.com,微软服务',
    'DOMAIN-SUFFIX,teams.microsoft.com,微软服务',
    'DOMAIN-SUFFIX,xbox.com,微软服务',
    'DOMAIN-SUFFIX,xboxlive.com,微软服务',

    // 流媒体
    'DOMAIN-SUFFIX,netflix.com,流媒体',
    'DOMAIN-SUFFIX,nflxvideo.net,流媒体',
    'DOMAIN-SUFFIX,nflximg.net,流媒体',
    'DOMAIN-SUFFIX,nflxext.com,流媒体',
    'DOMAIN-SUFFIX,nflxso.net,流媒体',
    'DOMAIN-SUFFIX,netflix.net,流媒体',
    'DOMAIN-SUFFIX,disneyplus.com,流媒体',
    'DOMAIN-SUFFIX,disney-plus.net,流媒体',
    'DOMAIN-SUFFIX,dssott.com,流媒体',
    'DOMAIN-SUFFIX,bamgrid.com,流媒体',
    'DOMAIN-SUFFIX,primevideo.com,流媒体',
    'DOMAIN-SUFFIX,amazonvideo.com,流媒体',
    'DOMAIN-SUFFIX,media-amazon.com,流媒体',
    'DOMAIN-SUFFIX,max.com,流媒体',
    'DOMAIN-SUFFIX,hbomax.com,流媒体',
    'DOMAIN-SUFFIX,hbo.com,流媒体',
    'DOMAIN-SUFFIX,hulu.com,流媒体',
    'DOMAIN-SUFFIX,huluim.com,流媒体',
    'DOMAIN-SUFFIX,appletvplus.com,流媒体',
    'DOMAIN-SUFFIX,tv.apple.com,流媒体',
    'DOMAIN-SUFFIX,video.apple.com,流媒体',
    'DOMAIN-SUFFIX,paramountplus.com,流媒体',
    'DOMAIN-SUFFIX,cbsi.com,流媒体',
    'DOMAIN-SUFFIX,peacocktv.com,流媒体',
    'DOMAIN-SUFFIX,crunchyroll.com,流媒体',
    'DOMAIN-SUFFIX,crunchyrollsvc.com,流媒体',

    // Meta
    'DOMAIN-SUFFIX,facebook.com,Meta',

    'DOMAIN-SUFFIX,facebook.net,Meta',
    'DOMAIN-SUFFIX,fb.com,Meta',
    'DOMAIN-SUFFIX,fbcdn.net,Meta',
    'DOMAIN-SUFFIX,fbsbx.com,Meta',
    'DOMAIN-SUFFIX,tfbnw.net,Meta',
    'DOMAIN-SUFFIX,messenger.com,Meta',
    'DOMAIN-SUFFIX,m.me,Meta',
    'DOMAIN-SUFFIX,instagram.com,Meta',
    'DOMAIN-SUFFIX,cdninstagram.com,Meta',
    'DOMAIN-SUFFIX,ig.me,Meta',
    'DOMAIN-SUFFIX,threads.net,Meta',
    'DOMAIN-SUFFIX,threadsdotnet.com,Meta',
    'DOMAIN-SUFFIX,whatsapp.com,Meta',
    'DOMAIN-SUFFIX,whatsapp.net,Meta',

    // Spotify
    'DOMAIN-SUFFIX,spotify.com,Spotify',
    'DOMAIN-SUFFIX,spotifycdn.com,Spotify',
    'DOMAIN-SUFFIX,scdn.co,Spotify',
    'DOMAIN-SUFFIX,spoti.fi,Spotify',
    // Telegram
    'PROCESS-NAME,org.telegram.messenger,Telegram',
    'PROCESS-NAME,org.telegram.messenger.web,Telegram',
    'PROCESS-NAME,com.exteragram.messenger,Telegram',
    'PROCESS-NAME,nekox.messenger,Telegram',
    'PROCESS-NAME,tw.nekomimi.nekogram,Telegram',
    'PROCESS-NAME,xyz.nextalone.nagram,Telegram',
    'PROCESS-NAME,org.telegram.plus,Telegram',
    'PROCESS-NAME,ellipi.messenger,Telegram',
    'DOMAIN-SUFFIX,telegram.org,Telegram',

    'DOMAIN-SUFFIX,t.me,Telegram',
    'DOMAIN-SUFFIX,telegra.ph,Telegram',
    'DOMAIN-SUFFIX,telesco.pe,Telegram',
    'DOMAIN-SUFFIX,telegram.me,Telegram',
    'DOMAIN-SUFFIX,telegram.dog,Telegram',
    'DOMAIN-SUFFIX,telegram-cdn.org,Telegram',
    'DOMAIN-SUFFIX,telegram.space,Telegram',
    'DOMAIN-SUFFIX,tg.dev,Telegram',
    'DOMAIN-SUFFIX,tdesktop.com,Telegram',
    'DOMAIN-SUFFIX,usercontent.dev,Telegram',
    'DOMAIN-SUFFIX,graph.org,Telegram',
    'DOMAIN-KEYWORD,telegram,Telegram',
    'DOMAIN-KEYWORD,tg,Telegram',
    'IP-CIDR,91.108.4.0/22,Telegram,no-resolve',
    'IP-CIDR,91.108.8.0/21,Telegram,no-resolve',
    'IP-CIDR,91.108.12.0/22,Telegram,no-resolve',
    'IP-CIDR,91.108.16.0/22,Telegram,no-resolve',
    'IP-CIDR,91.108.20.0/22,Telegram,no-resolve',
    'IP-CIDR,91.108.56.0/22,Telegram,no-resolve',
    'IP-CIDR,91.105.192.0/23,Telegram,no-resolve',
    'IP-CIDR,149.154.160.0/20,Telegram,no-resolve',
    'IP-CIDR6,2001:b28:f23d::/48,Telegram,no-resolve',
    'IP-CIDR6,2001:b28:f23f::/48,Telegram,no-resolve',
    'IP-CIDR6,2001:67c:4e8::/48,Telegram,no-resolve',

    // Google 通用服务


    'DOMAIN,dns.google,Google',
    'DOMAIN,dns.google.com,Google',
    'DOMAIN,mail.google.com,Google',
    'DOMAIN-SUFFIX,google.com,Google',
    'DOMAIN-SUFFIX,googleapis.com,Google',
    'DOMAIN-SUFFIX,gstatic.com,Google',
    'DOMAIN-SUFFIX,gmail.com,Google',
    'DOMAIN-SUFFIX,googlemail.com,Google',
    'DOMAIN-SUFFIX,ggpht.cn,Google',
    'DOMAIN-SUFFIX,googleusercontent.com,Google',
    'DOMAIN-SUFFIX,googleusercontent.cn,Google',
    'DOMAIN-SUFFIX,withgoogle.com,Google',
    'DOMAIN-SUFFIX,gvt1.com,Google',
    'DOMAIN-SUFFIX,gvt2.com,Google',
    'DOMAIN-SUFFIX,gvt3.com,Google',
    'DOMAIN-SUFFIX,xn--ngstr-lra8j.com,Google',
    'DOMAIN-SUFFIX,g.co,Google',
    'DOMAIN-SUFFIX,goo.gl,Google',
    'DOMAIN-SUFFIX,googleearth.com,Google',
    'DOMAIN-SUFFIX,clients1.google.com,Google',
    'DOMAIN-SUFFIX,clients2.google.com,Google',
    'DOMAIN-SUFFIX,clients3.google.com,Google',
    'DOMAIN-SUFFIX,clients4.google.com,Google',
    'DOMAIN-SUFFIX,clients5.google.com,Google',
    'DOMAIN-SUFFIX,clients6.google.com,Google',
    'DOMAIN-SUFFIX,clients.googleapis.com,Google',
    'DOMAIN-SUFFIX,ogs.google.com,Google',
    'DOMAIN-SUFFIX,accounts.google.com,Google',
    'DOMAIN-SUFFIX,myaccount.google.com,Google',
    'DOMAIN-SUFFIX,workspace.google.com,Google',
    'DOMAIN-SUFFIX,one.google.com,Google',
    'DOMAIN-SUFFIX,lens.google.com,Google',
    'DOMAIN-SUFFIX,photos.google.com,Google',
    'DOMAIN-SUFFIX,maps.google.com,Google',
    'DOMAIN-SUFFIX,maps.gstatic.com,Google',
    'DOMAIN-SUFFIX,news.google.com,Google',
    'DOMAIN-SUFFIX,meet.google.com,Google',
    'DOMAIN-SUFFIX,chat.google.com,Google',
    'DOMAIN-SUFFIX,drive.google.com,Google',
    'DOMAIN-SUFFIX,docs.google.com,Google',
    'DOMAIN-SUFFIX,sheets.google.com,Google',
    'DOMAIN-SUFFIX,slides.google.com,Google',
    'DOMAIN-SUFFIX,classroom.google.com,Google',
    'DOMAIN-SUFFIX,calendar.google.com,Google',
    'DOMAIN-SUFFIX,contacts.google.com,Google',
    'DOMAIN-SUFFIX,keep.google.com,Google',
    'DOMAIN-SUFFIX,translate.google.com,Google',
    'DOMAIN-SUFFIX,earth.google.com,Google',

    // Twitter / X
    'DOMAIN-SUFFIX,x.com,Twitter',
    'DOMAIN-SUFFIX,twitter.com,Twitter',

    'DOMAIN-SUFFIX,twimg.com,Twitter',
    'DOMAIN-SUFFIX,t.co,Twitter',
    'DOMAIN-SUFFIX,pscp.tv,Twitter',
    'DOMAIN-SUFFIX,periscope.tv,Twitter',

    // 社交信息流
    'DOMAIN-SUFFIX,reddit.com,社交信息流',
    'DOMAIN-SUFFIX,redditinc.com,社交信息流',
    'DOMAIN-SUFFIX,redditmedia.com,社交信息流',
    'DOMAIN-SUFFIX,redditstatic.com,社交信息流',
    'DOMAIN-SUFFIX,redditspace.com,社交信息流',
    'DOMAIN-SUFFIX,redd.it,社交信息流',
    'DOMAIN,reddit.map.fastly.net,社交信息流',
    'DOMAIN-SUFFIX,discord.com,社交信息流',
    'DOMAIN-SUFFIX,discord.gg,社交信息流',
    'DOMAIN-SUFFIX,discord.gift,社交信息流',
    'DOMAIN-SUFFIX,discord.new,社交信息流',
    'DOMAIN-SUFFIX,discordapp.com,社交信息流',
    'DOMAIN-SUFFIX,discordapp.net,社交信息流',
    'DOMAIN-SUFFIX,discordcdn.com,社交信息流',
    'DOMAIN-SUFFIX,discord.media,社交信息流',
    'DOMAIN-SUFFIX,discordsays.com,社交信息流',
    'DOMAIN-SUFFIX,dis.gd,社交信息流',
    'DOMAIN-SUFFIX,flr.app,社交信息流',

    // 去中心化平台
    'DOMAIN-SUFFIX,bluesky.app,去中心化平台',
    'DOMAIN-SUFFIX,bsky.app,去中心化平台',
    'DOMAIN-SUFFIX,bsky.social,去中心化平台',
    'DOMAIN-SUFFIX,bsky.network,去中心化平台',
    'DOMAIN-SUFFIX,bsky.chat,去中心化平台',
    'DOMAIN-SUFFIX,skyfeed.app,去中心化平台',
    'DOMAIN-SUFFIX,skyfeed.me,去中心化平台',
    'DOMAIN-SUFFIX,clearsky.app,去中心化平台',
    'DOMAIN-SUFFIX,staging.bsky.dev,去中心化平台',
    'DOMAIN-SUFFIX,atproto.com,去中心化平台',
    'DOMAIN-SUFFIX,atproto.blue,去中心化平台',
    'DOMAIN-SUFFIX,atproto.plus,去中心化平台',
    'DOMAIN-SUFFIX,brid.gy,去中心化平台',
    'DOMAIN-SUFFIX,buffer.com,去中心化平台',
    'DOMAIN-SUFFIX,mastodon.social,去中心化平台',
    'DOMAIN-SUFFIX,mastodon.online,去中心化平台',
    'DOMAIN-SUFFIX,mastodon.cloud,去中心化平台',
    'DOMAIN-SUFFIX,mastodon.green,去中心化平台',
    'DOMAIN-SUFFIX,mastodon.world,去中心化平台',
    'DOMAIN-SUFFIX,mastodon.jp,去中心化平台',
    'DOMAIN-SUFFIX,mstdn.jp,去中心化平台',
    'DOMAIN-SUFFIX,mstdn.social,去中心化平台',
    'DOMAIN-SUFFIX,mastodon.uno,去中心化平台',
    'DOMAIN-SUFFIX,mas.to,去中心化平台',
    'DOMAIN-SUFFIX,pawoo.net,去中心化平台',
    'DOMAIN-SUFFIX,fedibird.com,去中心化平台',
    'DOMAIN-SUFFIX,otadon.com,去中心化平台',
    'DOMAIN-SUFFIX,friends.nico,去中心化平台',
    'DOMAIN-SUFFIX,joinmastodon.org,去中心化平台',
    'DOMAIN-SUFFIX,activitypub.rocks,去中心化平台',
    'DOMAIN-SUFFIX,activitypub.academy,去中心化平台',
    'DOMAIN-SUFFIX,joinfediverse.wiki,去中心化平台',
    'DOMAIN-SUFFIX,hachyderm.io,去中心化平台',
    'DOMAIN-SUFFIX,techhub.social,去中心化平台',
    'DOMAIN-SUFFIX,infosec.exchange,去中心化平台',
    'DOMAIN-SUFFIX,journa.host,去中心化平台',
    'DOMAIN-SUFFIX,mathstodon.xyz,去中心化平台',
    'DOMAIN-SUFFIX,universeodon.com,去中心化平台',
    'DOMAIN-SUFFIX,fosstodon.org,去中心化平台',
    'DOMAIN-SUFFIX,bsd.network,去中心化平台',
    'DOMAIN-SUFFIX,hostux.social,去中心化平台',
    'DOMAIN-SUFFIX,dice.camp,去中心化平台',
    'DOMAIN-SUFFIX,misskey.io,去中心化平台',
    'DOMAIN-SUFFIX,misskey.id,去中心化平台',
    'DOMAIN-SUFFIX,misskey.design,去中心化平台',
    'DOMAIN-SUFFIX,misskey.art,去中心化平台',
    'DOMAIN-SUFFIX,misskey.cloud,去中心化平台',
    'DOMAIN-SUFFIX,misskey.dev,去中心化平台',
    'DOMAIN-SUFFIX,misskey.gg,去中心化平台',
    'DOMAIN-SUFFIX,misskey.niri.la,去中心化平台',
    'DOMAIN-SUFFIX,misskey.pm,去中心化平台',
    'DOMAIN-SUFFIX,misskey.systems,去中心化平台',
    'DOMAIN-SUFFIX,misskey-square.net,去中心化平台',
    'DOMAIN-SUFFIX,nijimiss.moe,去中心化平台',
    'DOMAIN-SUFFIX,sushi.ski,去中心化平台',
    'DOMAIN-SUFFIX,yufan.me,去中心化平台',
    'DOMAIN-SUFFIX,firefish.social,去中心化平台',
    'DOMAIN-SUFFIX,firefish.city,去中心化平台',
    'DOMAIN-SUFFIX,firefish.nz,去中心化平台',
    'DOMAIN-SUFFIX,calckey.jp,去中心化平台',
    'DOMAIN-SUFFIX,calckey.world,去中心化平台',
    'DOMAIN-SUFFIX,lemmy.world,去中心化平台',
    'DOMAIN-SUFFIX,lemmy.ml,去中心化平台',
    'DOMAIN-SUFFIX,lemmy.zip,去中心化平台',
    'DOMAIN-SUFFIX,beehaw.org,去中心化平台',
    'DOMAIN-SUFFIX,sh.itjust.works,去中心化平台',
    'DOMAIN-SUFFIX,programming.dev,去中心化平台',
    'DOMAIN-SUFFIX,kbin.social,去中心化平台',
    'DOMAIN-SUFFIX,mbin.social,去中心化平台',
    'DOMAIN-SUFFIX,fedia.io,去中心化平台',
    'DOMAIN-SUFFIX,pleroma.social,去中心化平台',
    'DOMAIN-SUFFIX,pleroma.envs.net,去中心化平台',
    'DOMAIN-SUFFIX,akkoma.dev,去中心化平台',
    'DOMAIN-SUFFIX,social.seattle.wa.us,去中心化平台',
    'DOMAIN-SUFFIX,mk.absturztau.be,去中心化平台',
    'DOMAIN-SUFFIX,joinpeertube.org,去中心化平台',
    'DOMAIN-SUFFIX,peertube.tv,去中心化平台',
    'DOMAIN-SUFFIX,tilvids.com,去中心化平台',
    'DOMAIN-SUFFIX,diode.zone,去中心化平台',
    'DOMAIN-SUFFIX,pixelfed.social,去中心化平台',
    'DOMAIN-SUFFIX,pixelfed.de,去中心化平台',
    'DOMAIN-SUFFIX,pixelfed.uno,去中心化平台',
    'DOMAIN-SUFFIX,writefreely.org,去中心化平台',
    'DOMAIN-SUFFIX,write.as,去中心化平台',
    'DOMAIN-SUFFIX,mobilizon.org,去中心化平台',
    'DOMAIN-SUFFIX,friendi.ca,去中心化平台',
    'DOMAIN-SUFFIX,hubzilla.org,去中心化平台',
    'DOMAIN-SUFFIX,primal.net,去中心化平台',
    'DOMAIN-SUFFIX,damus.io,去中心化平台',
    'DOMAIN-SUFFIX,snort.social,去中心化平台',
    'DOMAIN-SUFFIX,nostr.band,去中心化平台',
    'DOMAIN-SUFFIX,iris.to,去中心化平台',
    'DOMAIN-SUFFIX,nostr.com,去中心化平台',

    // TikTok
    'DOMAIN-SUFFIX,tiktok.com,TikTok',
    'DOMAIN-SUFFIX,tiktokcdn.com,TikTok',
    'DOMAIN-SUFFIX,tiktokv.com,TikTok',
    'DOMAIN-SUFFIX,tiktokcdn-us.com,TikTok',
    'DOMAIN-SUFFIX,tiktokcdn-eu.com,TikTok',
    'DOMAIN-SUFFIX,tiktokrow-cdn.com,TikTok',
    'DOMAIN-SUFFIX,tiktokv.us,TikTok',
    'DOMAIN-SUFFIX,ibyteimg.com,TikTok',
    'DOMAIN-SUFFIX,ibytedtos.com,TikTok',
    'DOMAIN-SUFFIX,byteoversea.com,TikTok',
    'DOMAIN-SUFFIX,muscdn.com,TikTok',
    'DOMAIN-SUFFIX,musical.ly,TikTok',
    'DOMAIN-SUFFIX,tiktokd.org,TikTok',
    'DOMAIN-KEYWORD,tiktok,TikTok',
    'DOMAIN-KEYWORD,musical,TikTok',

    // 日韩生态区
    'DOMAIN-SUFFIX,line.me,日韩生态区',
    'DOMAIN-SUFFIX,line-apps.com,日韩生态区',
    'DOMAIN-SUFFIX,line-scdn.net,日韩生态区',
    'DOMAIN-SUFFIX,naver.com,日韩生态区',
    'DOMAIN-SUFFIX,naver.net,日韩生态区',
    'DOMAIN-SUFFIX,naver.jp,日韩生态区',
    'DOMAIN-SUFFIX,linecorp.com,日韩生态区',
    'DOMAIN-SUFFIX,band.us,日韩生态区',
    'DOMAIN-SUFFIX,weverse.io,日韩生态区',
    'DOMAIN-SUFFIX,weverseapi.io,日韩生态区',
    'DOMAIN-SUFFIX,weverseassets.io,日韩生态区',
    'DOMAIN-SUFFIX,ameba.jp,日韩生态区',
    'DOMAIN-SUFFIX,note.com,日韩生态区',
    'DOMAIN-SUFFIX,tapple.me,日韩生态区',
    'DOMAIN-SUFFIX,pixiv.net,日韩生态区',
    'DOMAIN-SUFFIX,pximg.net,日韩生态区',
    'DOMAIN-SUFFIX,fc2.com,日韩生态区',
    'DOMAIN-SUFFIX,fc2blog.net,日韩生态区',
    'DOMAIN-SUFFIX,livedoor.com,日韩生态区',
    'DOMAIN-SUFFIX,hatena.ne.jp,日韩生态区',
    'DOMAIN-SUFFIX,goo.ne.jp,日韩生态区',
    'DOMAIN-SUFFIX,abema.tv,日韩生态区',
    'DOMAIN-SUFFIX,tver.jp,日韩生态区',
    'DOMAIN-SUFFIX,ntv.co.jp,日韩生态区',
    'DOMAIN-SUFFIX,tbs.co.jp,日韩生态区',
    'DOMAIN-SUFFIX,nhk.or.jp,日韩生态区',
    'DOMAIN-SUFFIX,dmm.com,日韩生态区',
    'DOMAIN-SUFFIX,fanbox.cc,日韩生态区',
    'DOMAIN-SUFFIX,kakao.com,日韩生态区',
    'DOMAIN-SUFFIX,kakao.co.kr,日韩生态区',
    'DOMAIN-SUFFIX,kakaocdn.net,日韩生态区',
    'DOMAIN-SUFFIX,daum.net,日韩生态区',
    'DOMAIN-SUFFIX,dcinside.com,日韩生态区',
    'DOMAIN-SUFFIX,afreecatv.com,日韩生态区',
    'DOMAIN-SUFFIX,sooplive.co.kr,日韩生态区',
    'DOMAIN-SUFFIX,coupang.com,日韩生态区',
    'DOMAIN-SUFFIX,coupangcdn.com,日韩生态区',
    'DOMAIN-SUFFIX,nexon.com,日韩生态区',
    'DOMAIN-SUFFIX,nexon.co.jp,日韩生态区',

    // Niconico
    'DOMAIN-SUFFIX,nicovideo.jp,Niconico',
    'DOMAIN-SUFFIX,nimg.jp,Niconico',
    'DOMAIN-SUFFIX,nicofarre.com,Niconico',
    'DOMAIN-SUFFIX,smilevideo.jp,Niconico',
    'DOMAIN-SUFFIX,dmc.nico,Niconico',

    // 直连与兜底
    'GEOIP,CN,全球直连',
    'MATCH,漏网之鱼']);

  return config;
}
