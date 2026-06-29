/**
 * Clash 通用覆写脚本 - 自动分流和分组
 * 适用于各类 Clash 订阅
 * 创建时间: 2026-06-27
 * 
 * 功能特性:
 * - 自动按国家/地区分组节点
 * - 常用国外软件自动分流 (YouTube, Netflix, Telegram 等)
 * - 智能广告拦截
 * - 支持策略组自动切换
 */
function main(config) {
  // 初始化配置

  if (!config.proxies || !config['proxy-groups']) {
    return config;
  }


  // 持久化保存策略组选择与 fake-ip 缓存
  config.profile = {
    ...(config.profile || {}),
    'store-selected': true,
    'store-fake-ip': true
  };
  // 第四阶段：在保守前提下增强 DNS 稳定性与国内外分流解析质量
  config.dns = {
    enable: true,
    listen: '0.0.0.0:1053',
    ipv6: false,
    'prefer-h3': true,
    'respect-rules': true,
    'use-hosts': true,
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.1/16',
    'fake-ip-filter': [
      '*.lan',
      '*.local',
      '*.localdomain',
      '*.home.arpa',
      'localhost.ptlogin2.qq.com',
      'msftconnecttest.com',
      'msftncsi.com',
      'time.windows.com',
      'time.apple.com',
      'pool.ntp.org',
      'ntp.*.com',
      'ntp.*.cn',
      'stun.*.*',
      'stun.*.*.*',
      'stun.*',
      'turn.*',
      'turn.*.*',
      'relay.*',
      'cable.auth.com',
      '*.srv.nintendo.net',
      '*.stun.playstation.net',
      'xbox.*.microsoft.com',
      '*.xboxlive.com',
      '*.battle.net',
      '*.battlenet.com.cn',
      '*.wotgame.cn',
      '*.wggames.cn',
      '*.wowsgame.cn',
      '*.wargaming.net',
      'router.asus.com',
      'routerlogin.net',
      'www.routerlogin.com',
      'tplogin.cn',
      'tplinkwifi.net',
      'miwifi.com',
      'mediatek.com',
      'plex.direct'
    ],
    nameserver: [
      'https://dns.alidns.com/dns-query',
      'https://doh.pub/dns-query',
      '223.5.5.5',
      '119.29.29.29'
    ],
    'default-nameserver': ['223.5.5.5', '119.29.29.29'],
    'proxy-server-nameserver': [
      'https://dns.alidns.com/dns-query',
      'https://doh.pub/dns-query',
      'https://dns.cloudflare.com/dns-query',
      'https://dns.google/dns-query'
    ],
    'nameserver-policy': {
      'geosite:cn': ['https://dns.alidns.com/dns-query', 'https://doh.pub/dns-query'],
      'geosite:private': ['223.5.5.5', '119.29.29.29'],
      'geosite:geolocation-!cn': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'geosite:telegram': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'geosite:twitter': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'geosite:facebook': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],

      'geosite:instagram': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'geosite:whatsapp': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'domain:x.com': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'domain:twitter.com': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'domain:t.co': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'domain:twimg.com': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],

      'domain:facebook.com': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],

      'domain:fb.com': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'domain:meta.com': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'domain:fbsbx.com': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'domain:fbcdn.net': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'domain:tfbnw.net': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'domain:instagram.com': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'domain:instagr.am': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'domain:ig.me': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'domain:igcdn.com': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'domain:cdnig.com': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'domain:cdninstagram.com': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'domain:threads.net': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'domain:threadsdotnet.com': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query'],
      'domain:whatsapp.net': ['https://dns.cloudflare.com/dns-query', 'https://dns.google/dns-query']

    },

    'fallback-filter': {
      geoip: true,
      'geoip-code': 'CN',
      ipcidr: ['240.0.0.0/4'],
      domain: ['+.google.com', '+.youtube.com', '+.twitter.com', '+.x.com', '+.telegram.org', '+.t.me']
    },
    fallback: [
      'https://dns.cloudflare.com/dns-query',
      'https://dns.google/dns-query'
    ]

  };


  // 提取所有节点

  const rawProxies = config.proxies;

  // 过滤机场塞进订阅里的公告/说明类伪节点，避免污染自动选择与测速
  const invalidProxyNamePatterns = [
    /剩余流量/i,
    /重置/i,
    /到期/i,
    /官网/i,
    /官方/i,
    /公告/i,
    /通知/i,
    /最新/i,
    /售后/i,
    /telegram/i,
    /电报/i,
    /苹果设备/i,
    /安卓设备/i,
    /win系统/i,
    /windows/i,
    /仅支/i,
    /套餐/i,
    /订阅/i,
    /使用说明/i,
    /看不到节点/i,
    /更换客户端/i,
    /更换客/i,
    /请更换/i,
    /请使用/i,
    /客户端/i,
    /订阅失败/i,
    /更新订阅/i,
    /复制链接/i,
    /浏览器打开/i,
    /portal/i,
    /https?:\/\//i,
    /@\w+/i
  ];

  function isRealProxyName(name) {
    if (!name) return false;

    // 过滤像 "URLTEST · 21/41" 这类明显不是实际出口节点的统计/说明项
    if (/^(urltest|select|fallback)\b/i.test(name)) return false;
    if (/\b\d+\/\d+\b/.test(name)) return false;

    return !invalidProxyNamePatterns.some(re => re.test(name));
  }

  const proxies = rawProxies.filter(p => isRealProxyName(p.name));
  config.proxies = proxies;
  const allProxyNames = proxies.map(p => p.name);

  // 按国家/地区分类节点

  const nodeGroups = {
    '🇭🇰 香港节点': [],
    '🇹🇼 台湾节点': [],
    '🇯🇵 日本节点': [],
    '🇸🇬 新加坡节点': [],
    '🇺🇸 美国节点': [],
    '🇰🇷 韩国节点': [],
    '🇬🇧 英国节点': [],
    '🇩🇪 德国节点': [],
    '🇫🇷 法国节点': [],
    '🇨🇦 加拿大节点': [],
    '🇲🇴 澳门节点': [],
    '🇦🇺 澳大利亚节点': [],
    '🇮🇳 印度节点': [],

    '🇷🇺 俄罗斯节点': [],
    '🇧🇷 巴西节点': [],
    '🇦🇷 阿根廷节点': [],
    '🇹🇷 土耳其节点': [],
    '🇳🇱 荷兰节点': [],
    '🌍 其他节点': []
  };
  // 3B：增强地区识别，兼容脏命名/缩写/机场前缀后缀
  const keywordMap = {
    '🇭🇰 香港节点': ['香港', 'hk', 'hong kong', 'hongkong', 'hkg'],
    '🇹🇼 台湾节点': ['台湾', 'tw', 'taiwan', 'taipei', 'taichung', 'kaohsiung'],
    '🇯🇵 日本节点': ['日本', 'jp', 'japan', 'tokyo', 'osaka', 'nagoya', 'saitama'],
    '🇸🇬 新加坡节点': ['新加坡', 'sg', 'singapore', 'sgp'],
    '🇺🇸 美国节点': ['美国', 'us', 'usa', 'united states', 'america', 'los angeles', 'san jose', 'seattle', 'chicago', 'new york', 'silicon valley', 'las vegas', 'phoenix', 'dallas'],
    '🇰🇷 韩国节点': ['韩国', 'kr', 'korea', 'seoul', 'busan'],
    '🇬🇧 英国节点': ['英国', 'gb', 'uk', 'britain', 'united kingdom', 'london', 'manchester'],
    '🇩🇪 德国节点': ['德国', 'de', 'germany', 'frankfurt', 'berlin', 'munich'],
    '🇫🇷 法国节点': ['法国', 'fr', 'france', 'paris', 'marseille'],
    '🇨🇦 加拿大节点': ['加拿大', 'ca', 'canada', 'toronto', 'vancouver', 'montreal'],
    '🇲🇴 澳门节点': ['澳门', 'mo', 'macao', 'macau', 'macao sar'],
    '🇦🇺 澳大利亚节点': ['澳大利亚', 'au', 'australia', 'sydney', 'melbourne', 'brisbane', 'perth'],
    '🇮🇳 印度节点': ['印度', 'in', 'india', 'mumbai', 'delhi', 'bangalore', 'chennai'],
    '🇷🇺 俄罗斯节点': ['俄罗斯', 'ru', 'russia', 'moscow', 'saint petersburg'],
    '🇧🇷 巴西节点': ['巴西', 'br', 'brazil', 'sao paulo', 'rio'],
    '🇦🇷 阿根廷节点': ['阿根廷', 'ar', 'argentina', 'buenos aires'],
    '🇹🇷 土耳其节点': ['土耳其', 'tr', 'turkey', 'istanbul', 'ankara'],
    '🇳🇱 荷兰节点': ['荷兰', 'nl', 'netherlands', 'amsterdam', 'rotterdam']
  };

  const regionPriority = [
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇯🇵 日本节点',
    '🇸🇬 新加坡节点',
    '🇺🇸 美国节点',
    '🇰🇷 韩国节点',
    '🇬🇧 英国节点',
    '🇩🇪 德国节点',
    '🇫🇷 法国节点',
    '🇨🇦 加拿大节点',
    '🇲🇴 澳门节点',
    '🇦🇺 澳大利亚节点',
    '🇮🇳 印度节点',
    '🇷🇺 俄罗斯节点',
    '🇧🇷 巴西节点',
    '🇦🇷 阿根廷节点',
    '🇹🇷 土耳其节点',
    '🇳🇱 荷兰节点'
  ];

  function normalizeProxyName(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ' ')
      .replace(/[\u2600-\u27BF]/gu, ' ')
      .replace(/[|｜¦•·・,，;；:：/\\_+-–—()[]{}<>【】「」『』]/g, ' ')
      .replace(/\b(vip|svip|倍率|x\d+|iepl|iplc|bgp|cn2|gia|game|games|gaming|stream|media|unlock|nf|奈飞|netflix|disney|hbo|max|prime|chatgpt|gpt|ai|home|residential|station|server|node|premium|traffic|test|testing|expire|plan|used)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function hasWholeWord(text, word) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(text);
  }

  function matchRegionByName(name) {
    const normalized = normalizeProxyName(name);
    if (!normalized) return null;

    const compact = normalized.replace(/\s+/g, '');

    for (const groupName of regionPriority) {
      const keywords = keywordMap[groupName] || [];
      for (const keyword of keywords) {
        const lowerKeyword = keyword.toLowerCase();
        if (/^[a-z]{2,3}$/.test(lowerKeyword)) {
          if (hasWholeWord(normalized, lowerKeyword)) {
            return groupName;
          }
          continue;
        }

        if (normalized.includes(lowerKeyword) || compact.includes(lowerKeyword.replace(/\s+/g, ''))) {
          return groupName;
        }
      }
    }

    // 二次回收：识别常见中转/专线/家宽/原生标签附近的地区词
    const recoveryPatterns = [
      ['🇭🇰 香港节点', /(香港|hong\s?kong|hongkong|\bhk\b|\bhkg\b)/i],
      ['🇹🇼 台湾节点', /(台湾|taiwan|taipei|taichung|kaohsiung|\btw\b)/i],
      ['🇯🇵 日本节点', /(日本|japan|tokyo|osaka|nagoya|\bjp\b)/i],
      ['🇸🇬 新加坡节点', /(新加坡|singapore|\bsg\b|\bsgp\b)/i],
      ['🇺🇸 美国节点', /(美国|united states|america|los angeles|san jose|new york|\bus\b|\busa\b)/i],
      ['🇰🇷 韩国节点', /(韩国|korea|seoul|busan|\bkr\b)/i]
    ];

    for (const [groupName, pattern] of recoveryPatterns) {
      if (pattern.test(normalized)) {
        return groupName;
      }
    }

    return null;
  }

  // 对节点进行分类
  for (const proxy of proxies) {
    const matchedGroup = matchRegionByName(proxy.name);
    if (matchedGroup) {
      nodeGroups[matchedGroup].push(proxy.name);
    } else {
      nodeGroups['🌍 其他节点'].push(proxy.name);
    }
  }



  // 过滤掉空的分组
  const validGroups = Object.entries(nodeGroups)
    .filter(([_, nodes]) => nodes.length > 0)
    .map(([name, _]) => name);

  // 保留已有策略组的手动选择顺序与当前项，尽量避免更新后丢失
  const existingGroups = Array.isArray(config['proxy-groups']) ? config['proxy-groups'] : [];
  const existingGroupMap = Object.fromEntries(existingGroups.map(g => [g.name, g]));

  function preserveGroup(group) {
    if (group.type !== 'select') {
      return group;
    }

    const oldGroup = existingGroupMap[group.name];
    if (!oldGroup || !Array.isArray(oldGroup.proxies) || !Array.isArray(group.proxies)) {
      return group;
    }

    const oldProxies = oldGroup.proxies.filter(p => group.proxies.includes(p));
    const remaining = group.proxies.filter(p => !oldProxies.includes(p));
    return {
      ...group,
      proxies: [...oldProxies, ...remaining]
    };
  }
  const testUrl = 'http://www.gstatic.com/generate_204';
  const testInterval = 300;

  const testTolerance = 50;
  const testLazy = true;

  function flattenGroupNodes(groupNames) {
    const seen = new Set();
    const result = [];
    for (const groupName of groupNames) {
      const nodes = nodeGroups[groupName] || [];
      for (const node of nodes) {
        if (!seen.has(node)) {
          seen.add(node);
          result.push(node);
        }
      }
    }
    return result;
  }
  const youtubeFallbackGroupOrder = [
    '🇷🇺 俄罗斯节点',
    '🇲🇴 澳门节点',
    '🇬🇧 英国节点',
    '🌍 其他节点',
    '🇭🇰 香港节点',
    '🇩🇪 德国节点',
    '🇸🇬 新加坡节点',
    '🇯🇵 日本节点',
    '🇰🇷 韩国节点',
    '🇹🇼 台湾节点'
  ].filter(name => validGroups.includes(name));

  const youtubeFallbackProxies = flattenGroupNodes(youtubeFallbackGroupOrder);
  const youtubeSelectProxies = [
    'YouTube故障转移',
    '港台故障转移',
    '节点选择',
    '自动选择',
    '🇷🇺 俄罗斯节点',
    '🇲🇴 澳门节点',
    '🇬🇧 英国节点',
    '🌍 其他节点',
    '🇭🇰 香港节点',
    '🇩🇪 德国节点',
    '🇸🇬 新加坡节点',
    '🇯🇵 日本节点',
    '🇰🇷 韩国节点',
    '🇹🇼 台湾节点',
    '🇺🇸 美国节点'
  ].filter(name => ['YouTube故障转移', '港台故障转移', '节点选择', '自动选择'].includes(name) || validGroups.includes(name));

  const aiFallbackGroupOrder = [
    '🇹🇼 台湾节点',
    '🇺🇸 美国节点',
    '🇯🇵 日本节点',
    '🇸🇬 新加坡节点',
    '🇰🇷 韩国节点',
    '🌍 其他节点'
  ].filter(name => validGroups.includes(name));
  const aiFallbackProxies = flattenGroupNodes(aiFallbackGroupOrder);
  const regionPresets = {
    metaPreferred: [
      '🇭🇰 香港节点',
      '🇹🇼 台湾节点',
      '🇯🇵 日本节点',
      '🇸🇬 新加坡节点',
      '🇰🇷 韩国节点',
      '🇺🇸 美国节点'
    ].filter(name => validGroups.includes(name)),
    socialPreferred: [
      '🇭🇰 香港节点',
      '🇹🇼 台湾节点',
      '🇯🇵 日本节点',
      '🇸🇬 新加坡节点',
      '🇰🇷 韩国节点',
      '🇺🇸 美国节点'
    ].filter(name => validGroups.includes(name)),
    tiktokPreferred: [
      '🇭🇰 香港节点',
      '🇹🇼 台湾节点'
    ].filter(name => validGroups.includes(name))
  };

  const metaAppProxies = flattenGroupNodes(regionPresets.metaPreferred);
  const facebookAppProxies = flattenGroupNodes(regionPresets.socialPreferred);
  const twitterAppProxies = flattenGroupNodes(regionPresets.socialPreferred);
  const instagramAppProxies = flattenGroupNodes(regionPresets.socialPreferred);
  const threadsAppProxies = flattenGroupNodes(regionPresets.socialPreferred);
  const tiktokAppProxies = flattenGroupNodes(regionPresets.tiktokPreferred);

  const aiSelectProxies = [

    '国外AI故障转移',
    '节点选择',
    '自动选择',
    '🇹🇼 台湾节点',
    '🇺🇸 美国节点',
    '🇯🇵 日本节点',
    '🇸🇬 新加坡节点',
    '🇰🇷 韩国节点',
    '🌍 其他节点'
  ].filter(name => ['国外AI故障转移', '节点选择', '自动选择'].includes(name) || validGroups.includes(name));
  const hkTwFallbackGroupOrder = [
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点'
  ].filter(name => validGroups.includes(name));
  const hkTwFallbackProxies = hkTwFallbackGroupOrder;


  const netflixSelectProxies = [

    '节点选择',
    '自动选择',
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇯🇵 日本节点',
    '🇺🇸 美国节点',
    '🇸🇬 新加坡节点'
  ].filter(name => ['节点选择', '自动选择'].includes(name) || validGroups.includes(name));

  const spotifySelectProxies = [
    '港台故障转移',
    '节点选择',
    '自动选择',
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇯🇵 日本节点',
    '🇺🇸 美国节点'
  ].filter(name => ['港台故障转移', '节点选择', '自动选择'].includes(name) || validGroups.includes(name));
  const telegramSelectProxies = [
    '自动选择',
    '节点选择',
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇸🇬 新加坡节点',
    '🇺🇸 美国节点'
  ].filter(name => ['节点选择', '自动选择'].includes(name) || validGroups.includes(name));





  // TikTok 使用专属 url-test，不再保留 select 备用数组





  const niconicoFallbackGroupOrder = [
    '🇯🇵 日本节点',
    '🇰🇷 韩国节点',
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇸🇬 新加坡节点'
  ].filter(name => validGroups.includes(name));
  const niconicoFallbackProxies = niconicoFallbackGroupOrder;

  const niconicoSelectProxies = [
    '日韩故障转移',
    '🇯🇵 日本节点',
    '🇰🇷 韩国节点',
    '节点选择',
    '自动选择',
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇸🇬 新加坡节点'
  ].filter(name => ['日韩故障转移', '节点选择', '自动选择'].includes(name) || validGroups.includes(name));
  const googleSelectProxies = [
    '港台故障转移',
    '节点选择',
    '自动选择',
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇺🇸 美国节点',
    '🇯🇵 日本节点'
  ].filter(name => ['港台故障转移', '节点选择', '自动选择'].includes(name) || validGroups.includes(name));
  const microsoftSelectProxies = [
    '全球直连',
    '节点选择',
    '自动选择',
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇺🇸 美国节点',
    '🇯🇵 日本节点'
  ].filter(name => ['全球直连', '节点选择', '自动选择'].includes(name) || validGroups.includes(name));
  const whatsappSelectProxies = [];



  const steamSelectProxies = [

    '节点选择',
    '自动选择',
    '全球直连',
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇯🇵 日本节点',
    '🇸🇬 新加坡节点',
    '🇺🇸 美国节点',
    '🌍 其他节点'
  ].filter(name => ['节点选择', '自动选择', '全球直连'].includes(name) || validGroups.includes(name));

  const jpEcoSelectProxies = [
    '日韩故障转移',
    '🇯🇵 日本节点',
    '🇰🇷 韩国节点',
    '港台故障转移',
    '节点选择',
    '自动选择',
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇸🇬 新加坡节点',
    '🌍 其他节点'
  ].filter(name => ['日韩故障转移', '港台故障转移', '节点选择', '自动选择'].includes(name) || validGroups.includes(name));

  const intlLiveSelectProxies = [
    '港台故障转移',
    '节点选择',
    '自动选择',
    '🇸🇬 新加坡节点',
    '🇺🇸 美国节点',
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇯🇵 日本节点',
    '🌍 其他节点'
  ].filter(name => ['港台故障转移', '节点选择', '自动选择'].includes(name) || validGroups.includes(name));

  const finalSelectProxies = [
    '自动选择',
    '港台故障转移',
    '节点选择',
    '全球直连'
  ];

  // 构建策略组
  const newProxyGroups = [
    // 主选择器
    {
      name: '节点选择',
      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Rocket.png',
      proxies: ['自动选择', '港台故障转移', '全球直连', ...validGroups, ...allProxyNames]
    },
    // 自动选择
    {
      name: '自动选择',
      type: 'url-test',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Auto.png',
      url: testUrl,
      interval: testInterval,
      tolerance: testTolerance,
      lazy: testLazy,
      proxies: allProxyNames
    },

    // 故障转移 / 自动测速组
    {
      name: '港台故障转移',
      type: 'fallback',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Available_1.png',
      url: testUrl,
      interval: testInterval,
      tolerance: testTolerance,
      lazy: testLazy,
      proxies: hkTwFallbackProxies.length > 0 ? hkTwFallbackProxies : ['自动选择']
    },
    {
      name: 'YouTube故障转移',
      type: 'fallback',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Proxy.png',
      url: testUrl,
      interval: testInterval,
      tolerance: testTolerance,
      lazy: testLazy,
      proxies: youtubeFallbackProxies.length > 0 ? youtubeFallbackProxies : ['自动选择']
    },
    {
      name: '日韩故障转移',
      type: 'fallback',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/JP.png',
      url: testUrl,
      interval: testInterval,
      tolerance: testTolerance,
      lazy: testLazy,
      proxies: niconicoFallbackProxies.length > 0 ? niconicoFallbackProxies : ['自动选择']
    },
    {
      name: '国外AI故障转移',
      type: 'fallback',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Proxy.png',
      url: testUrl,
      interval: testInterval,
      tolerance: testTolerance,
      lazy: testLazy,
      proxies: aiFallbackProxies.length > 0 ? aiFallbackProxies : ['自动选择']
    },
    // Meta故障转移组已移除，四个 Meta 主组直接使用专属 url-test
    // Twitter自动测速组已移除，Twitter 主组直接使用专属 url-test


    // 策略组
    {
      name: 'YouTube',
      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/YouTube.png',
      proxies: [...youtubeSelectProxies, ...allProxyNames]
    },
    {
      name: 'Netflix',
      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Netflix.png',
      proxies: [...netflixSelectProxies, ...allProxyNames]
    },
    {
      name: 'Spotify',
      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Spotify.png',
      proxies: [...spotifySelectProxies, ...allProxyNames]
    },
    {
      name: 'Telegram',
      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Telegram.png',
      proxies: [...telegramSelectProxies, ...allProxyNames]
    },
    {
      name: 'WhatsApp',
      type: 'url-test',
      icon: 'https://icons.duckduckgo.com/ip3/whatsapp.com.ico',
      url: 'https://www.whatsapp.com',
      interval: 180,
      tolerance: 30,
      lazy: testLazy,
      proxies: metaAppProxies.length > 0 ? metaAppProxies : ['自动选择']
    },

    {
      name: 'Google',
      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Google_Search.png',
      proxies: [...googleSelectProxies, ...allProxyNames]
    },
    {
      name: 'Facebook',
      type: 'url-test',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Facebook.png',
      url: 'https://www.facebook.com',
      interval: 180,
      tolerance: 30,
      lazy: testLazy,
      proxies: facebookAppProxies.length > 0 ? facebookAppProxies : ['自动选择']
    },
 
    {
      name: 'Twitter',
      type: 'url-test',
      icon: 'https://api.iconify.design/simple-icons:x.svg',
      url: 'https://x.com',
      interval: 180,
      tolerance: 30,
      lazy: testLazy,
      proxies: twitterAppProxies.length > 0 ? twitterAppProxies : ['自动选择']
    },
 
    {
      name: 'Instagram',
      type: 'url-test',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Instagram.png',
      url: 'https://www.instagram.com',
      interval: 180,
      tolerance: 30,
      lazy: testLazy,
      proxies: instagramAppProxies.length > 0 ? instagramAppProxies : ['自动选择']
    },
 
    {
      name: 'Threads',
      type: 'url-test',
      icon: 'https://icons.duckduckgo.com/ip3/threads.net.ico',
      url: 'https://www.threads.net',
      interval: 180,
      tolerance: 30,
      lazy: testLazy,
      proxies: threadsAppProxies.length > 0 ? threadsAppProxies : ['自动选择']
    },
 
 
 
    {
      name: 'TikTok',
      type: 'url-test',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/TikTok.png',
      url: 'https://www.tiktok.com',
      interval: 180,
      tolerance: 30,
      lazy: testLazy,
      proxies: tiktokAppProxies.length > 0 ? tiktokAppProxies : ['自动选择']
    },
    {
      name: 'Niconico',
      type: 'select',
      icon: 'https://api.iconify.design/simple-icons:niconico.svg',
      proxies: [...niconicoSelectProxies, ...allProxyNames]
    },

    {
      name: 'Steam',
      type: 'select',
      icon: 'https://icons.duckduckgo.com/ip3/steampowered.com.ico',
      proxies: [...steamSelectProxies, ...allProxyNames]
    },
    {
      name: '日韩生态',
      type: 'select',
      icon: 'https://api.iconify.design/mdi/alpha-j-circle.svg?color=%23007aff',
      proxies: [...jpEcoSelectProxies, ...allProxyNames]
    },
    {
      name: '国际直播',
      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Streaming.png',
      proxies: [...intlLiveSelectProxies, ...allProxyNames]
    },
    {
      name: 'Microsoft',
      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Microsoft.png',
      proxies: [...microsoftSelectProxies, ...allProxyNames]
    },
    {
      name: '谷歌商店',
      type: 'select',
      icon: 'https://api.iconify.design/logos:google-play-icon.svg',
      proxies: ['自动选择', ...googleSelectProxies.filter(p => p !== '自动选择'), ...allProxyNames.filter(p => p !== '自动选择')]
    },
    {
      name: '国外AI',
      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/ChatGPT.png',
      proxies: [...aiSelectProxies, ...allProxyNames]
    },

    {
      name: '国内服务',
      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/China.png',
      proxies: ['全球直连', '节点选择', '自动选择']
    },


    {
      name: '广告拦截',

      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Reject.png',
      proxies: ['REJECT', '全球直连', '节点选择']
    },
    {
      name: '漏网之鱼',
      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Final.png',
      proxies: [...finalSelectProxies, ...allProxyNames]
    },
    {
      name: '全球直连',
      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Direct.png',
      proxies: ['DIRECT']
    }
  ];

  // 国家/地区图标映射
  const countryIcons = {
    '🇭🇰 香港节点': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Hong_Kong.png',
    '🇹🇼 台湾节点': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Taiwan.png',
    '🇯🇵 日本节点': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Japan.png',
    '🇸🇬 新加坡节点': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Singapore.png',
    '🇺🇸 美国节点': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/United_States.png',
    '🇰🇷 韩国节点': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Korea.png',
    '🇬🇧 英国节点': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/United_Kingdom.png',
    '🇩🇪 德国节点': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Germany.png',
    '🇫🇷 法国节点': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/France.png',
    '🇨🇦 加拿大节点': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Canada.png',
    '🇦🇺 澳大利亚节点': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Australia.png',
    '🇮🇳 印度节点': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/India.png',
    '🇷🇺 俄罗斯节点': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Russia.png',
    '🇧🇷 巴西节点': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Brazil.png',
    '🇦🇷 阿根廷节点': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Argentina.png',
    '🇹🇷 土耳其节点': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Turkey.png',
    '🇳🇱 荷兰节点': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Netherlands.png',
    '🌍 其他节点': 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/World_Map.png'
  };

  // 为每个地区创建策略组（仅在本地区节点内自动选择最快）
  for (const [groupName, nodes] of Object.entries(nodeGroups)) {
    if (nodes.length > 0) {
      newProxyGroups.push({
        name: groupName,
        type: 'url-test',
        icon: countryIcons[groupName] || 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Global.png',
        url: testUrl,
        interval: testInterval,
        tolerance: testTolerance,
        lazy: testLazy,
        proxies: nodes
      });

    }
  }

  // 规则集
  const rules = [
    // 广告拦截
    'DOMAIN-KEYWORD,adservice,广告拦截',
    'DOMAIN-KEYWORD,analytics,广告拦截',
    'DOMAIN-SUFFIX,doubleclick.net,广告拦截',
    'DOMAIN-SUFFIX,googleadservices.com,广告拦截',
    'DOMAIN-SUFFIX,googlesyndication.com,广告拦截',
    'DOMAIN-SUFFIX,google-analytics.com,广告拦截',
    // 国外AI
    'DOMAIN-SUFFIX,openai.com,国外AI',
    'DOMAIN-SUFFIX,chatgpt.com,国外AI',
    'DOMAIN-SUFFIX,oaistatic.com,国外AI',
    'DOMAIN-SUFFIX,oaiusercontent.com,国外AI',
    'DOMAIN-SUFFIX,openaiapi-site.azureedge.net,国外AI',
    'DOMAIN-SUFFIX,identrust.com,国外AI',
    'DOMAIN-SUFFIX,ai.com,国外AI',
    'DOMAIN-SUFFIX,anthropic.com,国外AI',
    'DOMAIN-SUFFIX,claude.ai,国外AI',
    'DOMAIN-SUFFIX,claudeusercontent.com,国外AI',
    'DOMAIN-SUFFIX,perplexity.ai,国外AI',
    'DOMAIN-SUFFIX,perplexity.com,国外AI',
    'DOMAIN-SUFFIX,poe.com,国外AI',
    'DOMAIN-SUFFIX,poecdn.net,国外AI',
    'DOMAIN-SUFFIX,gemini.google.com,国外AI',
    'DOMAIN-SUFFIX,makersuite.google.com,国外AI',
    'DOMAIN-SUFFIX,deepmind.google,国外AI',
    'DOMAIN-SUFFIX,bard.google.com,国外AI',
    'DOMAIN-SUFFIX,notebooklm.google.com,国外AI',
    'DOMAIN-SUFFIX,notebooklm.google,国外AI',
    'DOMAIN-SUFFIX,api.anthropic.com,国外AI',
    'DOMAIN-SUFFIX,console.anthropic.com,国外AI',
    'DOMAIN-SUFFIX,consumer-api.openai.com,国外AI',
    'DOMAIN-SUFFIX,auth.openai.com,国外AI',
    'DOMAIN-SUFFIX,chat.openai.com,国外AI',
    'DOMAIN-SUFFIX,cdn.oaistatic.com,国外AI',
    'DOMAIN-SUFFIX,platform.openai.com,国外AI',
    'DOMAIN-SUFFIX,files.openai.com,国外AI',
    'DOMAIN-SUFFIX,slabs.com,国外AI',
    'DOMAIN-SUFFIX,linear.app,国外AI',
    'DOMAIN-SUFFIX,cursor.sh,国外AI',
    'DOMAIN-SUFFIX,cursor.com,国外AI',
    'DOMAIN-SUFFIX,copilot.microsoft.com,国外AI',
    'DOMAIN-SUFFIX,sydney.bing.com,国外AI',
    'DOMAIN-SUFFIX,bingapis.com,国外AI',
    'DOMAIN-SUFFIX,huggingface.co,国外AI',
    'DOMAIN-SUFFIX,hf.co,国外AI',
    'DOMAIN-SUFFIX,replicate.com,国外AI',
    'DOMAIN-SUFFIX,stability.ai,国外AI',
    'DOMAIN-SUFFIX,character.ai,国外AI',
    'DOMAIN-SUFFIX,inference.ai.azure.com,国外AI',
    'DOMAIN-SUFFIX,grok.com,国外AI',
    'DOMAIN-SUFFIX,x.ai,国外AI',

    'DOMAIN-KEYWORD,openai,国外AI',
    'DOMAIN-KEYWORD,chatgpt,国外AI',
    'DOMAIN-KEYWORD,anthropic,国外AI',
    'DOMAIN-KEYWORD,claude,国外AI',
    'DOMAIN-KEYWORD,perplexity,国外AI',
    'DOMAIN-KEYWORD,poe,国外AI',
    'DOMAIN-KEYWORD,gemini,国外AI',
    'DOMAIN-KEYWORD,makersuite,国外AI',
    'DOMAIN-KEYWORD,notebooklm,国外AI',
    'DOMAIN-KEYWORD,copilot,国外AI',
    'DOMAIN-KEYWORD,huggingface,国外AI',
    // YouTube
    'DOMAIN-SUFFIX,youtube.com,YouTube',
    'DOMAIN-SUFFIX,youtu.be,YouTube',
    'DOMAIN-SUFFIX,youtubei.googleapis.com,YouTube',
    'DOMAIN-SUFFIX,ytimg.com,YouTube',
    'DOMAIN-SUFFIX,ggpht.com,YouTube',
    'DOMAIN-SUFFIX,googlevideo.com,YouTube',
    'DOMAIN-SUFFIX,yt3.ggpht.com,YouTube',
    'DOMAIN-SUFFIX,yt4.ggpht.com,YouTube',
    'DOMAIN-KEYWORD,youtube,YouTube',
    'DOMAIN-KEYWORD,ytimg,YouTube',

    // Netflix
    'DOMAIN-SUFFIX,netflix.com,Netflix',
    'DOMAIN-SUFFIX,netflix.net,Netflix',
    'DOMAIN-SUFFIX,nflxext.com,Netflix',
    'DOMAIN-SUFFIX,nflximg.net,Netflix',
    'DOMAIN-SUFFIX,nflximg.com,Netflix',
    'DOMAIN-SUFFIX,nflxso.net,Netflix',
    'DOMAIN-SUFFIX,nflxvideo.net,Netflix',
    'DOMAIN-SUFFIX,nflxsearch.net,Netflix',
    'DOMAIN-SUFFIX,nflxcard.com,Netflix',
    'DOMAIN-SUFFIX,nflxmonica.com,Netflix',
    'DOMAIN-KEYWORD,netflix,Netflix',
    // Spotify
    'DOMAIN-SUFFIX,spotify.com,Spotify',
    'DOMAIN-SUFFIX,spotifycdn.com,Spotify',
    'DOMAIN-SUFFIX,scdn.co,Spotify',
    'DOMAIN-SUFFIX,spoti.fi,Spotify',
    'DOMAIN-SUFFIX,spotifycdn.net,Spotify',
    'DOMAIN-SUFFIX,audio-fa.scdn.co,Spotify',
    'DOMAIN-KEYWORD,spotify,Spotify',
    // Telegram
    'DOMAIN-SUFFIX,t.me,Telegram',
    'DOMAIN-SUFFIX,tdesktop.com,Telegram',
    'DOMAIN-SUFFIX,telegram.me,Telegram',
    'DOMAIN-SUFFIX,telegram.org,Telegram',
    'DOMAIN-SUFFIX,telegra.ph,Telegram',
    'DOMAIN-SUFFIX,telesco.pe,Telegram',
    'DOMAIN-SUFFIX,telegram-cdn.org,Telegram',
    'DOMAIN-SUFFIX,telegram.dog,Telegram',
    'DOMAIN-SUFFIX,tg.dev,Telegram',
    'DOMAIN-SUFFIX,tx.me,Telegram',
    'DOMAIN-SUFFIX,tgstat.ru,Telegram',
    'DOMAIN-KEYWORD,telegram,Telegram',

    'IP-CIDR,91.105.192.0/23,Telegram,no-resolve',
    'IP-CIDR,91.108.4.0/22,Telegram,no-resolve',
    'IP-CIDR,91.108.8.0/22,Telegram,no-resolve',
    'IP-CIDR,91.108.12.0/22,Telegram,no-resolve',
    'IP-CIDR,91.108.16.0/22,Telegram,no-resolve',
    'IP-CIDR,91.108.56.0/22,Telegram,no-resolve',
    'IP-CIDR,109.239.140.0/24,Telegram,no-resolve',
    'IP-CIDR,149.154.160.0/20,Telegram,no-resolve',
    'IP-CIDR,185.76.151.0/24,Telegram,no-resolve',
    // WhatsApp
    'DOMAIN-SUFFIX,whatsapp.com,WhatsApp',
    'DOMAIN-SUFFIX,whatsapp.net,WhatsApp',
    'DOMAIN-KEYWORD,whatsapp,WhatsApp',
    // Facebook
    'DOMAIN-SUFFIX,facebook.com,Facebook',
    'DOMAIN-SUFFIX,facebook.net,Facebook',
    'DOMAIN-SUFFIX,fbcdn.net,Facebook',
    'DOMAIN-SUFFIX,fbsbx.com,Facebook',
    'DOMAIN-SUFFIX,messenger.com,Facebook',
    'DOMAIN-SUFFIX,fb.com,Facebook',
    'DOMAIN-SUFFIX,meta.com,Facebook',
    'DOMAIN-SUFFIX,tfbnw.net,Facebook',
    'DOMAIN-KEYWORD,facebook,Facebook',
    'DOMAIN-KEYWORD,messenger,Facebook',


    // Twitter

    'DOMAIN-SUFFIX,twitter.com,Twitter',
    'DOMAIN-SUFFIX,twimg.com,Twitter',
    'DOMAIN-SUFFIX,t.co,Twitter',
    'DOMAIN-SUFFIX,x.com,Twitter',
    'DOMAIN-SUFFIX,abs.twimg.com,Twitter',
    'DOMAIN-SUFFIX,video.twimg.com,Twitter',
    'DOMAIN-SUFFIX,pbs.twimg.com,Twitter',
    'DOMAIN-SUFFIX,api.x.com,Twitter',
    'DOMAIN-SUFFIX,twitterapi.com,Twitter',
    'DOMAIN-KEYWORD,twitter,Twitter',
    // Instagram
    'DOMAIN-SUFFIX,instagram.com,Instagram',
    'DOMAIN-SUFFIX,cdninstagram.com,Instagram',
    'DOMAIN-SUFFIX,instagram.fna.fbcdn.net,Instagram',
    'DOMAIN-SUFFIX,i.instagram.com,Instagram',
    'DOMAIN-SUFFIX,ig.me,Instagram',
    'DOMAIN-SUFFIX,igcdn.com,Instagram',
    'DOMAIN-SUFFIX,cdnig.com,Instagram',
    'DOMAIN-SUFFIX,instagr.am,Instagram',
    'DOMAIN-KEYWORD,instagram,Instagram',

    // Threads
    'DOMAIN-SUFFIX,threads.net,Threads',
    'DOMAIN-SUFFIX,threads.com,Threads',
    'DOMAIN-SUFFIX,threadsdotnet.com,Threads',
    'DOMAIN-KEYWORD,threads,Threads',




    // TikTok
    'DOMAIN-SUFFIX,tiktok.com,TikTok',
    'DOMAIN-SUFFIX,tiktokv.com,TikTok',
    'DOMAIN-SUFFIX,tiktokcdn.com,TikTok',
    'DOMAIN-SUFFIX,tiktokcdn-us.com,TikTok',
    'DOMAIN-SUFFIX,byteoversea.com,TikTok',
    'DOMAIN-SUFFIX,ibytedtos.com,TikTok',
    'DOMAIN-SUFFIX,ibyteimg.com,TikTok',
    'DOMAIN-KEYWORD,tiktok,TikTok',
    // Niconico
    'DOMAIN-SUFFIX,nicovideo.jp,Niconico',
    'DOMAIN-SUFFIX,nimg.jp,Niconico',
    'DOMAIN-SUFFIX,smilevideo.jp,Niconico',
    'DOMAIN-SUFFIX,live.nicovideo.jp,Niconico',
    'DOMAIN-SUFFIX,secure-dcdn.cdn.nimg.jp,Niconico',
    'DOMAIN-KEYWORD,niconico,Niconico',
    'DOMAIN-KEYWORD,nicovideo,Niconico',
    // Steam
    'DOMAIN-SUFFIX,steamcommunity.com,Steam',
    'DOMAIN-SUFFIX,steampowered.com,Steam',
    'DOMAIN-SUFFIX,steamstatic.com,Steam',
    'DOMAIN-SUFFIX,steamcontent.com,Steam',
    'DOMAIN-SUFFIX,steamserver.net,Steam',
    'DOMAIN-SUFFIX,steam-chat.com,Steam',
    'DOMAIN-SUFFIX,steamgames.com,Steam',
    'DOMAIN-SUFFIX,valvesoftware.com,Steam',
    'DOMAIN-SUFFIX,steamusercontent.com,Steam',
    'DOMAIN-KEYWORD,steam,Steam',
    // Niconico
    'DOMAIN-SUFFIX,nicovideo.jp,Niconico',
    'DOMAIN-SUFFIX,nimg.jp,Niconico',
    'DOMAIN-SUFFIX,smilevideo.jp,Niconico',
    'DOMAIN-KEYWORD,niconico,Niconico',
    // Microsoft
    'DOMAIN-SUFFIX,microsoft.com,Microsoft',
    'DOMAIN-SUFFIX,live.com,Microsoft',
    'DOMAIN-SUFFIX,outlook.com,Microsoft',
    'DOMAIN-SUFFIX,office.com,Microsoft',
    'DOMAIN-KEYWORD,microsoft,Microsoft',
    'DOMAIN-KEYWORD,office,Microsoft',

    // 谷歌商店
    'DOMAIN-SUFFIX,play.google.com,谷歌商店',
    'DOMAIN-SUFFIX,play.googleapis.com,谷歌商店',
    'DOMAIN-SUFFIX,play-fe.googleapis.com,谷歌商店',
    'DOMAIN-SUFFIX,android.clients.google.com,谷歌商店',
    'DOMAIN-SUFFIX,android.googleapis.com,谷歌商店',
    'DOMAIN-SUFFIX,gvt1.com,谷歌商店',
    'DOMAIN-SUFFIX,gvt2.com,谷歌商店',
    'DOMAIN-SUFFIX,gvt3.com,谷歌商店',
    'DOMAIN-KEYWORD,googleplay,谷歌商店',

    // 国际直播 / 流媒体
    'DOMAIN-SUFFIX,twitch.tv,国际直播',
    'DOMAIN-SUFFIX,twitchcdn.net,国际直播',
    'DOMAIN-SUFFIX,ttvnw.net,国际直播',
    'DOMAIN-SUFFIX,live-video.net,国际直播',
    'DOMAIN-SUFFIX,pscp.tv,国际直播',
    'DOMAIN-SUFFIX,periscope.tv,国际直播',
    'DOMAIN-SUFFIX,afreecatv.com,国际直播',
    'DOMAIN-SUFFIX,sooplive.co.kr,国际直播',
    'DOMAIN-SUFFIX,bigo.tv,国际直播',
    'DOMAIN-SUFFIX,huya.com,国际直播',
    'DOMAIN-SUFFIX,douyu.com,国际直播',
    'DOMAIN-SUFFIX,trovo.live,国际直播',
    'DOMAIN-KEYWORD,twitch,国际直播',
    'DOMAIN-KEYWORD,streaming,国际直播',

    // 日韩生态（动画/社区/下载/搜索）
    'DOMAIN-SUFFIX,abema.tv,日韩生态',
    'DOMAIN-SUFFIX,abema.io,日韩生态',
    'DOMAIN-SUFFIX,dmm.co.jp,日韩生态',
    'DOMAIN-SUFFIX,dlsite.com,日韩生态',
    'DOMAIN-SUFFIX,melonbooks.co.jp,日韩生态',
    'DOMAIN-SUFFIX,bookwalker.jp,日韩生态',
    'DOMAIN-SUFFIX,fc2.com,日韩生态',
    'DOMAIN-SUFFIX,fc2live.co,日韩生态',
    'DOMAIN-SUFFIX,pixiv.net,日韩生态',
    'DOMAIN-SUFFIX,pximg.net,日韩生态',
    'DOMAIN-SUFFIX,line.me,日韩生态',
    'DOMAIN-SUFFIX,line-apps.com,日韩生态',
    'DOMAIN-SUFFIX,naver.com,日韩生态',
    'DOMAIN-SUFFIX,webtoons.com,日韩生态',
    'DOMAIN-SUFFIX,coupangplay.com,日韩生态',
    'DOMAIN-SUFFIX,tving.com,日韩生态',
    'DOMAIN-SUFFIX,wavve.com,日韩生态',
    'DOMAIN-SUFFIX,ani.gamer.com.tw,日韩生态',
    'DOMAIN-SUFFIX,bahamut.com.tw,日韩生态',
    'DOMAIN-SUFFIX,hmvod.com.hk,日韩生态',
    'DOMAIN-SUFFIX,mytvsuper.com,日韩生态',
    'DOMAIN-KEYWORD,pixiv,日韩生态',
    'DOMAIN-KEYWORD,line,日韩生态',

    // 国内服务
    'DOMAIN-SUFFIX,baidu.com,国内服务',
    'DOMAIN-SUFFIX,qq.com,国内服务',
    'DOMAIN-SUFFIX,taobao.com,国内服务',
    'DOMAIN-SUFFIX,bilibili.com,国内服务',
    'DOMAIN-SUFFIX,jd.com,国内服务',
    'DOMAIN-SUFFIX,163.com,国内服务',
    'DOMAIN-SUFFIX,weibo.com,国内服务',
    'DOMAIN-SUFFIX,douyin.com,国内服务',
    'DOMAIN-SUFFIX,iqiyi.com,国内服务',
    'DOMAIN-SUFFIX,youku.com,国内服务',
    'DOMAIN-SUFFIX,mgtv.com,国内服务',
    'DOMAIN-SUFFIX,zhihu.com,国内服务',
    'DOMAIN-SUFFIX,xiaohongshu.com,国内服务',
    'DOMAIN-KEYWORD,baidu,国内服务',
    'DOMAIN-KEYWORD,qq,国内服务',
    'DOMAIN-KEYWORD,wechat,国内服务',

    // 苹果/系统服务
    'DOMAIN-SUFFIX,apple.com,国内服务',
    'DOMAIN-SUFFIX,icloud.com,国内服务',
    'DOMAIN-SUFFIX,icloud-content.com,国内服务',
    'DOMAIN-SUFFIX,itunes.apple.com,国内服务',
    'DOMAIN-SUFFIX,apps.apple.com,国内服务',

    // 局域网/私有地址直连
    'DOMAIN-SUFFIX,local,全球直连',
    'IP-CIDR,10.0.0.0/8,全球直连,no-resolve',
    'IP-CIDR,100.64.0.0/10,全球直连,no-resolve',
    'IP-CIDR,127.0.0.0/8,全球直连,no-resolve',
    'IP-CIDR,169.254.0.0/16,全球直连,no-resolve',
    'IP-CIDR,172.16.0.0/12,全球直连,no-resolve',
    'IP-CIDR,192.168.0.0/16,全球直连,no-resolve',
    'IP-CIDR,224.0.0.0/4,全球直连,no-resolve',
    'IP-CIDR6,fc00::/7,全球直连,no-resolve',
    'IP-CIDR6,fe80::/10,全球直连,no-resolve',

    // 中国 IP / 中国域名优先直连
    'GEOIP,CN,国内服务',
    'MATCH,漏网之鱼'
  ];

  // 应用新策略组，并尽量保留旧 select 组的顺序偏好
  config['proxy-groups'] = newProxyGroups.map(preserveGroup);
  config.rules = rules;

  return config;
}
