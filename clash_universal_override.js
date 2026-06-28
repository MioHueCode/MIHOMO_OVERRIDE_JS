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

  // 精简 DNS：优先本地解析国内，兜底公共 DoH 提升境外域名解析稳定性
  config.dns = {
    enable: true,
    listen: '0.0.0.0:1053',
    ipv6: false,
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.1/16',
    nameserver: ['223.5.5.5', '119.29.29.29'],
    'fallback-filter': {
      geoip: true,
      'geoip-code': 'CN'
    },
    fallback: ['https://dns.google/dns-query', 'https://cloudflare-dns.com/dns-query']
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

  // 节点关键词映射
  const keywordMap = {
    '🇭🇰 香港节点': ['香港', 'HK', 'Hong Kong', 'HongKong', 'hongkong', '🇭🇰', 'Hongkong'],
    '🇹🇼 台湾节点': ['台湾', 'TW', 'Taiwan', 'taiwan', '🇹🇼', 'Taipei'],
    '🇯🇵 日本节点': ['日本', 'JP', 'Japan', 'japan', '🇯🇵', 'Tokyo', 'Osaka'],
    '🇸🇬 新加坡节点': ['新加坡', 'SG', 'Singapore', 'singapore', '🇸🇬'],
    '🇺🇸 美国节点': ['美国', 'US', 'USA', 'United States', 'America', 'america', '🇺🇸', 'Los Angeles', 'San Jose', 'Seattle', 'Chicago', 'New York'],
    '🇰🇷 韩国节点': ['韩国', 'KR', 'Korea', 'korea', '🇰🇷', 'Seoul'],
    '🇬🇧 英国节点': ['英国', 'GB', 'UK', 'Britain', 'United Kingdom', 'britain', '🇬🇧', 'London'],
    '🇩🇪 德国节点': ['德国', 'DE', 'Germany', 'germany', '🇩🇪', 'Frankfurt', 'Berlin'],
    '🇫🇷 法国节点': ['法国', 'FR', 'France', 'france', '🇫🇷', 'Paris'],
    '🇨🇦 加拿大节点': ['加拿大', 'CA', 'Canada', 'canada', '🇨🇦', 'Toronto', 'Vancouver'],
    '🇲🇴 澳门节点': ['澳门', 'MO', 'Macao', 'Macao SAR', 'Macau', 'macau', 'macao', '🇲🇴'],
    '🇦🇺 澳大利亚节点': ['澳大利亚', 'AU', 'Australia', 'australia', '🇦🇺', 'Sydney'],
    '🇮🇳 印度节点': ['印度', 'IN', 'India', 'india', '🇮🇳', 'Mumbai'],

    '🇷🇺 俄罗斯节点': ['俄罗斯', 'RU', 'Russia', 'russia', '🇷🇺', 'Moscow'],
    '🇧🇷 巴西节点': ['巴西', 'BR', 'Brazil', 'brazil', '🇧🇷'],
    '🇦🇷 阿根廷节点': ['阿根廷', 'AR', 'Argentina', 'argentina', '🇦🇷'],
    '🇹🇷 土耳其节点': ['土耳其', 'TR', 'Turkey', 'turkey', '🇹🇷', 'Istanbul'],
    '🇳🇱 荷兰节点': ['荷兰', 'NL', 'Netherlands', 'netherlands', '🇳🇱', 'Amsterdam']
  };

  // 对节点进行分类
  for (const proxy of proxies) {
    let matched = false;
    for (const [groupName, keywords] of Object.entries(keywordMap)) {
      if (keywords.some(keyword => proxy.name.includes(keyword))) {
        nodeGroups[groupName].push(proxy.name);
        matched = true;
        break;
      }
    }
    if (!matched) {
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
  const testInterval = 600;

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
  const aiFallbackProxies = [
    ...['🇹🇼 台湾节点', '🇺🇸 美国节点'].filter(name => validGroups.includes(name)),
    ...flattenGroupNodes(aiFallbackGroupOrder.filter(name => !['🇹🇼 台湾节点', '🇺🇸 美国节点'].includes(name)))
  ];

  const metaFallbackGroups = [
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇺🇸 美国节点',
    '🇯🇵 日本节点',
    '🇸🇬 新加坡节点',
    '🇰🇷 韩国节点',
    '🌍 其他节点'
  ].filter(name => validGroups.includes(name));
  const metaFallbackProxies = [
    ...['🇭🇰 香港节点', '🇹🇼 台湾节点'].filter(name => validGroups.includes(name)),
    ...flattenGroupNodes(metaFallbackGroups.filter(name => !['🇭🇰 香港节点', '🇹🇼 台湾节点'].includes(name)))
  ];

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


  const hkTwFallbackProxies = [
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点'
  ].filter(name => validGroups.includes(name));

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
  const facebookSelectProxies = [
    'Meta故障转移',
    '港台故障转移',
    '节点选择',
    '自动选择',
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇺🇸 美国节点'
  ].filter(name => ['Meta故障转移', '港台故障转移', '节点选择', '自动选择'].includes(name) || validGroups.includes(name));

  const twitterAutoTestProxies = [

    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇺🇸 美国节点',
    '🇯🇵 日本节点'
  ].filter(name => validGroups.includes(name));

  const twitterSelectProxies = [
    'Twitter自动测速',
    '港台故障转移',
    '节点选择',
    '自动选择',
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇺🇸 美国节点',
    '🇯🇵 日本节点'
  ].filter(name => ['Twitter自动测速', '港台故障转移', '节点选择', '自动选择'].includes(name) || validGroups.includes(name));
  const instagramSelectProxies = [
    'Meta故障转移',
    '港台故障转移',
    '节点选择',
    '自动选择',
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇺🇸 美国节点'
  ].filter(name => ['Meta故障转移', '港台故障转移', '节点选择', '自动选择'].includes(name) || validGroups.includes(name));
  const threadsSelectProxies = [
    'Meta故障转移',
    '港台故障转移',
    '节点选择',
    '自动选择',
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇺🇸 美国节点'
  ].filter(name => ['Meta故障转移', '港台故障转移', '节点选择', '自动选择'].includes(name) || validGroups.includes(name));



  const tiktokSelectProxies = [
    '港台故障转移',
    '节点选择',
    '自动选择',
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇯🇵 日本节点',
    '🇸🇬 新加坡节点',
    '🇺🇸 美国节点'
  ].filter(name => ['港台故障转移', '节点选择', '自动选择'].includes(name) || validGroups.includes(name));


  const niconicoFallbackGroupOrder = [
    '🇯🇵 日本节点',
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇸🇬 新加坡节点'
  ].filter(name => validGroups.includes(name));
  const niconicoFallbackProxies = [
    ...['🇯🇵 日本节点'].filter(name => validGroups.includes(name)),
    ...flattenGroupNodes(niconicoFallbackGroupOrder.filter(name => !['🇯🇵 日本节点'].includes(name)))
  ];

  const niconicoSelectProxies = [
    'Niconico故障转移',
    '🇯🇵 日本节点',
    '节点选择',
    '自动选择',
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇸🇬 新加坡节点'
  ].filter(name => ['Niconico故障转移', '节点选择', '自动选择'].includes(name) || validGroups.includes(name));

  const googleSelectProxies = [

    '港台故障转移',
    '节点选择',
    '自动选择',
    '🇭🇰 香港节点',
    '🇹🇼 台湾节点',
    '🇺🇸 美国节点',
    '🇯🇵 日本节点'
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

    // 故障转移组
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
      proxies: youtubeFallbackProxies.length > 0 ? youtubeFallbackProxies : ['节点选择']
    },
    {
      name: 'Niconico故障转移',
      type: 'fallback',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/JP.png',
      url: testUrl,
      interval: testInterval,
      tolerance: testTolerance,
      lazy: testLazy,
      proxies: niconicoFallbackProxies.length > 0 ? niconicoFallbackProxies : ['节点选择']
    },

    {
      name: '国外AI故障转移',
      type: 'fallback',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Proxy.png',
      url: testUrl,
      interval: testInterval,
      tolerance: testTolerance,
      lazy: testLazy,
      proxies: aiFallbackProxies.length > 0 ? aiFallbackProxies : ['节点选择']
    },
    {
      name: 'Meta故障转移',
      type: 'fallback',
      icon: 'https://api.iconify.design/logos:meta-icon.svg',
      url: testUrl,
      interval: testInterval,
      tolerance: testTolerance,
      lazy: testLazy,
      proxies: metaFallbackProxies.length > 0 ? metaFallbackProxies : ['港台故障转移', '节点选择']
    },
    {
      name: 'Twitter自动测速',
      type: 'url-test',
      icon: 'https://api.iconify.design/simple-icons:x.svg',
      url: testUrl,
      interval: testInterval,
      tolerance: testTolerance,
      lazy: testLazy,
      proxies: twitterAutoTestProxies.length > 0 ? flattenGroupNodes(twitterAutoTestProxies) : ['节点选择']
    },

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
      type: 'select',
      icon: 'https://icons.duckduckgo.com/ip3/whatsapp.com.ico',
      proxies: ['港台故障转移', '节点选择', '自动选择', ...allProxyNames]
    },
    {
      name: 'Facebook',
      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Facebook.png',
      proxies: [...facebookSelectProxies, ...allProxyNames]
    },
    {
      name: 'Twitter',
      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Twitter.png',
      proxies: [...twitterSelectProxies, ...allProxyNames]
    },
    {
      name: 'Instagram',
      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Instagram.png',
      proxies: [...instagramSelectProxies, ...allProxyNames]
    },
    {
      name: 'Threads',
      type: 'select',
      icon: 'https://icons.duckduckgo.com/ip3/threads.net.ico',
      proxies: [...threadsSelectProxies, ...allProxyNames]
    },
    {
      name: 'TikTok',
      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/TikTok.png',
      proxies: [...tiktokSelectProxies, ...allProxyNames]
    },
    {
      name: 'Niconico',
      type: 'select',
      icon: 'https://api.iconify.design/simple-icons:niconico.svg',
      proxies: [...niconicoSelectProxies, ...allProxyNames]
    },

    {
      name: '国外AI',
      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/ChatGPT.png',
      proxies: [...aiSelectProxies, ...allProxyNames]
    },
    {
      name: 'Microsoft',
      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Microsoft.png',
      proxies: ['全球直连', '节点选择', '自动选择', ...allProxyNames]
    },
    {
      name: 'Google',

      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Google_Search.png',

      proxies: [...googleSelectProxies, ...allProxyNames]
    },
    {
      name: '谷歌商店',

      type: 'select',
      icon: 'https://api.iconify.design/logos:google-play-icon.svg',
      proxies: ['自动选择', ...googleSelectProxies.filter(p => p !== '自动选择'), ...allProxyNames.filter(p => p !== '自动选择')]
    },

    {
      name: '国内服务',

      type: 'select',
      icon: 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/China.png',
      proxies: ['全球直连', '节点选择', '自动选择', ...allProxyNames]
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

    // 国外 AI
    'DOMAIN-SUFFIX,openai.com,国外AI',
    'DOMAIN-SUFFIX,ai.com,国外AI',
    'DOMAIN-SUFFIX,chatgpt.com,国外AI',
    'DOMAIN-KEYWORD,openai,国外AI',
    'DOMAIN-SUFFIX,claude.ai,国外AI',
    'DOMAIN-SUFFIX,anthropic.com,国外AI',
    'DOMAIN-SUFFIX,gemini.google.com,国外AI',
    'DOMAIN-SUFFIX,generativelanguage.googleapis.com,国外AI',
    'DOMAIN-SUFFIX,perplexity.ai,国外AI',
    'DOMAIN-SUFFIX,poe.com,国外AI',
    'DOMAIN-SUFFIX,x.ai,国外AI',
    'DOMAIN-SUFFIX,copilot.microsoft.com,国外AI',
    'DOMAIN-SUFFIX,bing.com,国外AI',
    'DOMAIN-SUFFIX,edgeservices.bing.com,国外AI',
    'DOMAIN-KEYWORD,claude,国外AI',
    'DOMAIN-KEYWORD,anthropic,国外AI',
    'DOMAIN-KEYWORD,gemini,国外AI',
    'DOMAIN-KEYWORD,perplexity,国外AI',
    'DOMAIN-KEYWORD,poe,国外AI',
    'DOMAIN-KEYWORD,copilot,国外AI',
    'DOMAIN-KEYWORD,bing,国外AI',

    // YouTube
    'DOMAIN-SUFFIX,youtube.com,YouTube',
    'DOMAIN-SUFFIX,googlevideo.com,YouTube',
    'DOMAIN-SUFFIX,ytimg.com,YouTube',
    'DOMAIN-SUFFIX,youtu.be,YouTube',
    'DOMAIN-KEYWORD,youtube,YouTube',

    // Netflix
    'DOMAIN-SUFFIX,netflix.com,Netflix',
    'DOMAIN-SUFFIX,nflxext.com,Netflix',
    'DOMAIN-SUFFIX,nflximg.net,Netflix',
    'DOMAIN-SUFFIX,nflxso.net,Netflix',
    'DOMAIN-SUFFIX,nflxvideo.net,Netflix',
    'DOMAIN-KEYWORD,netflix,Netflix',

    // Spotify
    'DOMAIN-SUFFIX,spotify.com,Spotify',
    'DOMAIN-SUFFIX,spotifycdn.com,Spotify',
    'DOMAIN-SUFFIX,scdn.co,Spotify',
    'DOMAIN-KEYWORD,spotify,Spotify',

    // Telegram
    'DOMAIN-SUFFIX,t.me,Telegram',
    'DOMAIN-SUFFIX,tdesktop.com,Telegram',
    'DOMAIN-SUFFIX,telegram.me,Telegram',
    'DOMAIN-SUFFIX,telegram.org,Telegram',
    'DOMAIN-SUFFIX,telegra.ph,Telegram',
    'DOMAIN-SUFFIX,telesco.pe,Telegram',
    'DOMAIN-KEYWORD,telegram,Telegram',
    'IP-CIDR,91.108.4.0/22,Telegram,no-resolve',
    'IP-CIDR,91.108.8.0/22,Telegram,no-resolve',
    'IP-CIDR,91.108.12.0/22,Telegram,no-resolve',
    'IP-CIDR,91.108.16.0/22,Telegram,no-resolve',
    'IP-CIDR,91.108.56.0/22,Telegram,no-resolve',
    'IP-CIDR,149.154.160.0/20,Telegram,no-resolve',

    // WhatsApp
    'DOMAIN-SUFFIX,whatsapp.com,WhatsApp',
    'DOMAIN-SUFFIX,whatsapp.net,WhatsApp',
    'DOMAIN-KEYWORD,whatsapp,WhatsApp',

    // Facebook
    'DOMAIN-SUFFIX,facebook.com,Facebook',
    'DOMAIN-SUFFIX,fbcdn.net,Facebook',
    'DOMAIN-SUFFIX,fb.com,Facebook',
    'DOMAIN-KEYWORD,facebook,Facebook',

    // Twitter
    'DOMAIN-SUFFIX,twitter.com,Twitter',
    'DOMAIN-SUFFIX,twimg.com,Twitter',
    'DOMAIN-SUFFIX,t.co,Twitter',
    'DOMAIN-SUFFIX,x.com,Twitter',
    'DOMAIN-KEYWORD,twitter,Twitter',

    // Instagram
    'DOMAIN-SUFFIX,instagram.com,Instagram',
    'DOMAIN-SUFFIX,cdninstagram.com,Instagram',
    'DOMAIN-KEYWORD,instagram,Instagram',

    // Threads
    'DOMAIN-SUFFIX,threads.net,Threads',
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
    'DOMAIN-KEYWORD,niconico,Niconico',
    'DOMAIN-KEYWORD,nicovideo,Niconico',
    // 谷歌商店
    'DOMAIN-SUFFIX,play.google.com,谷歌商店',
    'DOMAIN-SUFFIX,play.googleapis.com,谷歌商店',
    'DOMAIN-SUFFIX,android.clients.google.com,谷歌商店',
    'DOMAIN-SUFFIX,play-fe.googleapis.com,谷歌商店',
    'DOMAIN-SUFFIX,play-pa.googleapis.com,谷歌商店',
    'DOMAIN-SUFFIX,play-lh.googleusercontent.com,谷歌商店',
    'DOMAIN-SUFFIX,gvt1.com,谷歌商店',
    'DOMAIN-SUFFIX,gvt2.com,谷歌商店',
    'DOMAIN-SUFFIX,gvt3.com,谷歌商店',
    'DOMAIN-SUFFIX,ggpht.com,谷歌商店',

    // Google
    'DOMAIN-SUFFIX,google.com,Google',
    'DOMAIN-SUFFIX,googleapis.com,Google',
    'DOMAIN-SUFFIX,googleusercontent.com,Google',
    'DOMAIN-SUFFIX,gstatic.com,Google',
    'DOMAIN-SUFFIX,gmail.com,Google',
    'DOMAIN-KEYWORD,google,Google',
    // 国内服务

    'DOMAIN-SUFFIX,cn,国内服务',
    'DOMAIN-SUFFIX,360.cn,国内服务',
    'DOMAIN-SUFFIX,360.com,国内服务',
    'DOMAIN-SUFFIX,bilibili.com,国内服务',
    'DOMAIN-SUFFIX,bilivideo.com,国内服务',
    'DOMAIN-SUFFIX,hdslb.com,国内服务',
    'DOMAIN-SUFFIX,b23.tv,国内服务',
    'DOMAIN-SUFFIX,douyin.com,国内服务',
    'DOMAIN-SUFFIX,douyinvod.com,国内服务',
    'DOMAIN-SUFFIX,douyincdn.com,国内服务',
    'DOMAIN-SUFFIX,douyinpic.com,国内服务',
    'DOMAIN-SUFFIX,douyinstatic.com,国内服务',
    'DOMAIN-SUFFIX,byteimg.com,国内服务',
    'DOMAIN-SUFFIX,bytedance.com,国内服务',
    'DOMAIN-SUFFIX,bytegecko.com,国内服务',
    'DOMAIN-SUFFIX,bytegoofy.com,国内服务',
    'DOMAIN-SUFFIX,ibytedapm.com,国内服务',
    'DOMAIN-SUFFIX,zijieapi.com,国内服务',
    'DOMAIN-SUFFIX,amemv.com,国内服务',
    'DOMAIN-SUFFIX,snssdk.com,国内服务',
    'DOMAIN-SUFFIX,ixigua.com,国内服务',
    'DOMAIN-SUFFIX,toutiao.com,国内服务',
    'DOMAIN-KEYWORD,douyin,国内服务',
    'DOMAIN-KEYWORD,amemv,国内服务',
    'DOMAIN-KEYWORD,bytedance,国内服务',
    'DOMAIN-KEYWORD,snssdk,国内服务',

    'DOMAIN-SUFFIX,qq.com,国内服务',
    'DOMAIN-SUFFIX,weixin.qq.com,国内服务',
    'DOMAIN-SUFFIX,gtimg.com,国内服务',
    'DOMAIN-SUFFIX,qpic.cn,国内服务',
    'DOMAIN-SUFFIX,qlogo.cn,国内服务',
    'DOMAIN-SUFFIX,tenpay.com,国内服务',
    'DOMAIN-SUFFIX,tencent.com,国内服务',
    'DOMAIN-SUFFIX,tencent-cloud.com,国内服务',
    'DOMAIN-SUFFIX,myqcloud.com,国内服务',
    'DOMAIN-SUFFIX,video.qq.com,国内服务',
    'DOMAIN-SUFFIX,v.qq.com,国内服务',
    'DOMAIN-SUFFIX,iqiyi.com,国内服务',
    'DOMAIN-SUFFIX,iq.com,国内服务',
    'DOMAIN-SUFFIX,qiyi.com,国内服务',
    'DOMAIN-SUFFIX,youku.com,国内服务',
    'DOMAIN-SUFFIX,youkuapp.com,国内服务',
    'DOMAIN-SUFFIX,ykimg.com,国内服务',
    'DOMAIN-SUFFIX,mgtv.com,国内服务',
    'DOMAIN-SUFFIX,hunantv.com,国内服务',
    'DOMAIN-SUFFIX,meituan.com,国内服务',
    'DOMAIN-SUFFIX,dianping.com,国内服务',
    'DOMAIN-SUFFIX,ele.me,国内服务',
    'DOMAIN-SUFFIX,taobao.com,国内服务',
    'DOMAIN-SUFFIX,tmall.com,国内服务',
    'DOMAIN-SUFFIX,tmall.hk,国内服务',
    'DOMAIN-SUFFIX,1688.com,国内服务',
    'DOMAIN-SUFFIX,jd.com,国内服务',
    'DOMAIN-SUFFIX,jd.hk,国内服务',
    'DOMAIN-SUFFIX,jingdong.com,国内服务',
    'DOMAIN-SUFFIX,pinduoduo.com,国内服务',
    'DOMAIN-SUFFIX,yangkeduo.com,国内服务',
    'DOMAIN-SUFFIX,alipay.com,国内服务',
    'DOMAIN-SUFFIX,alipayobjects.com,国内服务',
    'DOMAIN-SUFFIX,alicdn.com,国内服务',
    'DOMAIN-SUFFIX,aliyun.com,国内服务',
    'DOMAIN-SUFFIX,aliyuncs.com,国内服务',
    'DOMAIN-SUFFIX,baidu.com,国内服务',
    'DOMAIN-SUFFIX,bdimg.com,国内服务',
    'DOMAIN-SUFFIX,bdstatic.com,国内服务',
    'DOMAIN-SUFFIX,baidubce.com,国内服务',
    'DOMAIN-SUFFIX,163.com,国内服务',
    'DOMAIN-SUFFIX,126.com,国内服务',
    'DOMAIN-SUFFIX,126.net,国内服务',
    'DOMAIN-SUFFIX,163yun.com,国内服务',
    'DOMAIN-SUFFIX,music.163.com,国内服务',
    'DOMAIN-SUFFIX,sina.com.cn,国内服务',
    'DOMAIN-SUFFIX,weibo.cn,国内服务',
    'DOMAIN-SUFFIX,xiaohongshu.com,国内服务',
    'DOMAIN-SUFFIX,xhscdn.com,国内服务',
    'DOMAIN-SUFFIX,xhscdn.net,国内服务',
    'DOMAIN-SUFFIX,xhslink.com,国内服务',
    'DOMAIN-SUFFIX,xhschannel.com,国内服务',
    'DOMAIN-SUFFIX,edith.xiaohongshu.com,国内服务',
    'DOMAIN-KEYWORD,xiaohongshu,国内服务',
    'DOMAIN-KEYWORD,xhs,国内服务',
    'DOMAIN-SUFFIX,zhihu.com,国内服务',

    'DOMAIN-SUFFIX,zhimg.com,国内服务',
    'DOMAIN-SUFFIX,amap.com,国内服务',
    'DOMAIN-SUFFIX,autonavi.com,国内服务',
    'DOMAIN-SUFFIX,map.qq.com,国内服务',
    'DOMAIN-SUFFIX,didiglobal.com,国内服务',
    'DOMAIN-SUFFIX,didichuxing.com,国内服务',
    'DOMAIN-SUFFIX,ctrip.com,国内服务',
    'DOMAIN-SUFFIX,trip.com,国内服务',
    'DOMAIN-SUFFIX,qunar.com,国内服务',
    'DOMAIN-SUFFIX,12306.cn,国内服务',
    'DOMAIN-SUFFIX,kuaishou.com,国内服务',
    'DOMAIN-SUFFIX,kwai.com,国内服务',
    'DOMAIN-SUFFIX,ksapisrv.com,国内服务',
    'DOMAIN-SUFFIX,kspkg.com,国内服务',
    'DOMAIN-SUFFIX,yximgs.com,国内服务',
    'DOMAIN-SUFFIX,gifshow.com,国内服务',
    'DOMAIN-KEYWORD,kuaishou,国内服务',
    'DOMAIN-KEYWORD,gifshow,国内服务',
    'DOMAIN-KEYWORD,kwai,国内服务',

    'DOMAIN-SUFFIX,gov.cn,国内服务',
    'DOMAIN-SUFFIX,edu.cn,国内服务',
    'DOMAIN-SUFFIX,gov.com,国内服务',
    'DOMAIN-SUFFIX,人民网.cn,国内服务',
    'DOMAIN-SUFFIX,people.com.cn,国内服务',
    'DOMAIN-SUFFIX,xinhuanet.com,国内服务',
    'DOMAIN-SUFFIX,cctv.com,国内服务',
    'DOMAIN-SUFFIX,cntv.cn,国内服务',
    'DOMAIN-SUFFIX,china.com,国内服务',
    'DOMAIN-SUFFIX,chinadaily.com.cn,国内服务',
    'DOMAIN-SUFFIX,moe.gov.cn,国内服务',
    'DOMAIN-SUFFIX,chaoxing.com,国内服务',
    'DOMAIN-SUFFIX,icourse163.org,国内服务',
    'DOMAIN-SUFFIX,cnki.net,国内服务',
    'DOMAIN-SUFFIX,bjtu.edu.cn,国内服务',
    'DOMAIN-SUFFIX,tsinghua.edu.cn,国内服务',
    'DOMAIN-SUFFIX,pku.edu.cn,国内服务',
    'DOMAIN-SUFFIX,csdn.net,国内服务',
    'DOMAIN-SUFFIX,oschina.net,国内服务',
    'DOMAIN-SUFFIX,gitee.com,国内服务',
    'DOMAIN-SUFFIX,csdnimg.cn,国内服务',
    'DOMAIN-SUFFIX,juejin.cn,国内服务',
    'DOMAIN-SUFFIX,leetcode.cn,国内服务',
    'DOMAIN-SUFFIX,nowcoder.com,国内服务',
    'DOMAIN-SUFFIX,osuol.com,国内服务',


    // Microsoft

    'DOMAIN-SUFFIX,microsoft.com,Microsoft',
    'DOMAIN-SUFFIX,microsoftonline.com,Microsoft',
    'DOMAIN-SUFFIX,live.com,Microsoft',
    'DOMAIN-SUFFIX,office.com,Microsoft',
    'DOMAIN-SUFFIX,outlook.com,Microsoft',
    'DOMAIN-KEYWORD,microsoft,Microsoft',

    // 局域网
    'DOMAIN-SUFFIX,local,全球直连',
    'IP-CIDR,10.0.0.0/8,全球直连,no-resolve',
    'IP-CIDR,127.0.0.0/8,全球直连,no-resolve',
    'IP-CIDR,172.16.0.0/12,全球直连,no-resolve',
    'IP-CIDR,192.168.0.0/16,全球直连,no-resolve',
    'IP-CIDR,224.0.0.0/4,全球直连,no-resolve',

    // 中国直连
    'GEOIP,CN,国内服务',

    // 漏网之鱼
    'MATCH,漏网之鱼'
  ];

  // 更新配置
  config['proxy-groups'] = newProxyGroups.map(preserveGroup);
  config.rules = rules;

  return config;
}
