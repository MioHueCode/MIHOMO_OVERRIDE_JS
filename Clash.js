/**
 * Clash / Mihomo 工程化整理脚本
 *
 * 设计目标：
 * 1. 在尽量不改变原有行为的前提下，提升配置脚本的可维护性与可读性。
 * 2. 统一 DNS、嗅探、节点识别、地区分组、业务分流与规则装配逻辑。
 * 3. 为后续继续扩展规则、分组和节点分类提供清晰的结构边界。
 *
 * 主要结构：
 * - 基础运行参数与通用工具
 * - Sniffer / Hosts / DNS 配置
 * - 节点清洗、特征识别与地区归类
 * - 自动选择、故障转移、负载均衡与业务分组构造
 * - 规则数组拆分、组合与最终落盘
 *
 * 维护约定：
 * - 优先做保守重构，不随意改变规则优先级与组装顺序。
 * - 规则新增尽量放入对应 RULES_* 分区，避免散落追加。
 * - 若修改节点识别逻辑，请同步检查地区组、故障转移组和业务候选池。
 */
function buildConfig(config) {

  if (!config || !Array.isArray(config.proxies)) return config;

  // 运行上下文：保留旧分组选项顺序，便于脚本重载后延续用户选择。
  const existingGroups = Array.isArray(config['proxy-groups']) ? config['proxy-groups'] : [];
  const existingGroupMap = Object.create(null);
  for (let i = 0; i < existingGroups.length; i++) {
    const group = existingGroups[i];
    if (group && group.name) existingGroupMap[group.name] = group;
  }

  const PERF_ENABLED = false;
  const perfMarks = Object.create(null);
  const perfNow = () => Date.now();
  function perfStart(label) {
    if (!PERF_ENABLED) return;
    perfMarks[label] = perfNow();
  }
  function perfEnd(label) {
    if (!PERF_ENABLED || !perfMarks[label]) return;
    perfMarks[label] = perfNow() - perfMarks[label];
  }
  function perfFlush() {
    if (!PERF_ENABLED) return;
    console.log('[Clash.js][perf]', JSON.stringify(perfMarks));
  }

  // 图标资源：统一走 Qure 图标仓库，避免各处手写 URL 前缀。
  const QURE_BASE = 'https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/';
  const qIcon = name => QURE_BASE + name + '.png';

  // 通用工具：将外部输入统一收敛为数组。
  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function uniqList(arr) {
    return Array.from(new Set(asArray(arr).filter(Boolean)));
  }

  // 基础运行参数：优先保证配置持久化、协议栈兼容性与默认行为稳定。
  config.profile = {
    ...(config.profile || {}),
    'store-selected': true,
    'store-fake-ip': true
  };

  config['mixed-port'] = config['mixed-port'] || 7890;
  config['allow-lan'] = false;
  config['tcp-concurrent'] = true;
  config['keep-alive-interval'] = 15;
  config['keep-alive-idle'] = 600;
  config['disable-keep-alive'] = false;
  config['etag-support'] = true;

  config['mode'] = 'rule';

  config['log-level'] = config['log-level'] || 'error';
  config.ipv6 = true;

  config['unified-delay'] = true;
  config['find-process-mode'] = 'strict';
  config['global-client-fingerprint'] = config['global-client-fingerprint'] || 'chrome';
  // 实验特性：统一关闭 GSO/ECN，保持与常见客户端兼容。
  config['experimental'] = Object.assign({}, config['experimental'] || {}, {
    'quic-go-disable-gso': true,
    'quic-go-disable-ecn': true,
    'dialer-ip4p-convert': false,
  });

  // 嗅探模块：为 HTTPS / QUIC / 纯 IP 连接补足域名感知，便于后续规则命中。
  if (!config.sniffer || typeof config.sniffer !== 'object') config.sniffer = {};
  config.sniffer['force-dns-mapping'] = true;

  config.sniffer['parse-pure-ip'] = true;
  config.sniffer['override-destination'] = true;
  config.sniffer['sniff'] = {
    'HTTP': { 'ports': [80, '8080-8880'], 'override-destination': true },
    'TLS': { 'ports': [443, 8443] },
    'QUIC': { 'ports': [443, 8443], 'override-destination': true }
  };
  config.sniffer['force-domain'] = [
    // AI 服务：强制嗅探登录、静态资源与实时通信链路，避免进程 / SNI 信息不足导致分流失败。
    '+.chatgpt.com', '+.openai.com', '+.auth0.openai.com', '+.oaistatic.com',
    '+.oaiusercontent.com', '+.files.oaiusercontent.com', '+.cdn.openai.com',
    '+.livekit.cloud', '+.statsigapi.net',

    // TikTok / 字节海外链路：视频、图片与 CDN 域名较多，强制嗅探可提升命中率。
    '+.tiktok.com', '+.tiktokv.com', '+.tiktokcdn.com', '+.tiktokcdn-us.com', '+.tiktokcdn-eu.com',
    '+.musical.ly', '+.ibyteimg.com', '+.ibytedtos.com', '+.byteoversea.com', '+.bytefcdn-oversea.com',

    // YouTube / Google 视频链路：主站、接口、视频资源与缩略图统一强化嗅探。
    '+.youtube.com', '+.youtubei.googleapis.com', '+.youtube.googleapis.com', '+.googlevideo.com',
    '+.ytimg.com', '+.ggpht.com',
    'jnn-pa.googleapis.com', 'youtubeembeddedplayer.googleapis.com', 'video.google.com'
  ];
  config.sniffer['skip-domain'] = uniqList([
    ...asArray(config.sniffer['skip-domain']),

    // DoH 域名：解析器自身不参与嗅探，避免请求链路互相干扰。
    'dns.adguard-dns.com',
    'dns.google',
    'cloudflare-dns.com',
    'doh.pub',
    'dns.alidns.com',

    // 时间同步：校时请求应尽量保持简单直接，避免额外嗅探干预。
    'time.windows.com',
    'time.apple.com',
    'time.android.com'
  ]);

  // Hosts 兜底：为关键 DoH 与常见重定向域名提供静态兜底映射。
  if (!config.hosts || typeof config.hosts !== 'object') config.hosts = {};
  config.hosts['dns.alidns.com'] = ['223.5.5.5', '223.6.6.6'];

  config.hosts['doh.pub'] = ['120.53.53.53', '1.12.12.12'];
  config.hosts['doh.360.cn'] = ['101.198.198.198'];
  config.hosts['dns.google'] = ['8.8.8.8', '8.8.4.4'];
  config.hosts['cloudflare-dns.com'] = ['1.1.1.1', '1.0.0.1'];
  config.hosts['services.googleapis.cn'] = 'services.googleapis.com';
  config.hosts['google.cn'] = 'google.com';
  config.hosts['cn.bing.com'] = 'global.bing.com';
  // Telegram t.me 兼容映射：优先采用域名别名方式，避免直接写死 IP。
  config.hosts['t.me'] = 'telegram.me';

  // DNS 基础资源：分离本地解析、国内 DoH、可信境外 DoH 与广告过滤 DNS。
  const DNS_ENDPOINTS = {
    local: ['223.6.6.6', '119.29.29.29'],
    cn: ['https://dns.alidns.com/dns-query', 'https://doh.pub/dns-query'],
    trust: ['https://1.1.1.1/dns-query', 'https://dns.google/dns-query'],
    adguard: ['https://dns.adguard-dns.com/dns-query']
  };
  const localDns = DNS_ENDPOINTS.local;
  const cnDns = DNS_ENDPOINTS.cn;
  const trustDns = DNS_ENDPOINTS.trust;
  const adguardDns = DNS_ENDPOINTS.adguard;

  // 测速常量：统一控制自动选择、故障转移和地区测速组的探测参数。
  const TEST_URL = 'https://www.gstatic.com/generate_204';
  const TEST_INTERVAL = 360;
  const TEST_TOLERANCE = 80;
  const TEST_TIMEOUT = 2000;
  const TEST_MAX_FAILED_TIMES = 3;
  const FALLBACK_INTERVAL = 300;
  const FALLBACK_TOLERANCE = 80;
  const FALLBACK_TIMEOUT = 2500;
  const FALLBACK_MAX_FAILED_TIMES = 2;
  const REGION_TEST_INTERVAL = 480;
  const REGION_TEST_TOLERANCE = 160;
  const REGION_TEST_TIMEOUT = 3000;
  const REGION_TEST_MAX_FAILED_TIMES = 4;
  const HEALTH_CHECK_LAZY = true;
  const directChoices = [
    '🇨🇳 直连 | IPv4优先',
    '🇨🇳 直连 | IPv6优先',
    '🇨🇳 直连 | 双栈',
    '全球直连',
  ];

  const DNS_POLICY_DOMAIN_SETS = {
    adguard: [
      '+.pglstatp-toutiao.com', '+.pangolin-sdk-toutiao.com', '+.pangolin.snssdk.com', '+.sgsnssdk.com', '+.unionadjs.com',
      '+.adkwai.com', '+.e.kuaishou.com', '+.adukwai.com', '+.tanx.com', '+.alimama.com', '+.mmstat.com', '+.gdt.qq.com',
      '+.e.qq.com', '+.guanggao.qq.com', '+.adnet.qq.com', '+.iadmatvideo.nosdn.127.net', '+.iadmusicmatvideo.nosdn.127.net',
      '+.mi.gdt.qq.com', '+.bdxiguaimg.com', '+.adsame.com', '+.bdplus.baidu.com', '+.pos.baidu.com', '+.union.baidu.com',
      '+.cb.baidu.com', '+.dup.baidustatic.com', '+.cpro.baidu.com', '+.afd.baidu.com', '+.als.baidu.com', '+.nsclick.baidu.com',
      '+.mobads.baidu.com', '+.eclick.baidu.com', '+.wanfeng1.baidu.com', '+.wm.baidu.com', '+.duclick.baidu.com', '+.adimg.uve.weibo.com',
      '+.alitui.weibo.com', '+.biz.weibo.com', '+.game.weibo.cn', '+.sax.sina.com.cn', '+.adbox.sina.com.cn', '+.adview.cn',
      '+.miaozhen.com', '+.irs01.com', '+.admaster.com.cn', '+.adpush.cn', '+.cnxad.com', '+.adkmob.com', '+.adobe-identity.omtrdc.net',
      '+.omtrdc.net', '+.2mdn.net', '+.googlesyndication.com', '+.googleadservices.com', '+.googleadsserving.cn', '+.googletagservices.com',
      '+.doubleclick.net', '+.google-analytics.com', '+.analytics.google.com', '+.ads.google.com'
    ],
    tiktok: [
      '+.tiktok.com', '+.tiktokv.com', '+.tiktokcdn.com', '+.tiktokcdn-us.com', '+.tiktokcdn-eu.com',
      '+.musical.ly', '+.ibyteimg.com', '+.ibytedtos.com', '+.byteoversea.com', '+.bytefcdn-oversea.com'
    ],
    adguardService: ['+.adtidy.org', '+.adguard.com', '+.adguard.org', '+.adguard-dns.io'],
    browserRisk: [
      '+.addons.mozilla.org', '+.addons.cdn.mozilla.net', 'api.ipify.org', 'fpjs.checkout.com', 'fpjscache.checkout.com',
      'risk.checkout.com', '+.online-metrix.net', 'volatile-pa.googleapis.com', 'settings-win.data.microsoft.com'
    ],
    openaiRealtime: [
      '+.auth0.openai.com', '+.oaistatic.com', '+.oaiusercontent.com', '+.files.oaiusercontent.com', '+.cdn.openai.com',
      '+.livekit.cloud', '+.statsigapi.net'
    ],
    google: [
      '+.google.com', '+.googleapis.com', '+.googleapis.cn', '+.services.googleapis.cn', '+.gstatic.com', '+.googleusercontent.com',
      '+.gvt1.com', '+.gvt2.com', '+.gvt3.com', '+.recaptcha.net', '+.recaptcha-cn.net'
    ],
    aiFinanceRisk: [
      '+.chatgpt.com', '+.openai.com', '+.metamask.io', '+.neverless.com', '+.noones.com', 'noonessupport.zendesk.com',
      '+.okx.com', '+.okx.ac', '+.okx.cab', '+.xlayer.tech', '+.ifastgb.com', '+.fundsupermart.com', 'stest.zimperium.com',
      '+.giffgaff.com', 'cdn-eu.dynamicyield.com', 'privacyportal-uk.onetrust.com', 'mobile-data.onetrust.io', '+.anthropic.com',
      '+.claude.ai', '+.perplexity.ai', '+.poe.com', '+.cohere.com', '+.huggingface.co', '+.replicate.com', '+.cursor.sh'
    ],
    mainstreamOverseas: [
      '+.netflix.com', '+.nflxvideo.net', '+.disneyplus.com', '+.primevideo.com', '+.spotify.com', '+.discord.com',
      '+.discordapp.com', '+.reddit.com', '+.telegram.org', '+.t.me', '+.github.com', '+.githubusercontent.com', '+.steamcommunity.com',
      '+.steampowered.com', '+.epicgames.com', '+.roblox.com'
    ],
    youtubeMedia: [
      'jnn-pa.googleapis.com', 'youtubeembeddedplayer.googleapis.com', 'video.google.com', '+.googlevideo.com', '+.ytimg.com', '+.ggpht.com'
    ]
  };
  const DNS_FALLBACK_FILTER_DOMAIN_SETS = {
    baseOverseas: ['+.google.com', '+.youtube.com', '+.twitter.com', '+.x.com', '+.telegram.org', '+.t.me'],
    meta: ['+.facebook.com', '+.fbcdn.net', '+.instagram.com', '+.whatsapp.com', '+.whatsapp.net'],
    ai: ['+.openai.com', '+.chatgpt.com', '+.claude.ai', '+.anthropic.com', '+.perplexity.ai', '+.poe.com', '+.midjourney.com', '+.character.ai', '+.c.ai', '+.groq.com', '+.mistral.ai', '+.x.ai'],
    devCommunity: ['+.github.com', '+.githubusercontent.com', '+.discord.com', '+.reddit.com', '+.reddit.map.fastly.net'],
    tiktok: ['+.tiktok.com', '+.tiktokv.com', '+.byteoversea.com', '+.ibytedtos.com', '+.tiktokcdn.com', '+.tiktokcdn-us.com', '+.tiktokcdn-eu.com', '+.tiktokrow-cdn.com', '+.tiktokv.us', '+.ibyteimg.com', '+.muscdn.com'],
    productivity: ['+.cloudflare.com', '+.notion.so', '+.dropbox.com'],
    crypto: ['+.binance.com', '+.coinbase.com', '+.okx.com', '+.bybit.com', '+.kucoin.com', '+.metamask.io', '+.trustwallet.com', '+.walletconnect.com', '+.oklink.com', '+.okx-dns.com', '+.okx-dns1.com', '+.okx-dns2.com', '+.byapis.com', '+.bycsi.com', '+.bybit-global.com', '+.bybitglobal.com', '+.bnbstatic.com', '+.binanceapi.com'],
    finance: ['+.paypal.com', '+.stripe.com', '+.wise.com', '+.revolut.com', '+.card.io', '+.paypalhere.com', '+.venmo.com', '+.xoom.com', '+.stripe.network', '+.stripe-terminal-local-reader.net', '+.link.com'],
    streaming: ['+.netflix.com', '+.disneyplus.com', '+.hulu.com', '+.hbomax.com', '+.primevideo.com', '+.spotify.com', '+.twitch.tv', '+.twtrdns.net'],
    gaming: ['+.steamcommunity.com', '+.steampowered.com', '+.epicgames.com', '+.roblox.com', '+.battle.net', '+.blizzard.com', '+.blizzardentertainment.com', '+.battlenet.com.cn', '+.ea.com', '+.origin.com', '+.uplay.com', '+.nintendo.com', '+.playstation.com', '+.xbox.com', '+.xboxlive.com', '+.supercell.com', '+.supercell.net'],
    bigTech: ['+.apple.com', '+.icloud.com', '+.microsoft.com', '+.live.com', '+.amazon.com', '+.aws.amazon.com'],
    infra: ['+.dns.google', '+.dns.google.com', '+.api2.branch.io', '+.cdn.branch.io'],
    youtubeMedia: ['+.youtubei.googleapis.com', '+.youtube.googleapis.com', 'jnn-pa.googleapis.com', 'youtubeembeddedplayer.googleapis.com', 'video.google.com', '+.googlevideo.com', '+.ytimg.com', '+.ggpht.com']
  };

  const DNS_FAKE_IP_FILTER_SETS = {
    lan: [
      '*.lan', '*.local', '*.localdomain', '*.home.arpa', '*.internal'
    ],
    connectivityCheck: [
      'localhost.ptlogin2.qq.com', 'msftconnecttest.com', 'msftncsi.com',
      'connectivitycheck.android.com', 'connectivitycheck.gstatic.com', 'connect.rom.miui.com',
      'captive.apple.com', 'www.msftconnecttest.com', 'www.msftncsi.com'
    ],
    timeSync: [
      'time.windows.com', 'time.apple.com', 'time.android.com', 'pool.ntp.org', 'ntp.*.com', 'ntp.*.cn'
    ],
    routerGateway: [
      'router.asus.com', 'routerlogin.net', 'www.routerlogin.com', 'tplogin.cn', 'tplinkwifi.net',
      'miwifi.com', 'router.miwifi.com', 'my.router', 'fritz.box', 'dlinkrouter.local', 'orbilogin.com'
    ],
    realtimeRelay: [
      'stun.*', 'stun.*.*', 'stun.*.*.*', 'turn.*', 'turn.*.*', 'relay.*'
    ],
    consoleAuth: [
      'cable.auth.com', '*.srv.nintendo.net', '*.stun.playstation.net',
      'xbox.*.microsoft.com', '*.xboxlive.com', '*.xbox.com', '*.xboxservices.com',
      '*.playstation.net', '*.playstation.com', 'psnprofiles.com',
      '*.nintendo.com', '*.nintendo.net', '*.nintendo.co.jp'
    ],
    gamingPlatforms: [
      '*.battle.net', '*.battlenet.com.cn', '*.wotgame.cn', '*.wggames.cn', '*.wowsgame.cn', '*.wargaming.net',
      '*.blizzard.com', '*.blizzardentertainment.com', '*.roblox.com', '*.rbxcdn.com', '*.minecraft.net', '*.mojang.com',
      '*.mojangstudios.com', '*.epicgames.com', '*.unrealengine.com', '*.epicgames-download1.akamaized.net', '*.riotgames.com',
      '*.leagueoflegends.com', '*.playvalorant.com', '*.riotcdn.net', '*.lol.secure.dyn.riotcdn.net', '*.ea.com', '*.origin.com',
      '*.origin-a.akamaihd.net', '*.ubisoft.com', '*.uplay.com', '*.cdn.ubisoft.com', '*.rockstargames.com', '*.gog.com',
      '*.steamcommunity.com', '*.steampowered.com', '*.steamstatic.com', '*.steamcdn-a.akamaihd.net', '*.steamcontent.com',
      '*.supercell.com', '*.supercell.net', '*.piston-meta.mojang.com', '*.launcher.mojang.com'
    ],
    cloudflareChallenge: [
      'challenges.cloudflare.com', 'turnstile.cloudflare.com', 'assets.cloudflare.com', '*.cloudflare.com'
    ]
  };

  // DNS 主配置：负责 fake-ip、nameserver、hosts 与策略分流的统一落盘。
  config.dns = Object.assign({}, config.dns || {}, {
    enable: true,
    listen: '0.0.0.0:1053',

    ipv6: true,
    'ipv6-timeout': 300,
    'cache-algorithm': 'arc',
    'prefer-h3': true,
    'use-system-hosts': false,
    'respect-rules': false,
    'use-hosts': true,
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.0/15',
    'fake-ip-ttl': 60,
    'fake-ip-filter': uniqList([
      ...asArray(config.dns && config.dns['fake-ip-filter']),

      // 局域网 / 本地域名：这类地址通常用于内网发现与本地服务，不适合 fake-ip。
      ...DNS_FAKE_IP_FILTER_SETS.lan,

      // 连通性检测：系统用来判断网络状态，使用 fake-ip 容易触发误判。
      ...DNS_FAKE_IP_FILTER_SETS.connectivityCheck,

      // 时间同步：NTP / 校时域名应返回真实地址，避免时钟同步异常。
      ...DNS_FAKE_IP_FILTER_SETS.timeSync,

      // 路由器 / 网关管理地址：管理页和本地路由器域名不应走 fake-ip。
      ...DNS_FAKE_IP_FILTER_SETS.routerGateway,

      // STUN / TURN / Relay：实时通信协商依赖真实地址，fake-ip 容易破坏打洞与中继。
      ...DNS_FAKE_IP_FILTER_SETS.realtimeRelay,

      // 主机平台 / 家用设备联机认证：保持真实解析，减少 NAT / 联机检测异常。
      ...DNS_FAKE_IP_FILTER_SETS.consoleAuth,

      // 海外 PC / 主机游戏平台：下载器、认证、联机与反作弊链路尽量保留真实 IP。
      ...DNS_FAKE_IP_FILTER_SETS.gamingPlatforms,

      // Cloudflare 挑战 / 验证资源：验证码与挑战链路对真实地址更敏感。
      ...DNS_FAKE_IP_FILTER_SETS.cloudflareChallenge
    ]),

    nameserver: uniqList([
      ...asArray(config.dns && config.dns.nameserver),
      ...cnDns,
      ...localDns
    ]),
    'default-nameserver': uniqList([
      ...asArray(config.dns && config.dns['default-nameserver']),
      ...localDns
    ]),
    'proxy-server-nameserver': uniqList([
      ...asArray(config.dns && config.dns['proxy-server-nameserver']),
      ...cnDns,
      ...localDns
    ])
  });
  // DNS 分流策略：按私有网络 / 国内 / 境外 / 广告 / 特殊业务域名分别指定解析器。
  // nameserver-policy 维护提示：键必须保持 Mihomo 可识别的 geosite / 域名模式，值必须是一维 DNS 列表。
  // 若把值误改成对象或二维数组，常见后果是导入失败或策略静默失效。
  config.dns['nameserver-policy'] = Object.assign(config.dns['nameserver-policy'] || {}, {
    // 私有网络与国内站点：优先走本地 DNS / 国内 DoH，减少绕路与污染概率。
    'geosite:private': localDns,
    'geosite:cn': cnDns,

    // 境外通用站点：统一交给可信境外 DoH，保证海外服务解析一致性。
    'geosite:geolocation-!cn': trustDns,

    // 广告与追踪域名：交给 AdGuard DNS，尽量在解析层先做拦截。
    'geosite:category-ads-all': adguardDns,
    ...Object.fromEntries(DNS_POLICY_DOMAIN_SETS.adguard.map(domain => [domain, adguardDns])),

    // TikTok / 字节海外链路：单独指定可信境外 DNS，避免区域解析偏移。
    ...Object.fromEntries(DNS_POLICY_DOMAIN_SETS.tiktok.map(domain => [domain, trustDns])),

    // 广告过滤服务自身：避免过滤器域名走到被过滤 DNS 造成自指问题。
    ...Object.fromEntries(DNS_POLICY_DOMAIN_SETS.adguardService.map(domain => [domain, trustDns])),

    // 浏览器扩展 / 指纹 / 风控基础设施：优先境外可信解析，减少误判与校验失败。
    ...Object.fromEntries(DNS_POLICY_DOMAIN_SETS.browserRisk.map(domain => [domain, trustDns])),

    // OpenAI / AI 实时服务：保证登录、静态资源与实时链路解析稳定。
    ...Object.fromEntries(DNS_POLICY_DOMAIN_SETS.openaiRealtime.map(domain => [domain, trustDns])),

    // 国内 DoH 服务自身：强制回落本地 DNS，避免解析自循环。
    'dns.alidns.com': localDns,

    // Google 主生态：搜索、接口、静态资源与验证码统一走境外可信 DNS。
    ...Object.fromEntries(DNS_POLICY_DOMAIN_SETS.google.map(domain => [domain, trustDns])),

    // 通用海外 AI / 钱包 / 风控站点：避免被国内解析劫持或区域收敛。
    ...Object.fromEntries(DNS_POLICY_DOMAIN_SETS.aiFinanceRisk.map(domain => [domain, trustDns])),

    // 主流海外内容 / 社交 / 开发 / 游戏站点：统一使用可信境外 DNS 维持地域一致性。
    ...Object.fromEntries(DNS_POLICY_DOMAIN_SETS.mainstreamOverseas.map(domain => [domain, trustDns])),

    // YouTube 视频资源链路：单独点名，避免视频域名被错误落到国内 DNS。
    ...Object.fromEntries(DNS_POLICY_DOMAIN_SETS.youtubeMedia.map(domain => [domain, trustDns])),
  });
  // fallback 过滤器：决定哪些域名 / IP 结果需要优先参考 fallback DNS。
  config.dns['fallback-filter'] = {
    // GEOIP 过滤：国内 IP 结果优先视为可信，减少无意义 fallback。
    geoip: true,
    'geoip-code': 'CN',

    // 特殊保留地址段：这类结果通常不应作为正常公网解析结果使用。
    ipcidr: ['240.0.0.0/4'],

    // 域名白名单：这些域名即使初始解析有结果，也允许 fallback DNS 参与校验。
    domain: [
      // Google / YouTube / Twitter / Telegram 等基础海外平台。
      ...DNS_FALLBACK_FILTER_DOMAIN_SETS.baseOverseas,

      // Meta 社交生态。
      ...DNS_FALLBACK_FILTER_DOMAIN_SETS.meta,

      // 海外 AI 服务。
      ...DNS_FALLBACK_FILTER_DOMAIN_SETS.ai,

      // 开发 / 社区服务。
      ...DNS_FALLBACK_FILTER_DOMAIN_SETS.devCommunity,

      // TikTok / 字节海外链路。
      ...DNS_FALLBACK_FILTER_DOMAIN_SETS.tiktok,

      // 云平台与生产力服务。
      ...DNS_FALLBACK_FILTER_DOMAIN_SETS.productivity,

      // 交易所 / 钱包 / 加密资产基础设施。
      ...DNS_FALLBACK_FILTER_DOMAIN_SETS.crypto,

      // 金融支付与风控敏感域名。
      ...DNS_FALLBACK_FILTER_DOMAIN_SETS.finance,

      // 流媒体与内容分发平台。
      ...DNS_FALLBACK_FILTER_DOMAIN_SETS.streaming,

      // 海外游戏平台与发行生态。
      ...DNS_FALLBACK_FILTER_DOMAIN_SETS.gaming,

      // Apple / Microsoft / Amazon 等大厂主域名。
      ...DNS_FALLBACK_FILTER_DOMAIN_SETS.bigTech,

      // 特殊基础设施域名。
      ...DNS_FALLBACK_FILTER_DOMAIN_SETS.infra,

      // YouTube 视频与媒体资源链路。
      ...DNS_FALLBACK_FILTER_DOMAIN_SETS.youtubeMedia
    ]
  };

  config.dns.fallback = trustDns;
  config.dns['direct-nameserver'] = [...cnDns, ...localDns];
  config.dns['direct-nameserver-follow-policy'] = true;
  // 节点清洗：过滤订阅公告、套餐说明、链接文本等非真实代理项。
  const invalidProxyNamePatterns = [
    /(?:剩余流量|流量已用|重置|到期|官网|官方|公告|通知|最新|售后|套餐|订阅|使用说明|请使用|客户端|更新订阅|复制链接|浏览器打开|https?:\/\/|工单|教程|返利|邀请|购买|续费|维护)/i
  ];

  function isLikelyMetaNoticeName(name) {
    const text = String(name || '').trim();
    if (!text) return true;
    if (/^(?:https?:\/\/|www\.)/i.test(text)) return true;
    if (/^(?:公告|通知|官网|官方|使用说明|更新订阅|复制链接|浏览器打开)/i.test(text)) return true;
    return false;
  }

  function isRealProxyName(name) {
    const text = String(name || '').trim();
    if (!text) return false;
    if (/^(urltest|select|fallback|load-balance)\b/i.test(text)) return false;
    if (/\b\d+\/\d+\b/.test(text)) return false;
    // 很多机场真实节点名会带 TG / 频道 / @用户名，这些不能再作为硬过滤条件。
    // 这里只过滤明显的说明文本 / 链接 / 公告，而不是带广告前缀的真实节点。
    if (isLikelyMetaNoticeName(text)) return false;
    return !invalidProxyNamePatterns.some(re => re.test(text));
  }


  perfStart('proxy_filter');
  const proxies = config.proxies.filter(p => p && p.name && isRealProxyName(p.name));
  perfEnd('proxy_filter');

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
  // 节点特征识别：家宽 / 倍率 / 流媒体节点将用于后续分组聚合。
  // 家宽识别：用于构建住宅线路候选池，优先把 ISP / Residential 类节点单独筛出。
  const residentialNamePatterns = [
    /家宽|家庭宽带|家庭住宅|住宅宽带|住宅|宽带/,
    /\bresi(?:dential)?\b/i,

    /\bhome(?:\s|-|_)?ip\b/i,
    /\bhome(?:\s|-|_)?broadband\b/i,
    /\bbroadband\b/i,
    /\bisp\b/i
  ];
  function isResidentialProxyName(name) {
    return residentialNamePatterns.some(re => re.test(String(name || '')));
  }

  // 倍率识别：订阅里常用“2x / 1.5倍 / turbo”标注计费倍率，后续可用于排序与分池。
  const multiplierNamePatterns = [
    /倍率/,
    /流量倍率|速率倍率|加速倍率/,
    /\bbandwidth\b/i,
    /\bboost\b/i,
    /\bturbo\b/i,
    /\b\d+(?:\.\d+)?\s*x\b/i,
    /\bx\s*\d+(?:\.\d+)?\b/i,
    /\d+(?:\.\d+)?\s*倍/
  ];

  // 倍率排序提取：尽量从节点名里抽出明确倍率数值，供后续稳定排序。
  function getMultiplierSortInfo(name) {

    const text = String(name || '');
    const normalized = text
      .toLowerCase()
      .replace(/[（【［]/g, '(')
      .replace(/[）】］]/g, ')')
      .replace(/[，、｜|_]/g, ' ')
      .replace(/倍率/g, ' x ')
      .replace(/倍/g, ' x ')
      .replace(/\s+/g, ' ')
      .trim();

    const candidates = [];
    const numberRegex = /\d+(?:\.\d+)?/g;
    let match;
    while ((match = numberRegex.exec(normalized)) !== null) {
      const value = Number(match[0]);
      if (!Number.isFinite(value)) continue;

      const start = match.index;
      const end = start + match[0].length;
      const before = normalized.slice(Math.max(0, start - 6), start);
      const after = normalized.slice(end, Math.min(normalized.length, end + 6));
      const nearMultiplierMark = before.includes('x') || after.includes('x');

      if (nearMultiplierMark) {
        candidates.push({ value, index: start });
      }
    }

    if (candidates.length) {
      candidates.sort((a, b) => a.value - b.value || a.index - b.index);
      return { value: candidates[0].value, recognized: true };
    }

    return { value: Number.POSITIVE_INFINITY, recognized: false };
  }
  function isMultiplierProxyName(name) {
    if (multiplierNamePatterns.some(re => re.test(String(name || '')))) return true;
    return getMultiplierSortInfo(name).recognized;
  }

  // 流媒体识别：把标注为解锁 / 流媒体优化的节点单独抽出，便于媒体业务优先选线。
  const streamingNamePatterns = [
    /流媒体|streaming|unlock|奈飞|netflix|disney|hbo|max|prime|youtube|ytb|bilibili|b站|爱奇艺|iqiyi|腾讯视频|abema|bahamut|动画疯|tvb|dazn|hulu|pornhub/i,
    /媒体全解|全流媒体|流媒体专用|流媒体优化|流媒体节点|流媒体线路|原生解锁|全解锁|流媒体解锁/,
    /\bnf\b/i,
    /\bmedia\b/i,
    /\bstream(?:ing)?\b/i,
    /\bunlock\b/i
  ];
  function isStreamingProxyName(name) {
    return streamingNamePatterns.some(re => re.test(String(name || '')));
  }

  perfStart('proxy_classify');
  // 清洗结果：单次遍历完成去重与特征归档，减少多轮 filter 扫描。
  const cleanProxies = [];
  const residentialProxies = [];
  const multiplierProxies = [];
  const streamingProxies = [];
  const allProxyNames = [];
  const residentialProxyNames = [];
  const multiplierProxyNames = [];
  const streamingProxyNames = [];
  const seenProxyNames = new Set();

  for (let i = 0; i < proxies.length; i++) {
    const proxy = proxies[i];
    const proxyName = proxy && proxy.name;
    if (!proxyName || seenProxyNames.has(proxyName)) continue;
    seenProxyNames.add(proxyName);
    cleanProxies.push(proxy);
    allProxyNames.push(proxyName);
    if (isResidentialProxyName(proxyName)) {
      residentialProxies.push(proxy);
      residentialProxyNames.push(proxyName);
    }
    if (isMultiplierProxyName(proxyName)) {
      multiplierProxies.push(proxy);
      multiplierProxyNames.push(proxyName);
    }
    if (isStreamingProxyName(proxyName)) {
      streamingProxies.push(proxy);
      streamingProxyNames.push(proxyName);
    }
  }

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
  const finalProxies = cleanProxies.slice();
  const finalProxyNames = new Set(allProxyNames);
  for (let i = 0; i < builtInDirectProxies.length; i++) {
    const proxy = builtInDirectProxies[i];
    if (!finalProxyNames.has(proxy.name)) {
      finalProxyNames.add(proxy.name);
      finalProxies.push(proxy);
    }
  }
  config.proxies = finalProxies;
  perfEnd('proxy_classify');

  const wholeWordPatternCache = new Map();
  function hasWholeWord(text, word) {
    const key = String(word || '').toLowerCase();
    let pattern = wholeWordPatternCache.get(key);
    if (!pattern) {
      const escaped = key.replace(/[-/\^$*+?.()|[]{}]/g, '\\$&');
      pattern = new RegExp('(^|[^a-z])' + escaped + '([^a-z]|$)', 'i');
      wholeWordPatternCache.set(key, pattern);
    }
    return pattern.test(String(text || ''));
  }
  // 地区识别：按节点名特征将代理归入主要地理区域，供自动组和故障转移组复用。
  // 地区桶：先把节点名映射到大区，再由后续逻辑构建地区测速组、故障转移组和业务候选池。
  const regionGroups = {
    '香港': [],
    '台湾': [],
    '日本': [],
    '新加坡': [],
    '美国': [],
    '韩国': [],
    '俄罗斯': [],
    '欧盟': [],
    '其他地区': [],
  };

  // 关键词映射：覆盖常见中文写法、英文国名、城市名、机场三字码 / 两字码缩写。
  const REGION_KEYWORD_MAP = {
    '香港': [
      '香港', 'hk', 'hong kong', 'hongkong', 'hkg', 'kowloon', 'tsim sha tsui'
    ],
    '台湾': [
      '台湾', '台灣', 'tw', 'taiwan', 'taipei', 'taichung', 'kaohsiung', 'hsinchu', 'tainan'
    ],
    '日本': [
      '日本', 'jp', 'japan', 'tokyo', 'osaka', 'nagoya', 'saitama', 'yokohama', 'fukuoka', 'kawasaki', 'chiba', 'sapporo', 'okinawa'
    ],
    '新加坡': [
      '新加坡', 'sg', 'singapore', 'sgp'
    ],
    '美国': [
      '美国', 'us', 'usa', 'united states', 'america', 'los angeles', 'san jose', 'seattle', 'chicago', 'new york',
      'silicon valley', 'las vegas', 'phoenix', 'dallas', 'miami', 'atlanta', 'denver', 'boston', 'ashburn', 'portland'
    ],
    '韩国': [
      '韩国', '南韩', 'kr', 'korea', 'seoul', 'busan', 'incheon', 'daejeon'
    ],
    '俄罗斯': [
      '俄罗斯', 'ru', 'russia', 'moscow', 'moskva', 'saint petersburg', 'st. petersburg', 'novosibirsk'
    ],
    '欧盟': [
      '英国', 'gb', 'uk', 'britain', 'united kingdom', 'london', 'manchester',
      '德国', 'de', 'germany', 'frankfurt', 'berlin', 'munich',
      '法国', 'fr', 'france', 'paris', 'marseille',
      '荷兰', 'nl', 'netherlands', 'amsterdam', 'rotterdam',
      '土耳其', 'tr', 'turkey', 'istanbul',
      '意大利', 'italy', 'milan', 'rome',
      '西班牙', 'es', 'spain', 'madrid', 'barcelona',
      '瑞典', 'sweden', 'stockholm',
      '波兰', 'pl', 'poland', 'warsaw',
      '瑞士', 'ch', 'switzerland', 'zurich',
      '奥地利', 'austria', 'vienna',
      '比利时', 'belgium', 'brussels',
      '丹麦', 'dk', 'denmark', 'copenhagen',
      '芬兰', 'fi', 'finland', 'helsinki',
      '挪威', 'norway', 'oslo',
      '欧盟', '欧洲', 'europe', 'european union'
    ],
    '其他地区': [
      '印度', 'india', 'in',
      '马来西亚', 'malaysia', 'my',
      '越南', 'vietnam', 'vn',
      '加拿大', 'canada', 'ca',
      '澳大利亚', '澳洲', 'australia', 'au', '悉尼', 'sydney', '墨尔本', 'melbourne',
      '新西兰', 'new zealand', 'nz', '奥克兰', 'auckland',
      '阿联酋', 'uae', 'dubai', '迪拜',
      '泰国', 'thailand', 'th', '曼谷', 'bangkok',
      '菲律宾', 'philippines', 'ph', '马尼拉', 'manila',
      '印度尼西亚', '印尼', 'indonesia', 'id', '雅加达', 'jakarta'
    ],
  };
  // 匹配优先级：当前面多个地区关键词可能冲突时，按这个顺序先命中更常见主区域。
  const REGION_PRIORITY = ['香港', '台湾', '日本', '新加坡', '美国', '韩国', '俄罗斯', '欧盟', '其他地区'];

  // 旗帜优先：节点名带国旗时，直接作为最高置信度地区信号。
  const REGION_FLAG_MAP = [
    ['香港', /🇭🇰/],
    ['台湾', /🇹🇼/],
    ['日本', /🇯🇵/],
    ['新加坡', /🇸🇬/],
    ['美国', /🇺🇸/],
    ['韩国', /🇰🇷/],
    ['俄罗斯', /🇷🇺/],
    ['欧盟', /🇪🇺|🇬🇧|🇩🇪|🇫🇷|🇳🇱|🇮🇹|🇪🇸|🇸🇪|🇵🇱|🇨🇭|🇦🇹|🇧🇪|🇩🇰|🇫🇮|🇳🇴|🇹🇷/],
  ];
  const REGION_RECOVERY_PATTERNS = [
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

  const normalizedRegionKeywordMap = Object.create(null);
  for (let i = 0; i < REGION_PRIORITY.length; i++) {
    const regionName = REGION_PRIORITY[i];
    const keywords = REGION_KEYWORD_MAP[regionName] || [];
    const preparedKeywords = [];
    for (let j = 0; j < keywords.length; j++) {
      const lowerKeyword = String(keywords[j]).toLowerCase();
      preparedKeywords.push({
        lowerKeyword,
        compactKeyword: lowerKeyword.includes(' ') ? lowerKeyword.replace(/\s+/g, '') : lowerKeyword,
        isShortAlphaWord: lowerKeyword.length <= 3 && /^[a-z]+$/.test(lowerKeyword)
      });
    }
    normalizedRegionKeywordMap[regionName] = preparedKeywords;
  }

  const normalizeCache = new Map();

  // 噪声关键词：去掉套餐属性、业务标签、机场营销词，尽量只保留地区相关信息。
  const noiseKeywords = [
    'vip', 'svip', '倍率', 'x\\d+', 'iepl', 'iplc', 'bgp', 'cn2', 'gia',
    'game', 'games', 'gaming', 'stream', 'media', 'unlock', 'nf', '奈飞',
    'netflix', 'disney', 'hbo', 'max', 'prime', 'chatgpt', 'gpt', 'ai',
    'home', 'residential', 'station', 'server', 'node', 'premium', 'traffic',
    'test', 'testing', 'expire', 'plan', 'used', 'aws', 'hy2', 'anytls',
  ];
  const noisePattern = new RegExp('\\b(' + noiseKeywords.join('|') + ')\\b', 'gi');

  // 名称标准化：先去旗帜、符号和营销噪声，降低地区匹配误伤率。
  function normalizeRegionName(name) {
    const key = String(name || '');
    if (normalizeCache.has(key)) return normalizeCache.get(key);
    const result = String(name || '')
      .toLowerCase()
      .replace(/(?:\uD83C[\uDDE6-\uDDFF]){2}/g, ' ')
      .replace(/[\u2600-\u27BF]/g, ' ')
      .replace(/[|｜¦•·・,，;；:：/\_+-–—()\[\]{}<>【】「」『』]/g, ' ')
      .replace(noisePattern, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    normalizeCache.set(key, result);
    return result;
  }

  // 地区匹配主流程：旗帜优先，其次关键词，最后再走宽松恢复匹配。
  function matchRegion(name) {

    const rawName = String(name || '');
    for (const [regionName, flagPattern] of REGION_FLAG_MAP) {
      if (flagPattern.test(rawName)) return regionName;
    }
    const normalized = normalizeRegionName(rawName);
    if (!normalized) return '其他地区';

    const compact = normalized.includes(' ') ? normalized.replace(/\s+/g, '') : normalized;

    for (let regionIndex = 0; regionIndex < REGION_PRIORITY.length; regionIndex++) {
      const regionName = REGION_PRIORITY[regionIndex];
      const keywords = normalizedRegionKeywordMap[regionName] || [];
      for (let i = 0; i < keywords.length; i++) {
        const keywordInfo = keywords[i];
        if (keywordInfo.isShortAlphaWord) {
          if (hasWholeWord(normalized, keywordInfo.lowerKeyword)) return regionName;
          continue;
        }
        if (normalized.includes(keywordInfo.lowerKeyword)) return regionName;
        if (keywordInfo.compactKeyword !== keywordInfo.lowerKeyword && compact.includes(keywordInfo.compactKeyword)) return regionName;
      }
    }
    // 兜底匹配：在关键词和旗帜均未命中时，用宽松正则做最后一次地区恢复。
    for (const [regionName, pattern] of REGION_RECOVERY_PATTERNS) {
      if (pattern.test(normalized)) return regionName;
    }

    return '其他地区';
  }
  perfStart('region_classify');
  for (let i = 0; i < cleanProxies.length; i++) {
    const proxy = cleanProxies[i];
    const matchedRegion = matchRegion(proxy.name);
    if (!regionGroups[matchedRegion]) {
      regionGroups['其他地区'].push(proxy.name);
      continue;
    }
    regionGroups[matchedRegion].push(proxy.name);
  }
  // 未命中明确地区特征的节点统一回收进「其他地区」，避免掉出地区体系。
  // 当上游订阅命名只有广告词/序号时，这里会成为主要承接池，供后续自动组与兜底链继续复用。
  const otherRegionNodes = unique(regionGroups['其他地区']);
  const hasNamedPrimaryRegion = ['香港', '台湾', '日本', '新加坡', '美国', '韩国', '俄罗斯', '欧盟']
    .some(regionName => regionGroups[regionName].length > 0);
  perfEnd('region_classify');

  // 运行期参数镜像：后续建组函数统一读取这些局部常量；如需调参，优先修改上方常量定义。
  const testUrl = TEST_URL;
  const testInterval = TEST_INTERVAL;
  const testTolerance = TEST_TOLERANCE;
  const testTimeout = TEST_TIMEOUT;
  const testMaxFailedTimes = TEST_MAX_FAILED_TIMES;
  const fallbackInterval = FALLBACK_INTERVAL;
  const fallbackTolerance = FALLBACK_TOLERANCE;
  const fallbackTimeout = FALLBACK_TIMEOUT;
  const fallbackMaxFailedTimes = FALLBACK_MAX_FAILED_TIMES;
  const regionUrlTestInterval = REGION_TEST_INTERVAL;
  const regionUrlTestTolerance = REGION_TEST_TOLERANCE;
  const regionUrlTestTimeout = REGION_TEST_TIMEOUT;
  const regionUrlTestMaxFailedTimes = REGION_TEST_MAX_FAILED_TIMES;
  const healthCheckLazy = HEALTH_CHECK_LAZY;
  // 分组构造工具：负责保留旧顺序、补默认项，并统一生成各类策略组。
  // 保留用户顺序：若旧配置已有同名 select 组，则尽量继承其代理顺序，减少每次刷新后的选项跳动。
  function preserveGroup(group) {
    const oldGroup = existingGroupMap[group.name];

    if (group.type !== 'select') return group;
    if (!oldGroup || !Array.isArray(oldGroup.proxies) || !Array.isArray(group.proxies)) return group;
    if (group.name === '全球直连') {
      return { ...group, proxies: ['DIRECT'] };
    }
    const groupProxySet = new Set(group.proxies);
    const oldProxies = [];
    const oldProxySeen = new Set();
    for (let i = 0; i < oldGroup.proxies.length; i++) {
      const proxyName = oldGroup.proxies[i];
      if (!groupProxySet.has(proxyName) || oldProxySeen.has(proxyName)) continue;
      oldProxySeen.add(proxyName);
      oldProxies.push(proxyName);
    }
    const remaining = [];
    for (let i = 0; i < group.proxies.length; i++) {
      const proxyName = group.proxies[i];
      if (!oldProxySeen.has(proxyName)) remaining.push(proxyName);
    }
    return { ...group, proxies: oldProxies.concat(remaining) };
  }


  // 代理列表兜底：合并用户列表和默认项，若最终为空则至少返回 DIRECT。
  // 列表兜底约定：这里只能返回一维字符串数组；若改成对象/嵌套数组，会直接影响 Clash 配置反序列化。
  function ensureGroupList(list, extraDefaults) {
    const merged = [];
    const seen = new Set();
    const primary = asArray(list);
    const defaults = asArray(extraDefaults);
    for (let i = 0; i < primary.length; i++) {
      const item = primary[i];
      if (!item || seen.has(item)) continue;
      seen.add(item);
      merged.push(item);
    }
    for (let i = 0; i < defaults.length; i++) {
      const item = defaults[i];
      if (!item || seen.has(item)) continue;
      seen.add(item);
      merged.push(item);
    }
    return merged.length ? merged : ['DIRECT'];
  }

  // URL Test 组：用于自动测速选优；没有节点时直接跳过创建，避免伪装成直连组。
  function makeUrlTestGroup(name, icon, nodes, interval, tolerance, options = {}) {
    const proxies = ensureGroupList(nodes, []);
    // 自动测速组没有可用节点时不应静默降级为 DIRECT；由调用方跳过创建，避免"代理组名存在但实际直连"。
    if (!proxies.length || (proxies.length === 1 && proxies[0] === 'DIRECT')) return null;
    const normalizedInterval = typeof interval === 'number' ? interval : testInterval;
    const normalizedTolerance = typeof tolerance === 'number' ? tolerance : testTolerance;
    const normalizedUrl = options.url || testUrl;
    const normalizedTimeout = typeof options.timeout === 'number' ? options.timeout : testTimeout;
    const normalizedMaxFailedTimes = typeof options.maxFailedTimes === 'number' ? options.maxFailedTimes : testMaxFailedTimes;
    const normalizedLazy = typeof options.lazy === 'boolean' ? options.lazy : healthCheckLazy;
    return {
      name,
      type: 'url-test',
      icon,
      url: normalizedUrl,
      interval: normalizedInterval,
      tolerance: normalizedTolerance,
      timeout: normalizedTimeout,
      'max-failed-times': normalizedMaxFailedTimes,
      lazy: normalizedLazy,
      proxies
    };
  }

  // Select 组：给用户手动切换使用，默认附带自动选择等兜底入口。
  function makeSelectGroup(name, icon, list, extraDefaults = ['自动选择']) {
    return { name, type: 'select', icon, proxies: sanitizeChoiceList(list, extraDefaults) };
  }

  // Fallback 组：按存活顺序故障转移，适合关键业务场景而不是单纯测速最低延迟。
  function makeFallbackGroup(name, icon, list, extraDefaults = ['自动选择'], options = {}) {
    const proxies = ensureGroupList(list, extraDefaults);
    return {
      name,
      type: 'fallback',
      icon,
      url: options.url || testUrl,
      interval: typeof options.interval === 'number' ? options.interval : fallbackInterval,
      tolerance: typeof options.tolerance === 'number' ? options.tolerance : fallbackTolerance,
      timeout: typeof options.timeout === 'number' ? options.timeout : fallbackTimeout,
      'max-failed-times': typeof options.maxFailedTimes === 'number' ? options.maxFailedTimes : fallbackMaxFailedTimes,
      lazy: typeof options.lazy === 'boolean' ? options.lazy : healthCheckLazy,
      proxies
    };
  }

  // 批量 Select 生成：把声明式定义表转成实际策略组对象。
  function makeSelectGroupsFromDefs(defs) {
    const groups = [];
    const list = asArray(defs);
    for (let i = 0; i < list.length; i++) {
      const def = list[i];
      if (!def || !def.name) continue;
      groups.push(makeSelectGroup(def.name, def.icon, def.choices, def.extraDefaults));
    }
    return groups;
  }
  // 规则集合并：把多个规则片段展开、拍平，并对“同匹配键”采用后定义覆盖前定义。
  // 这样可保留脚本编排顺序的覆写语义：后面的同 type+value 规则会替换前面的同键规则。
  function mergeRuleSets(...ruleSets) {
    const merged = [];
    const seenRuleIndexes = new Map();
    for (let i = 0; i < ruleSets.length; i++) {
      const ruleSet = asArray(ruleSets[i]);
      for (let j = 0; j < ruleSet.length; j++) {
        const rule = ruleSet[j];
        if (!rule) continue;
        const identityKey = getRuleIdentityKey(rule) || `RAW@@${rule}`;
        if (seenRuleIndexes.has(identityKey)) {
          const prevIndex = seenRuleIndexes.get(identityKey);
          if (typeof prevIndex === 'number' && prevIndex >= 0 && prevIndex < merged.length) merged[prevIndex] = null;
        }
        seenRuleIndexes.set(identityKey, merged.length);
        merged.push(rule);
      }
    }
    return merged.filter(Boolean);
  }


  // 规则映射表：将 { name, rules } 定义转成按名称索引的查询结构。
  function buildRuleSetMap(defs) {
    const map = Object.create(null);
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      if (!def || !def.name) continue;
      map[def.name] = def.rules;
    }
    return map;
  }

  // 按顺序收集规则：根据给定 order 拼接规则块，确保最终规则顺序可控。
  function collectRuleSets(defs, order) {
    const ruleSetMap = buildRuleSetMap(defs);
    const collected = [];
    for (let i = 0; i < order.length; i++) {
      const rules = asArray(ruleSetMap[order[i]]);
      for (let j = 0; j < rules.length; j++) collected.push(rules[j]);
    }
    return collected;
  }
  // 最终分组去重：过滤空项，并以组名为键去重，同名组保留首次定义。
  function finalizeGroupList(groups) {
    const finalized = [];
    const seen = new Set();
    const list = asArray(groups);
    for (let i = 0; i < list.length; i++) {
      const group = list[i];
      const groupName = group && group.name;
      if (!group || !groupName || seen.has(groupName)) continue;
      seen.add(groupName);
      finalized.push(group);
    }
    return finalized;
  }


  // 图标映射：地区图标与功能图标分离，便于后续扩展和替换。
  const regionIconMap = {
    '香港': qIcon('Hong_Kong'),
    '台湾': qIcon('Taiwan'),
    '日本': qIcon('Japan'),
    '新加坡': qIcon('Singapore'),
    '美国': qIcon('United_States'),
    '韩国': qIcon('Korea'),
    '俄罗斯': qIcon('Russia'),
    '欧盟': qIcon('European_Union'),
    '其他地区': qIcon('World_Map')
  };

  const iconMap = {
    // 基础 / 通用：优先统一走 qIcon / jsDelivr，减少 raw 源波动。
    rocket: qIcon('Rocket'),
    auto: qIcon('Auto'),
    select: qIcon('Static'),
    balance: qIcon('Round_Robin'),
    direct: qIcon('Direct'),
    final: qIcon('Final'),
    global: qIcon('Global'),

    // 故障转移 / 特殊用途
    fallback: qIcon('Available'),
    fallbackFinal: qIcon('Airport'),
    flare: 'https://api.iconify.design/tabler:flame-filled.svg?color=%2300d1b2',
    lowMultiplier: 'https://api.iconify.design/tabler:gauge-filled.svg?color=%23f59e0b',
    multiplier: qIcon('Filter'),
    home: 'https://api.iconify.design/tabler:home-filled.svg',

    // 平台 / 服务
    youtube: qIcon('YouTube'),
    youtubeFallback: qIcon('Streaming'),
    tiktok: qIcon('TikTok'),
    meta: 'https://api.iconify.design/simple-icons:meta.svg?color=%231877F2',
    twitter: 'https://api.iconify.design/logos:twitter.svg?color=%231DA1F2',
    telegram: qIcon('Telegram'),
    google: qIcon('Google_Search'),
    playstore: 'https://api.iconify.design/logos:google-play-icon.svg',
    microsoft: qIcon('Microsoft'),
    apple: qIcon('Apple'),
    cloudflare: qIcon('Cloudflare'),
    github: qIcon('GitHub'),
    ai: 'https://api.iconify.design/mdi:robot-excited-outline.svg?color=%238b5cf6',
    aiFallback: qIcon('Bot'),
    fcm: 'https://fastly.jsdelivr.net/gh/MiToverG422/Qure@master/IconSet/Color/fcm.png',

    // 流媒体 / 社交 / 娱乐
    streaming: qIcon('Netflix'),
    streamingGlobal: qIcon('Media'),
    netflix: qIcon('Netflix'),
    spotify: qIcon('Spotify'),
    twitch: 'https://api.iconify.design/simple-icons:twitch.svg?color=%239146FF',
    niconico: 'https://api.iconify.design/simple-icons:niconico.svg?color=%23EAB20C',
    taiwanMedia: 'https://ani.gamer.com.tw/favicon.ico',
    social: 'https://api.iconify.design/simple-icons:reddit.svg?color=%23FF4500',
    reddit: 'https://api.iconify.design/simple-icons:reddit.svg',
    discord: 'https://api.iconify.design/simple-icons:discord.svg',
    bluesky: 'https://api.iconify.design/simple-icons:bluesky.svg',
    mastodon: 'https://api.iconify.design/simple-icons:mastodon.svg',
    decentralized: 'https://api.iconify.design/simple-icons:bluesky.svg?color=%230380B0',

    // 地区 / 其他
    china: qIcon('China_Map'),
    russia: qIcon('Russia'),
    jpkr: qIcon('AbemaTV'),
    game: qIcon('Game'),
    download: qIcon('Download'),
    adblock: qIcon('Advertising'),
    riskControl: 'https://mihomo.echs.top/img/Hand-Painted-icon/Google_Suite/Account.png'
  };
  function makeFusionRegionGroupNames(label) {
    return {
      auto: label + '自动',
      manual: label + '手动',
      homeAuto: label + '家宽',
      homeManual: label + '家宽手动',
    };
  }
  // 地区目录：先生成地区测速组，再派生出地区名称映射与候选链。
  // 地区测速主顺序：既影响展示顺序，也影响后续若干候选池的默认拼接优先级。
  const regionAutoOrder = ['香港', '台湾', '美国', '日本', '新加坡', '韩国', '俄罗斯', '欧盟', '其他地区'];

  // 地区目录构建：为每个已存在节点的地区生成 自动 / 家宽自动 及其元数据。
  const regionCatalog = regionAutoOrder.reduce((acc, regionName) => {

    const regionNodes = unique(regionGroups[regionName] || []);
    if (!regionNodes.length) return acc;

    const names = makeFusionRegionGroupNames(regionName);
    const residentialNodes = regionNodes.filter(name => isResidentialProxyName(name));
    const autoGroup = makeUrlTestGroup(names.auto, regionIconMap[regionName], regionNodes, regionUrlTestInterval, regionUrlTestTolerance, {
      timeout: regionUrlTestTimeout,
      maxFailedTimes: regionUrlTestMaxFailedTimes
    });
    const homeAutoGroup = residentialNodes.length
      ? makeUrlTestGroup(names.homeAuto, regionIconMap[regionName], residentialNodes, regionUrlTestInterval, regionUrlTestTolerance, {
        timeout: regionUrlTestTimeout,
        maxFailedTimes: regionUrlTestMaxFailedTimes
      })
      : null;

    acc[regionName] = {
      name: regionName,
      nodes: regionNodes,
      residentialNodes,
      icon: regionIconMap[regionName],
      names,
      autoGroup,
      homeAutoGroup
    };
    return acc;
  }, {});
  // 地区映射缓存：把地区名快速映射到自动组 / 家宽自动组，供候选池复用。
  const regionAutoMap = Object.create(null);
  const regionHomeAutoMap = Object.create(null);
  const regionAutoNames = [];
  const regionHomeAutoNames = [];
  const regionCatalogValues = Object.values(regionCatalog);
  const regionCatalogEntries = Object.entries(regionCatalog);
  for (let i = 0; i < regionCatalogEntries.length; i++) {
    const entry = regionCatalogEntries[i];
    const info = entry[1];
    regionAutoMap[info.name] = info.names.auto;
    regionAutoNames.push(info.names.auto);
    if (info.homeAutoGroup) {
      regionHomeAutoMap[info.name] = info.names.homeAuto;
      regionHomeAutoNames.push(info.names.homeAuto);
    }
  }

  const regionAutoGroups = [];
  const regionHomeAutoGroups = [];
  for (let i = 0; i < regionCatalogValues.length; i++) {
    const info = regionCatalogValues[i];
    if (info.autoGroup) regionAutoGroups.push(info.autoGroup);
    if (info.homeAutoGroup) regionHomeAutoGroups.push(info.homeAutoGroup);
  }

  // 地区查询辅助：统一生成地区自动链、家宽链与原始节点列表。
  function getRegionAuto(name) {
    return regionAutoMap[name] || null;
  }

  function getRegionHomeAuto(name) {
    return regionHomeAutoMap[name] || null;
  }
  function buildRegionChain(names) {
    const regions = asArray(names);
    const chain = [];
    for (let i = 0; i < regions.length; i++) {
      const name = getRegionAuto(regions[i]);
      if (name) chain.push(name);
    }
    return chain;
  }
  function buildRegionHomeChain(names) {
    const regions = asArray(names);
    const chain = [];
    for (let i = 0; i < regions.length; i++) {
      const name = getRegionHomeAuto(regions[i]);
      if (name) chain.push(name);
    }
    return chain;
  }
  function getRegionNodes(regionName, options = {}) {
    const { includeResidential = true, residentialOnly = false } = options;
    const info = regionCatalog[regionName];
    if (!info) return [];
    if (residentialOnly) return info.residentialNodes.slice();
    if (includeResidential) return info.nodes.slice();
    return info.nodes.filter(name => !isResidentialProxyName(name));
  }
  function buildRegionNodeList(names, options = {}) {
    const merged = [];
    const seen = new Set();
    const regions = asArray(names);
    for (let i = 0; i < regions.length; i++) {
      const nodes = getRegionNodes(regions[i], options);
      for (let j = 0; j < nodes.length; j++) {
        const name = nodes[j];
        if (!name || seen.has(name)) continue;
        seen.add(name);
        merged.push(name);
      }
    }
    return merged;
  }
  function buildNodeChain(patterns) {
    const chain = [];
    for (let i = 0; i < allProxyNames.length; i++) {
      const name = allProxyNames[i];
      for (let j = 0; j < patterns.length; j++) {
        if (patterns[j].test(name)) {
          chain.push(name);
          break;
        }
      }
    }
    return chain;
  }
  function filterOutDirectEntries(names) {
    return asArray(names).filter(name => {
      if (!name || name === 'DIRECT') return false;
      return !String(name).includes('直连 |');
    });
  }
  function buildChoiceList(...parts) {
    const merged = [];
    const seen = new Set();
    for (let i = 0; i < parts.length; i++) {
      const part = asArray(parts[i]);
      for (let j = 0; j < part.length; j++) {
        const item = part[j];
        if (!item || seen.has(item)) continue;
        seen.add(item);
        merged.push(item);
      }
    }
    return merged;
  }
  function createNamedChoiceMap(defs, builder) {
    const map = Object.create(null);
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      map[def.name] = builder(def);
    }
    return map;
  }
  function createNamedValueMap(defs, keyField, builder) {
    const map = Object.create(null);
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      map[def[keyField]] = builder(def);
    }
    return map;
  }
  function makeBusinessChoiceMap(defs) {
    return createNamedValueMap(defs, 'key', def => makeOrderedChoices(def.first, def.pool));
  }
  function makeChoicePool(first, ...poolParts) {
    return makeOrderedChoices(first, buildChoiceList(...poolParts));
  }
  function makeGroupNameSet(groups) {
    const set = new Set();
    const list = asArray(groups);
    for (let i = 0; i < list.length; i++) {
      const group = list[i];
      if (group && group.name) set.add(group.name);
    }
    return set;
  }
  function sanitizeChoiceList(list, fallbackChoices) {
    const merged = [];
    const seen = new Set();
    const sources = [asArray(list), asArray(fallbackChoices)];
    for (let i = 0; i < sources.length; i++) {
      const part = sources[i];
      for (let j = 0; j < part.length; j++) {
        const item = part[j];
        if (!item || seen.has(item)) continue;
        seen.add(item);
        merged.push(item);
      }
    }
    return merged.length ? merged : ['DIRECT'];
  }
  const BUILTIN_CHOICE_NAMES = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS']);
  function makeNameSet(list) {
    const set = new Set();
    const source = asArray(list);
    for (let i = 0; i < source.length; i++) {
      const item = source[i];
      if (item) set.add(item);
    }
    return set;
  }
  function filterDynamicChoices(list, availableNames, selfName) {
    const filtered = [];
    const source = asArray(list);
    for (let i = 0; i < source.length; i++) {
      const item = source[i];
      if (!item || item === selfName) continue;
      if (BUILTIN_CHOICE_NAMES.has(item) || availableNames.has(item)) filtered.push(item);
    }
    return filtered;
  }
  // 全局家宽池：从全部节点中抽出住宅线路，供风控 / 支付 / 登录等敏感业务优先选择。
  const globalHomeNodes = residentialProxyNames.slice();

  // 可见地区链：把地区自动组与家宽自动组统一并入手动候选菜单。
  const fusionVisibleRegions = unique(regionAutoNames.concat(regionHomeAutoNames));

  // 全局兜底地区顺序：用于自动兜底组，优先尝试更常用出口地区。
  const AUTO_FALLBACK_REGION_ORDER = ['香港', '台湾', '日本', '新加坡', '美国', '韩国', '欧盟', '俄罗斯', '其他地区'];
  const autoFallbackNodes = unique(buildRegionChain(AUTO_FALLBACK_REGION_ORDER));

  // 区域故障转移定义：把高相关地区打包成可复用 fallback 组。
  const REGION_FAILOVER_DEFS = [
    { name: '港台故障转移', regions: ['香港', '台湾'], icon: qIcon('Star') },
    { name: '日韩故障转移', regions: ['日本', '韩国'], icon: qIcon('Heart') },
    { name: '欧美故障转移', regions: ['美国', '欧盟'], icon: qIcon('Magic') }
  ];

  const regionFallbackNodeMap = createNamedChoiceMap(REGION_FAILOVER_DEFS, def => buildRegionNodeList(def.regions));

  // YouTube无广策略：Google 广告投放基于出口 IP 的 GeoIP 归属。

  // Google 认为你在广告区 → 有广告；认为你在非广告区（中国大陆/俄罗斯等）→ 无广告。
  // 注意：脚本层面无法做真实 GeoIP 探测（那是运行时网络请求），只能靠节点名特征推断。
  // 送中信号分为三档：
  //   🅰️ 强信号（节点名明确写了送中/回国/CN落地）
  //   🅱️ 弱信号（节点名含 CN2/GIA/CTG/163/CMI/CT/CU/CM 等中国线路标记）
  //   🅲 推测（延迟异常低的非大陆节点、国内城市名出现在非大陆节点）
  // 强信号优先，弱信号次之，最后才是俄罗斯/澳门等经验无广地区。
  // YouTube 无广候选：优先挑选更可能被 Google 识别为低广告区的出口节点。
  const cnLandingStrong = [
    /送中|回国|落地中|国内中转|CN落地|回国优化|完美回国|极速回国/,
    /HK.?CN|TW.?CN|SG.?CN|JP.?CN|US.?CN|KR.?CN|AU.?CN|DE.?CN|UK.?CN|FR.?CN/,

    /\b回国\b|\bCnRoute\b|\bBackCN\b/i,
  ];

  // 弱信号：中国骨干线路标记 → 走 CN 出口概率高，Google GeoIP → CN
  const cnLandingWeak = [
    /\bCN2\b|\bGIA\b|\bCTG\b/i,     // 电信 CN2 GIA / CTG 线路
    /\b163\b|\bCMI\b|\bCM\b/i,      // 联通 163 / 移动 CMI
    /\bCT\b|\bCU\b/,                 // China Telecom / China Unicom 缩写（注意噪音排除）
    /\bIPLC\b|\bIEPL\b/i,            // 专线 → 落地可能是 CN
    /\b上海\b|\b北京\b|\b深圳\b|\b广州\b|\b杭州\b|\b成都\b|\b南京\b|\b武汉\b/,  // 国内城市名暗示 CN 出口
  ];

  function isCnLanding(name) {
    return cnLandingStrong.some(re => re.test(String(name || '')));
  }

  function isCnLandingWeak(name) {
    return cnLandingWeak.some(re => re.test(String(name || '')));
  }

  const cnLandingStrongNodes = allProxyNames.filter(name => isCnLanding(name));
  const cnLandingWeakNodes = allProxyNames.filter(name => !isCnLanding(name) && isCnLandingWeak(name));
  // YouTube 无广候选池：按“送中强信号 → 弱信号 → 经验低广告地区”顺序组织。
  const youtubeFallbackNodes = filterOutDirectEntries(buildChoiceList(
    cnLandingStrongNodes,                                            // 🅰️ 明确送中 → 极大概率无广
    cnLandingWeakNodes,                                              // 🅱️ 中国线路标记 → 较大概率无广
    buildNodeChain([/俄罗斯/i, /俄(罗斯)?/i, /\bRU\b/i, /🇷🇺/]),     // 🅲 俄罗斯 → Google 无广告运营
    buildNodeChain([/越南/i, /\bVN\b/i, /🇻🇳/]),                      // 越南 → 低广告概率地区
    buildNodeChain([/澳门/i, /\bMO\b/i, /🇲🇴/]),                      // 🅳 澳门 → 小市场，广告覆盖率低
    regionGroups['欧盟'],
    regionGroups['其他地区'],
    regionGroups['香港'],
    regionGroups['新加坡'],
    regionGroups['日本'],
    regionGroups['美国']
  ));

  // AI 候选池：优先放入对海外 AI 服务兼容性通常更稳定的地区自动组。
  const aiFallbackNodes = filterOutDirectEntries(buildChoiceList(
    buildRegionChain(['台湾', '美国', '日本', '新加坡', '韩国', '其他地区'])
  ));

  // Cloudflare 候选：优先自动组与欧美出口，并允许显式 Cloudflare / WARP 节点参与。
  const cloudflareGroupChoices = filterOutDirectEntries(buildChoiceList(
    ['自动选择', '欧美故障转移', '全球直连', '全球手动'],
    buildNodeChain([/cloudflare/i, /\bCF\b/i, /WARP/i, /1\.1\.1\.1/]),
    buildRegionChain(['美国', '新加坡', '日本', '香港', '台湾', '欧盟'])
  ));

  // 下载分区定义：按地区生成 load-balance 组，适合大文件 / CDN 拉取类业务。
  const DOWNLOAD_REGION_DEFS = [

    { key: '香港', groupName: '香港下载', icon: regionIconMap['香港'] || qIcon('HK') },
    { key: '台湾', groupName: '台湾下载', icon: regionIconMap['台湾'] || qIcon('TW') },
    { key: '日本', groupName: '日本下载', icon: regionIconMap['日本'] || qIcon('JP') },
    { key: '韩国', groupName: '韩国下载', icon: regionIconMap['韩国'] || qIcon('KR') },
    { key: '新加坡', groupName: '新加坡下载', icon: regionIconMap['新加坡'] || qIcon('SG') },
    { key: '美国', groupName: '美国下载', icon: regionIconMap['美国'] || qIcon('US') },
    { key: '欧盟', groupName: '欧盟下载', icon: regionIconMap['欧盟'] || qIcon('EU') }
  ];
  function makeLoadBalanceGroup(name, icon, nodes, options = {}) {
    const proxies = ensureGroupList(nodes, []);
    if (!proxies.length || (proxies.length === 1 && proxies[0] === 'DIRECT')) return null;
    return {
      name,
      type: 'load-balance',
      icon,
      url: options.url || testUrl,
      interval: options.interval || testInterval,
      strategy: options.strategy || 'consistent-hashing',
      lazy: typeof options.lazy === 'boolean' ? options.lazy : true,
      proxies
    };
  }
  function makeLoadBalanceGroups(defs, nodeBuilder, optionsBuilder = () => ({})) {
    return defs
      .map(def => makeLoadBalanceGroup(def.groupName, def.icon, nodeBuilder(def), optionsBuilder(def)))
      .filter(Boolean);
  }
  const downloadRegionGroups = makeLoadBalanceGroups(
    DOWNLOAD_REGION_DEFS,
    def => getRegionNodes(def.key, { includeResidential: false }),
    () => ({ interval: 600 })
  );

  // 下载候选池：优先给下载类业务提供负载均衡入口与地区下载组。
  const downloadGroupChoices = filterOutDirectEntries(buildChoiceList(['负载均衡', '自动选择'], downloadRegionGroups.map(group => group.name)));

  // 候选池装配：将通用节点、故障转移与特殊策略组组合成业务分流可选项。
  // 特殊 fallback 组：为 YouTube 无广、海外 AI 等敏感业务提供专用故障转移入口。
  const excludedFallbackChoices = ['YouTube无广节点优先组', '国外AI故障转移'];
  const SPECIAL_FALLBACK_DEFS = [
    { name: 'YouTube无广节点优先组', icon: iconMap.youtubeFallback, nodes: youtubeFallbackNodes, extraDefaults: ['自动兜底'], options: { interval: 300, tolerance: 180, lazy: true } },
    { name: '国外AI故障转移', icon: iconMap.aiFallback, nodes: aiFallbackNodes, extraDefaults: ['自动兜底'], options: { interval: 300, tolerance: 180, lazy: true } }

  ];

  // fallback 组总装：包含全局兜底、区域故障转移与特殊业务故障转移。
  const fallbackGroups = [

    makeFallbackGroup('自动兜底', iconMap.fallbackFinal, autoFallbackNodes, [], {
      interval: FALLBACK_INTERVAL,
      tolerance: FALLBACK_TOLERANCE,
      lazy: true
    }),
    ...REGION_FAILOVER_DEFS.map(def => makeFallbackGroup(def.name, def.icon, regionFallbackNodeMap[def.name], ['自动兜底'], {
      interval: FALLBACK_INTERVAL,
      tolerance: FALLBACK_TOLERANCE,
      lazy: true
    })),
    ...SPECIAL_FALLBACK_DEFS.map(def => makeFallbackGroup(def.name, def.icon, def.nodes, def.extraDefaults, def.options))
  ].filter(Boolean);
  // 负载均衡与特征聚合：生成下载、商店、家宽、倍率、流媒体等复用组。
  const playStoreBalanceNodes = buildChoiceList(
    buildRegionChain(['日本', '新加坡', '美国', '香港', '台湾', '欧盟']),
    buildRegionHomeChain(['日本', '新加坡', '美国', '香港', '台湾', '欧盟'])
  );
  // 负载均衡组：一个面向全局通用，一个面向谷歌商店下载 / 分发链路。
  const loadBalanceGroups = [];
  const globalLoadBalanceGroup = makeLoadBalanceGroup('负载均衡', iconMap.balance, ensureGroupList(allProxyNames, []));
  if (globalLoadBalanceGroup) loadBalanceGroups.push(globalLoadBalanceGroup);
  const playStoreLoadBalanceGroup = makeLoadBalanceGroup('谷歌商店负载均衡', iconMap.playstore, ensureGroupList(playStoreBalanceNodes, ['自动选择']));
  if (playStoreLoadBalanceGroup) loadBalanceGroups.push(playStoreLoadBalanceGroup);

  // 特殊聚合组：为家宽、倍率、流媒体等高频特征提供独立聚合入口。
  const globalHomeGroup = globalHomeNodes.length
    ? makeUrlTestGroup('全球家宽', iconMap.home, globalHomeNodes, regionUrlTestInterval, regionUrlTestTolerance)
    : null;


  // 倍率聚合：先按识别出的倍率值排序，再派生低倍率节点池。
  const globalMultiplierNodes = multiplierProxyNames.slice().sort((a, b) => {
    const aInfo = getMultiplierSortInfo(a);
    const bInfo = getMultiplierSortInfo(b);
    const diff = aInfo.value - bInfo.value;
    if (diff !== 0) return diff;
    if (aInfo.recognized !== bInfo.recognized) return aInfo.recognized ? -1 : 1;
    return String(a).localeCompare(String(b), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
  });
  const lowMultiplierNodes = globalMultiplierNodes.filter(name => {
    const info = getMultiplierSortInfo(name);
    return info.recognized && info.value <= 1;
  });
  const globalMultiplierGroup = globalMultiplierNodes.length
    ? makeUrlTestGroup('全球倍率', iconMap.multiplier, globalMultiplierNodes, regionUrlTestInterval, regionUrlTestTolerance)
    : null;
  const lowMultiplierGroup = lowMultiplierNodes.length
    ? makeUrlTestGroup('低倍率节点', iconMap.lowMultiplier, lowMultiplierNodes, regionUrlTestInterval, regionUrlTestTolerance)
    : null;
  const globalStreamingNodes = streamingProxyNames.slice();
  const globalStreamingGroup = globalStreamingNodes.length
    ? makeUrlTestGroup('全球流媒体', iconMap.streamingGlobal, globalStreamingNodes, regionUrlTestInterval, regionUrlTestTolerance)
    : null;
  const globalFeatureChoices = buildChoiceList(
    globalHomeGroup ? ['全球家宽'] : [],
    lowMultiplierGroup ? ['低倍率节点'] : [],
    globalMultiplierGroup ? ['全球倍率'] : [],
    globalStreamingGroup ? ['全球流媒体'] : []
  );
  // 候选菜单总索引：把 fallback、负载均衡、特征组、地区组与原始节点拼成通用候选池。
  const fallbackNames = fallbackGroups.map(group => group.name);
  const loadBalanceNames = loadBalanceGroups.map(group => group.name);
  const commonLoadBalanceNames = loadBalanceNames.filter(name => name !== '谷歌商店负载均衡');
  const regionFallbackNames = ['港台故障转移', '日韩故障转移', '欧美故障转移'];
  const orderedFallbackNames = unique([
    ...regionFallbackNames.filter(name => fallbackNames.includes(name)),
    '家宽故障转移',
    '自动兜底',
    ...fallbackNames.filter(name => !regionFallbackNames.includes(name) && name !== '家宽故障转移' && name !== '自动兜底' && !excludedFallbackChoices.includes(name))
  ]);
  const baseChoices = ['自动选择', '负载均衡', '全球手动']
    .concat(orderedFallbackNames)
    .concat(commonLoadBalanceNames)
    .concat(globalFeatureChoices)
    .concat(fusionVisibleRegions)
    .concat(allProxyNames);

  // ===== 分流候选池 =====
  const CHOICE_POOLS = {
    common: buildChoiceList(['节点选择'], baseChoices.filter(name => !excludedFallbackChoices.includes(name))),
    youtubeOnly: buildChoiceList(['节点选择', 'YouTube无广节点优先组'], baseChoices.filter(name => name !== '国外AI故障转移')),
    aiOnly: buildChoiceList(['节点选择', '国外AI故障转移'], baseChoices.filter(name => name !== 'YouTube无广节点优先组'))
  };

  // ===== 通用候选构造器 =====
  // 候选顺序合成：把 first 视为强优先项，其余候选按原池顺序补齐；不要随意改成排序逻辑。
  function makeOrderedChoices(first, pool) {
    const merged = [];
    const seen = new Set();
    const primary = asArray(first);
    const source = asArray(pool || baseChoices);
    for (let i = 0; i < primary.length; i++) {
      const item = primary[i];
      if (!item || seen.has(item)) continue;
      seen.add(item);
      merged.push(item);
    }
    for (let i = 0; i < source.length; i++) {
      const item = source[i];
      if (!item || seen.has(item)) continue;
      seen.add(item);
      merged.push(item);
    }
    return merged;
  }

  // ===== 业务分组候选项 =====
  const domesticChoices = directChoices.concat(fusionVisibleRegions);
  const taiwanAutoChoice = getRegionAuto('台湾');
  const BUSINESS_CHOICE_DEFS = [
    { key: 'Meta', first: ['自动选择'], pool: CHOICE_POOLS.common },
    { key: 'Telegram', first: ['自动选择'], pool: CHOICE_POOLS.common },
    { key: 'Twitch', first: ['自动选择'], pool: CHOICE_POOLS.common },
    { key: '国外游戏', first: ['自动选择'], pool: CHOICE_POOLS.common },
    { key: 'Twitter', first: ['自动选择'], pool: CHOICE_POOLS.common },
    { key: '社交信息流', first: ['自动选择'], pool: CHOICE_POOLS.common },
    { key: 'GitHub', first: ['自动选择'], pool: CHOICE_POOLS.common },
    { key: 'YouTube', first: ['YouTube无广节点优先组', '节点选择'], pool: CHOICE_POOLS.youtubeOnly },
    { key: 'Spotify', first: ['港台故障转移'], pool: CHOICE_POOLS.common },
    { key: 'Google', first: ['港台故障转移'], pool: CHOICE_POOLS.common },
    { key: 'TikTok', first: ['港台故障转移'], pool: CHOICE_POOLS.common },
    { key: '日韩生态区', first: ['日韩故障转移'], pool: CHOICE_POOLS.common },
    { key: 'Niconico', first: ['日韩故障转移'], pool: CHOICE_POOLS.common },
    { key: '去中心化平台', first: ['欧美故障转移'], pool: CHOICE_POOLS.common },
    { key: '微软服务', first: ['自动选择', '全球直连'], pool: CHOICE_POOLS.common },
    { key: '谷歌商店', first: ['谷歌商店负载均衡', '负载均衡', '自动选择'], pool: CHOICE_POOLS.common },
    { key: 'AI', first: ['国外AI故障转移', '节点选择'], pool: CHOICE_POOLS.aiOnly }
  ];
  const BUSINESS_SERVICE_ICON_DEFS = [
    ['YouTube', iconMap.youtube],
    ['TikTok', iconMap.tiktok],
    ['Meta', iconMap.meta],
    ['Twitter', iconMap.twitter],
    ['Niconico', iconMap.niconico],
    ['日韩生态区', iconMap.jpkr],
    ['Spotify', iconMap.spotify],
    ['Telegram', iconMap.telegram],
    ['Google', iconMap.google],
    ['谷歌商店', iconMap.playstore],
    ['微软服务', iconMap.microsoft],
    ['Twitch', iconMap.twitch],
    ['GitHub', iconMap.github],
    ['AI', iconMap.ai],
    ['国外游戏', iconMap.game],
    ['社交信息流', iconMap.social],
    ['去中心化平台', iconMap.decentralized]
  ];
  const businessChoiceMap = makeBusinessChoiceMap(BUSINESS_CHOICE_DEFS);
  const businessServiceGroupDefs = [];
  for (let i = 0; i < BUSINESS_SERVICE_ICON_DEFS.length; i++) {
    const entry = BUSINESS_SERVICE_ICON_DEFS[i];
    const name = entry[0];
    const icon = entry[1];
    businessServiceGroupDefs.push({ name, icon, choices: businessChoiceMap[name] });
  }

  const CHOICE_GROUPS = {
    streaming: globalStreamingGroup
      ? makeOrderedChoices(['全球流媒体', '自动选择'], CHOICE_POOLS.common)
      : makeOrderedChoices(['自动选择'], CHOICE_POOLS.common),
    taiwanMedia: makeOrderedChoices(
      unique(['港台故障转移', taiwanAutoChoice, '自动选择'].filter(Boolean)),
      CHOICE_POOLS.common
    ),
    riskControl: unique([
      '家宽故障转移',
      globalHomeGroup ? '全球家宽' : null,
      '全球手动',
      ...regionHomeAutoNames.filter(name => name !== '全球家宽'),
      '港台故障转移',
      '日韩故障转移',
      '欧美故障转移',
      '自动兜底',
      '节点选择',
      '自动选择',
      '全球直连'
    ].filter(Boolean))
  };

  const preferredHomeFailover = [
    '香港家宽自动',
    '香港自动',
    '新加坡家宽自动',
    '新加坡自动',
    '日本家宽自动',
    '日本自动',
    '韩国家宽自动',
    '韩国自动',
    '美国家宽自动',
    '美国自动',
    '欧盟家宽自动',
    '欧盟自动'
  ];
  const availableHomeAutoNames = new Set(regionHomeAutoNames);
  const homeFailoverChoices = unique([
    ...preferredHomeFailover.filter(name => availableHomeAutoNames.has(name)),
    ...regionHomeAutoNames.filter(name => !preferredHomeFailover.includes(name))
  ].filter(Boolean));

  // ===== 主分组候选项 =====
  // 主候选集：为入口组、系统服务组和兜底组准备最终可展示选项。
  const MAIN_CHOICE_POOLS = {
    nodeSelection: makeChoicePool(
      ['自动选择', '负载均衡', '全球手动'],
      fallbackNames,
      globalFeatureChoices,
      fusionVisibleRegions
    ),
    systemService: makeChoicePool(
      ['自动选择', '节点选择', '全球手动', '全球直连'],
      fusionVisibleRegions,
      allProxyNames
    ),
    domesticService: makeChoicePool(
      ['全球直连'],
      directChoices.filter(x => x !== '全球直连'),
      domesticChoices.filter(x => x !== '全球直连' && !directChoices.includes(x))
    ),
    // 最终兜底候选：供 MATCH / 未命中流量使用，优先自动选择，其次允许手动接管与地区兜底。
    finalFallback: makeChoicePool(
      ['自动选择', '全球手动'],
      fallbackNames.filter(name => !excludedFallbackChoices.includes(name)),
      fusionVisibleRegions
    )
  };


  // ===== 附加显示组 =====
  const regionAutoGroupMap = Object.create(null);
  for (let i = 0; i < regionAutoGroups.length; i++) {
    const group = regionAutoGroups[i];
    if (group && group.name) regionAutoGroupMap[group.name] = group;
  }

  const visibleRegionAutoGroups = [];

  for (let i = 0; i < regionAutoOrder.length; i++) {
    const groupName = regionAutoMap[regionAutoOrder[i]] || '';
    const group = regionAutoGroupMap[groupName];
    if (group) visibleRegionAutoGroups.push(group);
  }
  const specialFeatureGroups = [];
  if (globalHomeGroup) specialFeatureGroups.push(globalHomeGroup);
  if (lowMultiplierGroup) specialFeatureGroups.push(lowMultiplierGroup);
  if (globalMultiplierGroup) specialFeatureGroups.push(globalMultiplierGroup);
  if (globalStreamingGroup) specialFeatureGroups.push(globalStreamingGroup);
  // 服务分流：统一声明业务组名称、图标与候选池，后续批量生成 select 组。

  const SERVICE_GROUP_BASE_DEFS = [
    { name: '风控安全', icon: iconMap.riskControl, choices: CHOICE_GROUPS.riskControl, extraDefaults: [] },
    { name: '国内服务', icon: iconMap.china, choices: MAIN_CHOICE_POOLS.domesticService },
    { name: '流媒体', icon: iconMap.streaming, choices: CHOICE_GROUPS.streaming },
    { name: '台湾媒体', icon: iconMap.taiwanMedia, choices: CHOICE_GROUPS.taiwanMedia },
    { name: 'FCM', icon: iconMap.fcm, choices: MAIN_CHOICE_POOLS.systemService },
    { name: 'Apple', icon: iconMap.apple, choices: MAIN_CHOICE_POOLS.systemService },
    { name: 'Cloudflare', icon: iconMap.cloudflare || iconMap.global, choices: cloudflareGroupChoices }
  ];
  const serviceGroupDefs = [
    SERVICE_GROUP_BASE_DEFS[0],
    ...businessServiceGroupDefs,
    ...SERVICE_GROUP_BASE_DEFS.slice(1)
  ];
  // 工具组约定：
  // - 全球直连固定只暴露 DIRECT；
  // - 漏网之鱼用于承接最终 MATCH 流量，因此保留在工具组末尾，便于与规则语义对应。
  const UTILITY_GROUP_PRESET_DEFS = [
    { name: '广告拦截', icon: iconMap.adblock, choices: ['REJECT', 'REJECT-DROP', 'PASS'], extraDefaults: ['REJECT-DROP'] },
    { name: '跟踪分析', icon: qIcon('Reject'), choices: ['REJECT', 'DIRECT', '自动选择'], extraDefaults: ['REJECT'] },
    { name: '全球直连', icon: iconMap.direct, choices: ['DIRECT'], extraDefaults: [] },
    { name: '漏网之鱼', icon: iconMap.final, choices: MAIN_CHOICE_POOLS.finalFallback }
  ];
  const utilityGroupDefs = [
    { name: '下载专用组', icon: iconMap.download || iconMap.fallback, choices: downloadGroupChoices.filter(name => name !== 'DIRECT') },
    ...UTILITY_GROUP_PRESET_DEFS
  ];

  const defaultAutoGroup = makeUrlTestGroup('自动选择', iconMap.auto, allProxyNames, 300, 50);
  const autoGroup = defaultAutoGroup || {
    name: '自动选择',
    type: 'select',
    icon: iconMap.auto,
    proxies: sanitizeChoiceList(allProxyNames, ['全球手动', 'DIRECT'])
  };
  const homeFailoverGroup = makeFallbackGroup('家宽故障转移', iconMap.flare, homeFailoverChoices, ['自动兜底']);

  const CORE_ENTRY_GROUPS = [
    makeSelectGroup('节点选择', iconMap.rocket, MAIN_CHOICE_POOLS.nodeSelection)
  ];
  const CORE_AUTO_GROUPS = [];
  CORE_AUTO_GROUPS.push(autoGroup);
  for (let i = 0; i < loadBalanceGroups.length; i++) CORE_AUTO_GROUPS.push(loadBalanceGroups[i]);
  CORE_AUTO_GROUPS.push(makeSelectGroup('全球手动', iconMap.select, allProxyNames, []));
  const CORE_FAILOVER_GROUPS = [];
  for (let i = 0; i < fallbackGroups.length; i++) CORE_FAILOVER_GROUPS.push(fallbackGroups[i]);
  if (homeFailoverGroup) CORE_FAILOVER_GROUPS.push(homeFailoverGroup);

  const serviceGroups = makeSelectGroupsFromDefs(serviceGroupDefs);
  const utilityGroups = makeSelectGroupsFromDefs(utilityGroupDefs);

  const coreProxyGroupSections = {
    entry: CORE_ENTRY_GROUPS,
    auto: CORE_AUTO_GROUPS,
    failover: CORE_FAILOVER_GROUPS,

    service: serviceGroups,
    utility: [
      ...utilityGroups,
      ...downloadRegionGroups
    ],
    visibleExtra: [
      ...visibleRegionAutoGroups,
      ...regionHomeAutoGroups,
      ...specialFeatureGroups
    ]
  };

  // 最终分组装配：拍平、隐藏辅助组并保留旧分组选项顺序。
  // 最终分组装配警示：这里的 flat/filter/map 顺序不要随意调整。
  // - flat: 先展开分区，确保后续处理面对的是线性组列表；
  // - filter(Boolean): 提前剔除空组，避免 hidden/preserve 处理空值；
  // - hidden 标记: 只隐藏辅助组，不改变其被其他组引用的能力；
  // - preserveGroup: 必须放在末尾，保证最终候选顺序基于已清洗后的组数据。

  const proxyGroupBuckets = Object.values(coreProxyGroupSections);
  const proxyGroups = [];
  for (let i = 0; i < proxyGroupBuckets.length; i++) {
    const bucket = asArray(proxyGroupBuckets[i]);
    for (let j = 0; j < bucket.length; j++) {
      let group = bucket[j];
      if (!group) continue;
      if (/^(香港|台湾|日本|韩国|新加坡|美国|欧盟)下载$/.test(group.name)) {
        group = Object.assign({}, group, { hidden: true });
      } else if (group.name === '谷歌商店负载均衡') {
        group = Object.assign({}, group, { hidden: true });
      }
      proxyGroups.push(preserveGroup(group));
    }
  }
  // 分组候选清洗：这是 proxy-groups 最后一道安全收口。
  // 目标只有三件事：
  // 1) 删掉不存在的候选名、重复项、自引用；
  // 2) 给少数必须可用的组补最小兜底；
  // 3) 切掉显式环引用，避免 A -> B -> A。
  // 它不负责重新设计分组，只负责把前面拼好的结果整理成可稳定导入的最终结构。
  function getGroupFallbackChoices(groupName) {
    // 全局直连组语义固定，最终必须只保留 DIRECT。
    if (groupName === '全球直连') return ['DIRECT'];
    // 全局手动组应尽量只保留真实节点，因此这里不给默认兜底项。
    if (groupName === '全球手动') return [];
    // 自动选择组在极端情况下允许退回“全球手动 / DIRECT”，避免测速组彻底空掉。
    if (groupName === '自动选择') return ['全球手动', 'DIRECT'];
    // 广告拦截组属于行为组，不依赖真实节点，兜底项是内建动作。
    if (groupName === '广告拦截') return ['REJECT-DROP', 'REJECT', 'PASS'];
    // 跟踪分析组用于阻断/直连观测，兜底动作不需要真实代理。
    if (groupName === '跟踪分析') return ['REJECT', 'DIRECT'];
    // 漏网之鱼承担 MATCH 收尾职责，允许回退到主入口组。
    if (groupName === '漏网之鱼') return ['自动选择', '全球手动', '全球直连'];
    // 其余分组不在这里乱补默认项，避免把“自动选择”偷偷塞进别的组。
    return [];
  }

  const finalizedProxyGroups = finalizeGroupList(proxyGroups);
  // availableChoiceNames：最终允许出现在 proxies 列表里的名字全集。
  // 包含真实节点名、已生成的组名，以及 DIRECT / REJECT 等内建动作。
  const availableChoiceNames = makeNameSet(allProxyNames);
  // realProxyNameSet：只包含真实节点名，用来判断“当前组里是否还有真实代理可用”。
  const realProxyNameSet = makeNameSet(allProxyNames);
  for (let i = 0; i < finalizedProxyGroups.length; i++) {
    const group = finalizedProxyGroups[i];
    if (group && group.name) availableChoiceNames.add(group.name);
  }
  for (const name of BUILTIN_CHOICE_NAMES) availableChoiceNames.add(name);

  function hasRealProxyChoices(list) {
    // 只要候选中还存在一个真实节点，就说明这个组不需要走语义兜底。
    return asArray(list).some(name => realProxyNameSet.has(name));
  }

  function finalizeGroupProxies(group, candidates) {
    // candidates 是已经过基础过滤后的候选列表；这里再按组类型决定最终落盘形式。
    const proxies = asArray(candidates);
    const fallbackChoices = getGroupFallbackChoices(group.name);
    const hasRealChoices = hasRealProxyChoices(proxies);

    // 全球直连组固定只保留 DIRECT，避免被旧配置或别处逻辑污染。
    if (group.name === '全球直连') return ['DIRECT'];
    // 全球手动组若被清空，则回填全部真实节点，确保用户始终能手动选线。
    if (group.name === '全球手动') return proxies.length ? proxies : allProxyNames.slice();
    // fallback 组只保留构建阶段明确给它的候选；这里不额外补“自动选择”。
    // 如果清洗后彻底为空，ensureGroupList(..., []) 会退到 DIRECT，至少保证配置仍可导入。
    if (group.type === 'fallback') return ensureGroupList(proxies, []);
    // 自动选择 / url-test / load-balance 这类“自动型”组，必须优先依赖真实节点工作。
    // 只有在真实节点被清空时，才允许回退到它们各自的最小兜底项。
    if (group.name === '自动选择' || group.type === 'url-test' || group.type === 'load-balance') {
      return hasRealChoices ? proxies : ensureGroupList(proxies, fallbackChoices);
    }
    // 其余 select / 行为组：有真实节点就直接保留；没真实节点才走语义兜底。
    return hasRealChoices ? proxies : sanitizeChoiceList(proxies, fallbackChoices);
  }

  // 第一层清洗：
  // - 删除不存在的候选名；
  // - 删除 self reference（组引用自己）；
  // - 删除重复项；
  // - 然后按组类型收口成最终候选。
  const sanitizedProxyGroups = finalizedProxyGroups.map(group => {
    if (!group || !Array.isArray(group.proxies) || !group.name) return group;
    const filteredProxies = filterDynamicChoices(group.proxies, availableChoiceNames, group.name);
    return Object.assign({}, group, { proxies: finalizeGroupProxies(group, filteredProxies) });
  });

  // 建立组名到组对象的映射，供第二层“切环”时快速查询目标组内容。
  const sanitizedGroupMap = Object.create(null);
  for (let i = 0; i < sanitizedProxyGroups.length; i++) {
    const group = sanitizedProxyGroups[i];
    if (group && group.name) sanitizedGroupMap[group.name] = group;
  }

  // 第二层清洗：切掉显式环引用。
  // 当前只处理两类高频问题：
  // 1) 自环：A -> A
  // 2) 二元互环：A -> B 且 B -> A
  // 这一步放在第一层之后，是因为必须基于“已经清洗过一次的最终候选关系”再判断一次。
  config['proxy-groups'] = sanitizedProxyGroups.map(group => {
    if (!group || !Array.isArray(group.proxies) || !group.name) return group;
    const nextProxies = [];
    for (let i = 0; i < group.proxies.length; i++) {
      const proxyName = group.proxies[i];
      const targetGroup = sanitizedGroupMap[proxyName];
      // 目标不是组，或者目标组没有 proxies，就把它当普通候选直接保留。
      if (!targetGroup || !Array.isArray(targetGroup.proxies)) {
        nextProxies.push(proxyName);
        continue;
      }
      // A -> A：直接丢掉。
      if (targetGroup.name === group.name) continue;
      // A -> B 且 B -> A：视为显式互环，直接丢掉当前这条引用。
      if (targetGroup.proxies.includes(group.name)) continue;
      nextProxies.push(proxyName);
    }
    // 切环后再按组类型收口一次，避免某些组因为去环而被清空。
    return Object.assign({}, group, { proxies: finalizeGroupProxies(group, nextProxies) });
  });

  // 规则目标校验：规则里引用的策略名必须真的存在。
  // 这是规则区最常见的维护事故之一：改了组名，却忘了同步规则目标。
  const availableRuleTargets = makeNameSet(config['proxy-groups'].map(group => group && group.name));
  for (const name of BUILTIN_CHOICE_NAMES) availableRuleTargets.add(name);
  function extractRulePolicyTarget(rule) {
    if (typeof rule !== 'string') return null;
    const parts = rule.split(',').map(part => String(part || '').trim());
    if (parts.length < 3) return null;
    const trailingFlags = new Set(['NO-RESOLVE', 'SRC', 'DST', 'UDP', 'TCP']);
    for (let i = parts.length - 1; i >= 2; i--) {
      const value = parts[i];
      if (!value) continue;
      if (trailingFlags.has(value.toUpperCase())) continue;
      return value;
    }
    return null;
  }

  function extractRuleMatchValue(rule) {
    if (typeof rule !== 'string') return null;
    const parts = rule.split(',');
    if (parts.length < 2) return null;
    return {
      type: String(parts[0] || '').trim().toUpperCase(),
      value: String(parts[1] || '').trim(),
      target: extractRulePolicyTarget(rule)
    };
  }
  function getRuleIdentityKey(rule) {
    if (typeof rule !== 'string') return null;
    const parts = rule.split(',').map(part => String(part || '').trim());
    const meta = extractRuleMatchValue(rule);
    if (!meta || !meta.type || !meta.value) return `RAW@@${rule}`;
    const normalizedType = meta.type.toUpperCase();
    const normalizedValue = meta.value;
    const extraParts = parts.length > 3 ? parts.slice(3).join(',') : '';
    return `${normalizedType}@@${normalizedValue}@@${extraParts}`;
  }


  function buildRuleDiagnostics(ruleSetDefs, mergedRules) {
    const diagnostics = {
      duplicateRulesAcrossSets: [],
      riskyShortKeywords: [],
      redundantDomainCoveredBySuffix: [],
      overriddenRuleTargets: [],
      broadKeywordOverlapHints: [],
      totalSourceRules: 0,

      totalMergedRules: Array.isArray(mergedRules) ? mergedRules.length : 0,
      dedupedRuleCount: 0,
      ruleSetSizes: [],
      mergedRuleTypeCounts: {}
    };
    const exactRuleOwners = new Map();
    const normalizedMatchOwners = new Map();

    for (const def of ruleSetDefs) {
      const rules = Array.isArray(def && def.rules) ? def.rules : [];
      const validRuleCount = rules.filter(rule => typeof rule === 'string').length;
      diagnostics.totalSourceRules += validRuleCount;
      diagnostics.ruleSetSizes.push({ name: def && def.name ? def.name : 'UNKNOWN', count: validRuleCount });
      for (const rule of rules) {
        if (typeof rule !== 'string') continue;
        if (!exactRuleOwners.has(rule)) exactRuleOwners.set(rule, []);
        exactRuleOwners.get(rule).push(def.name);

        const meta = extractRuleMatchValue(rule);
        if (!meta || !meta.type || !meta.value || !meta.target) continue;
        const ownerKey = `${meta.type}@@${meta.value}`;
        if (!normalizedMatchOwners.has(ownerKey)) normalizedMatchOwners.set(ownerKey, []);
        normalizedMatchOwners.get(ownerKey).push({ target: meta.target, set: def.name, rule });
      }
    }

    for (const [rule, owners] of exactRuleOwners.entries()) {
      const uniqOwners = Array.from(new Set(owners));
      if (uniqOwners.length > 1) diagnostics.duplicateRulesAcrossSets.push({ rule, sets: uniqOwners });
    }
    for (const [matchKey, entries] of normalizedMatchOwners.entries()) {
      const uniqTargets = Array.from(new Set(entries.map(item => item.target)));
      if (uniqTargets.length <= 1) continue;
      diagnostics.overriddenRuleTargets.push({
        matchKey,
        targets: uniqTargets,
        entries: entries.slice(0, 10),
        effectiveTarget: entries[entries.length - 1] ? entries[entries.length - 1].target : null
      });
    }

    diagnostics.dedupedRuleCount = Math.max(0, diagnostics.totalSourceRules - diagnostics.totalMergedRules);
    diagnostics.ruleSetSizes.sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name)));

    const suffixRuleMap = new Map();
    const keywordRules = [];
    for (const rule of mergedRules) {
      const meta = extractRuleMatchValue(rule);
      if (!meta || !meta.type || !meta.value || !meta.target) continue;
      diagnostics.mergedRuleTypeCounts[meta.type] = (diagnostics.mergedRuleTypeCounts[meta.type] || 0) + 1;
      if (meta.type === 'DOMAIN-SUFFIX') suffixRuleMap.set(`${meta.value}@@${meta.target}`, rule);
      if (meta.type === 'DOMAIN-KEYWORD') keywordRules.push(meta);
    }

    for (const rule of mergedRules) {
      const meta = extractRuleMatchValue(rule);
      if (!meta || meta.type !== 'DOMAIN' || !meta.value || !meta.target) continue;
      if (suffixRuleMap.has(`${meta.value}@@${meta.target}`)) {
        diagnostics.redundantDomainCoveredBySuffix.push(rule);
      }
    }

    for (const meta of keywordRules) {
      if (meta.value && meta.value.length <= 2) diagnostics.riskyShortKeywords.push(`DOMAIN-KEYWORD,${meta.value},${meta.target}`);
    }
    for (let i = 0; i < keywordRules.length; i++) {
      for (let j = i + 1; j < keywordRules.length; j++) {
        const a = keywordRules[i];
        const b = keywordRules[j];
        if (a.target === b.target) continue;
        if (!a.value || !b.value) continue;
        const av = a.value.toLowerCase();
        const bv = b.value.toLowerCase();
        if (av === bv) continue;
        if (av.length >= 4 && bv.includes(av)) diagnostics.broadKeywordOverlapHints.push({ broader: a, narrower: b });
        else if (bv.length >= 4 && av.includes(bv)) diagnostics.broadKeywordOverlapHints.push({ broader: b, narrower: a });
      }
    }

    return diagnostics;
  }
  function emitRuleDiagnostics(diagnostics) {
    if (!diagnostics || typeof console === 'undefined' || typeof console.log !== 'function') return;
    const lines = [];
    lines.push(`[rules diagnostics] source rules: ${diagnostics.totalSourceRules}, merged rules: ${diagnostics.totalMergedRules}, deduped: ${diagnostics.dedupedRuleCount}`);
    if (Array.isArray(diagnostics.ruleSetSizes) && diagnostics.ruleSetSizes.length) {
      lines.push('[rules diagnostics] top rule sets by size:');
      diagnostics.ruleSetSizes.slice(0, 10).forEach(item => {
        lines.push(`  - ${item.name}: ${item.count}`);
      });
    }
    const typeCountEntries = Object.entries(diagnostics.mergedRuleTypeCounts || {}).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    if (typeCountEntries.length) {
      lines.push('[rules diagnostics] merged rule types:');
      typeCountEntries.slice(0, 10).forEach(([type, count]) => {
        lines.push(`  - ${type}: ${count}`);
      });
    }
    if (diagnostics.duplicateRulesAcrossSets.length) {

      lines.push(`[rules diagnostics] duplicate exact rules across sets: ${diagnostics.duplicateRulesAcrossSets.length}`);
      diagnostics.duplicateRulesAcrossSets.slice(0, 10).forEach(item => {
        lines.push(`  - ${item.rule} <= ${item.sets.join(' | ')}`);
      });
    }
    if (diagnostics.overriddenRuleTargets.length) {
      lines.push(`[rules diagnostics] same match value overridden by later rule: ${diagnostics.overriddenRuleTargets.length}`);
      diagnostics.overriddenRuleTargets.slice(0, 10).forEach(item => {
        lines.push(`  - ${item.matchKey} => ${item.targets.join(' | ')} (effective: ${item.effectiveTarget || 'unknown'})`);
      });
    }

    if (diagnostics.redundantDomainCoveredBySuffix.length) {
      lines.push(`[rules diagnostics] DOMAIN covered by same DOMAIN-SUFFIX: ${diagnostics.redundantDomainCoveredBySuffix.length}`);
      diagnostics.redundantDomainCoveredBySuffix.slice(0, 10).forEach(rule => lines.push(`  - ${rule}`));
    }
    if (diagnostics.broadKeywordOverlapHints.length) {
      lines.push(`[rules diagnostics] cross-target keyword overlap hints: ${diagnostics.broadKeywordOverlapHints.length}`);
      diagnostics.broadKeywordOverlapHints.slice(0, 10).forEach(item => {
        lines.push(`  - broader ${item.broader.value}:${item.broader.target} vs narrower ${item.narrower.value}:${item.narrower.target}`);
      });
    }
    if (diagnostics.riskyShortKeywords.length) {
      lines.push(`[rules diagnostics] risky short DOMAIN-KEYWORD rules: ${diagnostics.riskyShortKeywords.length}`);
      diagnostics.riskyShortKeywords.slice(0, 10).forEach(rule => lines.push(`  - ${rule}`));
    }
    if (lines.length) console.log(lines.join('\n'));
  }


  // 规则数据区：按业务能力拆分为独立规则数组，最后统一合并去重。


  // YouTube 规则：处理主应用、ReVanced 系变体以及视频资源域名。
  const RULES_YOUTUBE = [

    'PROCESS-NAME,com.google.android.youtube,YouTube',
    'PROCESS-NAME,app.rvx.android.youtube,YouTube',
    'PROCESS-NAME,app.rvx.android.apps.youtube,YouTube',
    'PROCESS-NAME,app.revanced.android.youtube,YouTube',
    'PROCESS-NAME,app.morphe.android.youtube,YouTube',
    'DOMAIN,www.youtube.com,YouTube',
    'DOMAIN,m.youtube.com,YouTube',
    'DOMAIN,youtubeembeddedplayer.googleapis.com,YouTube',
    'DOMAIN,jnn-pa.googleapis.com,YouTube',
    'DOMAIN,video.google.com,YouTube',
    'DOMAIN-SUFFIX,youtube.com,YouTube',
    'DOMAIN-SUFFIX,youtubei.googleapis.com,YouTube',
    'DOMAIN-SUFFIX,youtube.googleapis.com,YouTube',

    'DOMAIN-SUFFIX,googlevideo.com,YouTube',
    'DOMAIN-SUFFIX,ytimg.com,YouTube',
    'DOMAIN-SUFFIX,ggpht.com,YouTube',
    'DOMAIN-SUFFIX,youtu.be,YouTube',
    'PROCESS-NAME,com.google.android.apps.youtube.music,YouTube'
  ];
  // 应用进程规则：优先用进程名命中高频 App，降低域名漏判。
  const RULES_APP_PROCESS = [

    'PROCESS-NAME,ai.perplexity.app.android,AI',
    'PROCESS-NAME,com.google.android.apps.bard,AI',
    'PROCESS-NAME,com.spotify.music,Spotify',
    'PROCESS-NAME,com.netflix.mediaclient,流媒体',
    'PROCESS-NAME,com.disney.disneyplus,流媒体',
    'PROCESS-NAME,com.amazon.avod.thirdpartyclient,流媒体',
    'PROCESS-NAME,com.hulu.plus,流媒体',
    'PROCESS-NAME,com.hbo.hbonow,流媒体',
    'PROCESS-NAME,com.hbo.max,流媒体',
    'PROCESS-NAME,com.discord,社交信息流',
    'PROCESS-NAME,com.twitter.android,Twitter',
    'PROCESS-NAME,com.reddit.frontpage,社交信息流',
    'PROCESS-NAME,com.valvesoftware.android.steam.community,国外游戏',
    'PROCESS-NAME,com.microsoft.xboxone.smartglass,国外游戏',
    'PROCESS-NAME,com.google.android.apps.translate,Google',
    'PROCESS-NAME,com.google.android.gms,Google',
    'PROCESS-NAME,com.google.android.gsf,Google',
    'PROCESS-NAME,com.google.android.apps.maps,Google',
    'PROCESS-NAME,com.deepl.mobiletranslator,Google',
    'PROCESS-NAME,com.deniscerri.ytdl,下载专用组',
    'PROCESS-NAME,com.deniscerri.ytdlnis,下载专用组',
    'PROCESS-NAME,io.github.deniscerri.ytdlnis,下载专用组',

  ];

  // 翻译服务规则：集中处理 Google Translate 与 DeepL 相关域名。
  const RULES_TRANSLATION = [

    'DOMAIN,translate.googleapis.com,Google',
    'DOMAIN-SUFFIX,translate.googleapis.com,Google',
    'DOMAIN,translation.googleapis.com,Google',
    'DOMAIN-SUFFIX,translation.googleapis.com,Google',
    'DOMAIN,translate-pa.googleapis.com,Google',
    'DOMAIN-SUFFIX,translate-pa.googleapis.com,Google',
    'DOMAIN,translate.google.com,Google',
    'DOMAIN-SUFFIX,translate.google.com,Google',
    'DOMAIN,translate.google.cn,Google',
    'DOMAIN-SUFFIX,translate.google.cn,Google',
    'DOMAIN,www.deepl.com,Google',
    'DOMAIN,api.deepl.com,Google',
    'DOMAIN,www2.deepl.com,Google',
    'DOMAIN,dict.deepl.com,Google',
    'DOMAIN,static.deepl.com,Google',
    'DOMAIN-SUFFIX,deepl.com,Google',
    'DOMAIN-SUFFIX,deeplpro.com,Google',
    'DOMAIN-SUFFIX,deeplusercontent.com,Google',
    'DOMAIN-SUFFIX,linguee.com,Google',
  ];
  // 广告拦截规则：覆盖广告、遥测、追踪与部分已知推广 SDK 域名。
  // 维护约定：
  // - 这里优先放“强动作”规则（如 REJECT-DROP / REJECT）；
  // - 同一域名若已经在前面被更强动作处理，后面不要再追加同域名的弱动作版本，避免职责冲突。
  // - DOMAIN-KEYWORD 只保留高置信度广告词，避免把过宽的通用词误伤到正常业务域名。
  const RULES_ADBLOCK = [

    'DOMAIN,incoming.telemetry.mozilla.org,REJECT-DROP',
    'DOMAIN-REGEX,^(log|mon)[0-9A-Za-z.-]*\.tiktokv\.com$,REJECT',
    'PROCESS-NAME,TikTok.Mod.Jaggu,TikTok',
    'PROCESS-NAME-REGEX,(?i)^TikTok\.Mod\.Jaggu(?::.*)?$,TikTok',
    'GEOSITE,category-ads-all,广告拦截',
    // 关键词拦截只保留高置信度广告词；像 ads / promo / analytics / sponsor 这类过宽词不在这里粗暴拦截。
    'DOMAIN-KEYWORD,adserver,广告拦截',
    'DOMAIN-KEYWORD,adnetwork,广告拦截',
    'DOMAIN-KEYWORD,adtech,广告拦截',
    'DOMAIN-KEYWORD,adsdk,广告拦截',
    'DOMAIN-KEYWORD,adapi,广告拦截',
    'DOMAIN-KEYWORD,adtrack,广告拦截',
    'DOMAIN-KEYWORD,adclick,广告拦截',
    'DOMAIN-KEYWORD,adcount,广告拦截',
    'DOMAIN-KEYWORD,adstat,广告拦截',
    'DOMAIN-KEYWORD,adload,广告拦截',
    'DOMAIN-KEYWORD,adsystem,广告拦截',
    'DOMAIN-KEYWORD,impression,广告拦截',
    'DOMAIN-KEYWORD,conversion,广告拦截',
    'DOMAIN-KEYWORD,atdmt,广告拦截',
    'DOMAIN-KEYWORD,adform,广告拦截',
    'DOMAIN-KEYWORD,taboola,广告拦截',
    'DOMAIN-KEYWORD,popunder,广告拦截',
    'DOMAIN-KEYWORD,clickhubs,广告拦截',
    'DOMAIN-KEYWORD,adriver,广告拦截',

    'DOMAIN-SUFFIX,pglstatp-toutiao.com,广告拦截',
    'DOMAIN-SUFFIX,pangolin-sdk-toutiao.com,广告拦截',
    'DOMAIN-SUFFIX,pangolin.snssdk.com,广告拦截',
    'DOMAIN-SUFFIX,sgsnssdk.com,广告拦截',
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
    'DOMAIN-SUFFIX,adsame.com,广告拦截',
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
    'DOMAIN-SUFFIX,adimg.uve.weibo.com,广告拦截',
    'DOMAIN-SUFFIX,alitui.weibo.com,广告拦截',
    'DOMAIN-SUFFIX,biz.weibo.com,广告拦截',
    'DOMAIN-SUFFIX,game.weibo.cn,广告拦截',
    'DOMAIN-SUFFIX,sax.sina.com.cn,广告拦截',
    'DOMAIN-SUFFIX,adbox.sina.com.cn,广告拦截',
    'DOMAIN-SUFFIX,adview.cn,广告拦截',
    'DOMAIN-SUFFIX,miaozhen.com,广告拦截',
    'DOMAIN-SUFFIX,irs01.com,广告拦截',
    'DOMAIN-SUFFIX,admaster.com.cn,广告拦截',
    'DOMAIN-SUFFIX,adpush.cn,广告拦截',
    'DOMAIN-SUFFIX,cnxad.com,广告拦截',
    'DOMAIN-SUFFIX,adkmob.com,广告拦截',
    'DOMAIN-SUFFIX,adobe-identity.omtrdc.net,广告拦截',
    'DOMAIN-SUFFIX,omtrdc.net,广告拦截',
    // 第 4 层：全球广告/追踪补充
    'DOMAIN-SUFFIX,2mdn.net,广告拦截',
    'DOMAIN-SUFFIX,googlesyndication.com,广告拦截',
    'DOMAIN-SUFFIX,googleadservices.com,广告拦截',
    'DOMAIN-SUFFIX,googleadsserving.cn,广告拦截',
    'DOMAIN-SUFFIX,googletagservices.com,广告拦截',
    'DOMAIN-SUFFIX,doubleclick.net,广告拦截',
    'DOMAIN-SUFFIX,google-analytics.com,广告拦截',
    // 第 5 层：TikTok 广告/遥测补充 + 浏览器扩展追踪
    // 已在规则前部以 REJECT / REJECT-DROP 强动作处理，这里不再重复放弱动作版本。

    // ===== 风控安全：金融支付 / 账号登录 / 高敏感 =====
    'DOMAIN-SUFFIX,accounts.google.com,风控安全',
    'DOMAIN-SUFFIX,myaccount.google.com,风控安全',
    'DOMAIN-SUFFIX,ogs.google.com,风控安全',
    'DOMAIN-SUFFIX,androidauth.googleapis.com,风控安全',
    'DOMAIN-SUFFIX,oauthaccountmanager.googleapis.com,风控安全',
    'DOMAIN-SUFFIX,oauth2.googleapis.com,风控安全',
    'DOMAIN-SUFFIX,securetoken.googleapis.com,风控安全',
    'DOMAIN-SUFFIX,identitytoolkit.googleapis.com,风控安全',
    'DOMAIN-SUFFIX,firebaseauth.googleapis.com,风控安全',
    'DOMAIN-SUFFIX,accounts.youtube.com,风控安全',
    'DOMAIN-SUFFIX,families.google.com,风控安全',
    'DOMAIN-SUFFIX,accounts.google.cn,风控安全',
    'DOMAIN-SUFFIX,workspace.google.com,风控安全',
    'DOMAIN-SUFFIX,admin.google.com,风控安全',
    'DOMAIN-SUFFIX,passwords.google.com,风控安全',
    'DOMAIN-SUFFIX,notifications.google.com,风控安全',
    'DOMAIN-SUFFIX,recaptcha.net,风控安全',
    'DOMAIN-SUFFIX,recaptcha-enterprise.google.com,风控安全',
    'DOMAIN-SUFFIX,console.anthropic.com,风控安全',
    'DOMAIN-SUFFIX,amazon.com,风控安全',
    'DOMAIN-SUFFIX,aws.amazon.com,风控安全',
    'PROCESS-NAME,com.instagram.android,Meta',
    'PROCESS-NAME,com.facebook.katana,Meta',
    'PROCESS-NAME,com.facebook.orca,Meta',
    'PROCESS-NAME,com.facebook.lite,Meta',
    'PROCESS-NAME,com.instagram.barcelona,Meta',
    'DOMAIN-SUFFIX,slack.com,风控安全',
    'DOMAIN-SUFFIX,notion.so,风控安全',
    'DOMAIN-SUFFIX,dropbox.com,风控安全',
    'DOMAIN-SUFFIX,twttr.com,风控安全',
    'DOMAIN-SUFFIX,twtrdns.net,风控安全',
    'DOMAIN-SUFFIX,redditmail.com,风控安全',
    'DOMAIN-SUFFIX,reddit.app.link,风控安全',
    'DOMAIN-SUFFIX,paypal.com,风控安全',
    'DOMAIN-SUFFIX,paypal.com.hk,风控安全',
    'DOMAIN-SUFFIX,paypal.com.sg,风控安全',
    'DOMAIN-SUFFIX,paypal.me,风控安全',
    'DOMAIN-SUFFIX,paypal.hk,风控安全',
    'DOMAIN-SUFFIX,paypal.jp,风控安全',
    'DOMAIN-SUFFIX,paypal.us,风控安全',
    'DOMAIN-SUFFIX,paypalservice.com,风控安全',
    'DOMAIN-SUFFIX,paypalcredit.com,风控安全',
    'DOMAIN-SUFFIX,braintreegateway.com,风控安全',
    'DOMAIN-SUFFIX,braintreepayments.com,风控安全',
    'DOMAIN-SUFFIX,card.io,风控安全',
    'DOMAIN-SUFFIX,paypalhere.com,风控安全',
    'DOMAIN-SUFFIX,venmo.com,风控安全',
    'DOMAIN-SUFFIX,xoom.com,风控安全',
    'DOMAIN-SUFFIX,stripe.com,风控安全',
    'DOMAIN-SUFFIX,stripe.network,风控安全',
    'DOMAIN-SUFFIX,link.com,风控安全',
    'DOMAIN-SUFFIX,stripe-terminal-local-reader.net,风控安全',
    'DOMAIN-SUFFIX,wise.com,风控安全',
    'DOMAIN-SUFFIX,transferwise.com,风控安全',
    'DOMAIN-SUFFIX,tradingview.com,风控安全',
    'DOMAIN-SUFFIX,hsbc.com,风控安全',
    'DOMAIN-SUFFIX,interactivebrokers.com,风控安全',
    'DOMAIN-SUFFIX,adyen.com,风控安全',
    'DOMAIN-SUFFIX,visa.com,风控安全',
    'DOMAIN-SUFFIX,mastercard.com,风控安全',
    'DOMAIN-SUFFIX,amex.com,风控安全',
    'DOMAIN-SUFFIX,revolut.com,风控安全',
    'DOMAIN-SUFFIX,ibkr.com,风控安全',
    'DOMAIN-SUFFIX,schwab.com,风控安全',
    'DOMAIN-SUFFIX,binance.com,风控安全',
    'DOMAIN-SUFFIX,binance.us,风控安全',
    'DOMAIN-SUFFIX,bnbstatic.com,风控安全',
    'DOMAIN-SUFFIX,binanceapi.com,风控安全',
    'DOMAIN-SUFFIX,coinbase.com,风控安全',
    'DOMAIN-SUFFIX,coingecko.com,风控安全',
    'DOMAIN-SUFFIX,coinmarketcap.com,风控安全',
    'DOMAIN-SUFFIX,okx.com,风控安全',
    'DOMAIN-SUFFIX,oklink.com,风控安全',
    'DOMAIN-SUFFIX,okx-dns.com,风控安全',
    'DOMAIN-SUFFIX,okx-dns1.com,风控安全',
    'DOMAIN-SUFFIX,okx-dns2.com,风控安全',
    'DOMAIN-SUFFIX,bybit.com,风控安全',
    'DOMAIN-SUFFIX,bytick.com,风控安全',
    'DOMAIN-SUFFIX,byapis.com,风控安全',
    'DOMAIN-SUFFIX,bycsi.com,风控安全',
    'DOMAIN-SUFFIX,bybit-global.com,风控安全',
    'DOMAIN-SUFFIX,bybitglobal.com,风控安全',
    'DOMAIN-SUFFIX,gate.io,风控安全',
    'DOMAIN-SUFFIX,gateimg.com,风控安全',
    'DOMAIN-SUFFIX,gatedata.org,风控安全',
    'DOMAIN-SUFFIX,kucoin.com,风控安全',
    'DOMAIN-SUFFIX,kucoin.plus,风控安全',
    'DOMAIN-SUFFIX,kraken.com,风控安全',
    'DOMAIN-SUFFIX,bitget.com,风控安全',
    'DOMAIN-SUFFIX,mexc.com,风控安全',
    'DOMAIN-SUFFIX,huobi.com,风控安全',
    'DOMAIN-SUFFIX,htx.com,风控安全',
    'DOMAIN-SUFFIX,trustwallet.com,风控安全',
    'DOMAIN-SUFFIX,walletconnect.com,风控安全',
    'DOMAIN-SUFFIX,walletconnect.org,风控安全',
    'DOMAIN-SUFFIX,ethereum.org,风控安全',
    'DOMAIN-SUFFIX,etherscan.io,风控安全',
    'DOMAIN-SUFFIX,opensea.io,风控安全',
    'DOMAIN-SUFFIX,uniswap.org,风控安全',
    'DOMAIN-SUFFIX,safepal.com,风控安全',
    'DOMAIN-SUFFIX,isafepal.com,风控安全',
    'DOMAIN-SUFFIX,trezor.io,风控安全',
    'DOMAIN-SUFFIX,ledger.com,风控安全',
    'DOMAIN-SUFFIX,hyperliquid.xyz,风控安全',
    'DOMAIN-SUFFIX,polymarket.com,风控安全',
    'DOMAIN-SUFFIX,dydx.exchange,风控安全',
    'DOMAIN-SUFFIX,coindesk.com,风控安全',
    'DOMAIN-SUFFIX,coinglass.com,风控安全',
    'DOMAIN-SUFFIX,coinmap.org,风控安全',
    'DOMAIN-SUFFIX,bitfinex.com,风控安全',
    'DOMAIN-SUFFIX,bitstamp.net,风控安全',
    'DOMAIN-SUFFIX,deribit.com,风控安全',
    'DOMAIN-SUFFIX,bitflyer.com,风控安全',
    'DOMAIN-SUFFIX,onekey.so,风控安全',
    'DOMAIN-SUFFIX,onekeycn.com,风控安全',
    'DOMAIN-SUFFIX,redotpay.com,风控安全',
    // 风控安全（补充）：纯登录/验证子域名，不劫持业务根域名
    'DOMAIN-SUFFIX,login.live.com,风控安全',
    'DOMAIN-SUFFIX,login.microsoftonline.com,风控安全',
    'DOMAIN-SUFFIX,account.live.com,风控安全',
    'DOMAIN-SUFFIX,account.microsoft.com,风控安全',
    'DOMAIN-SUFFIX,signup.live.com,风控安全',
    'DOMAIN-SUFFIX,appleid.apple.com,风控安全',
    'DOMAIN-SUFFIX,appleaccount.apple.com,风控安全',
    'DOMAIN-SUFFIX,idmsa.apple.com,风控安全',
    'DOMAIN-SUFFIX,idms-apple.com,风控安全',
    'DOMAIN-SUFFIX,iforgot.apple.com,风控安全',
    'DOMAIN-SUFFIX,signin.aws.amazon.com,风控安全',
    'DOMAIN-SUFFIX,dash.cloudflare.com,风控安全',
    'DOMAIN-SUFFIX,challenges.cloudflare.com,风控安全',
    'DOMAIN-SUFFIX,turnstile.cloudflare.com,风控安全',
    'DOMAIN-SUFFIX,assets.cloudflare.com,风控安全',
    'DOMAIN-SUFFIX,discordstatus.com,风控安全',
    'DOMAIN-SUFFIX,githubstatus.com,风控安全',
    'DOMAIN-SUFFIX,meta.com,风控安全',
  ];
  // 跟踪分析规则：覆盖 Tracker、遥测、统计与分析域名。
  // 维护约定：
  // - 这里偏向“可观测 / 可放行”的分析类流量，而不是已经明确要强拦截的广告域名；
  // - 若某域名已在广告拦截中被 REJECT / REJECT-DROP，通常不应再在这里重复声明。
  // - DOMAIN-KEYWORD 尽量使用 tracker / telemetry / metrics 这类高语义词，避免 tg 等过短词造成误伤。
  const RULES_TRACKER = [

    'GEOSITE,tracker,跟踪分析',
    'DOMAIN-KEYWORD,tracker,跟踪分析',
    'DOMAIN-KEYWORD,analytics,跟踪分析',
    'DOMAIN-KEYWORD,telemetry,跟踪分析',

    'DOMAIN-KEYWORD,metrics,跟踪分析',
    'DOMAIN-KEYWORD,logging,跟踪分析',
    'DOMAIN-KEYWORD,heatmap,跟踪分析',
    'DOMAIN-KEYWORD,segment,跟踪分析',
    'DOMAIN-KEYWORD,amplitude,跟踪分析',
    'DOMAIN-KEYWORD,mixpanel,跟踪分析',
    'DOMAIN-KEYWORD,sentry,跟踪分析',
    'DOMAIN-KEYWORD,datadog,跟踪分析',
    'DOMAIN-KEYWORD,newrelic,跟踪分析',
    'DOMAIN-SUFFIX,google-analytics.com,跟踪分析',
    'DOMAIN-SUFFIX,googletagmanager.com,跟踪分析',
    'DOMAIN-SUFFIX,googletagservices.com,跟踪分析',
    'DOMAIN-SUFFIX,doubleclick.net,跟踪分析',
  ];
  // 风控与系统规则：覆盖 FCM、Play Store、Google AI、下载与高敏感登录链路。
  // 维护约定：
  // - 这里主要放系统级 / 登录级 / 分发级链路；
  // - YouTube / Google 视频主业务流量优先交给 RULES_YOUTUBE 处理，这里只保留补洞性质的相关条目。
  const RULES_RISK_CONTROL_FCM = [
    'DOMAIN-SUFFIX,fcm.googleapis.com,FCM',
    'DOMAIN-SUFFIX,fcm-xmpp.googleapis.com,FCM',
    'DOMAIN-SUFFIX,mtalk.google.com,FCM',
    'DOMAIN-SUFFIX,mtalk4.google.com,FCM',
    'DOMAIN-SUFFIX,mtalk-staging.google.com,FCM',
    'DOMAIN-SUFFIX,fcmtoken.googleapis.com,FCM',
    'DST-PORT,5228,FCM',
    'DST-PORT,5229,FCM',
    'DST-PORT,5230,FCM',
  ];
  const RULES_RISK_CONTROL_PLAY_STORE = [
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
    'DOMAIN-SUFFIX,android.googleapis.com,风控安全',
    'DOMAIN-KEYWORD,googleplay,谷歌商店',
  ];
  const RULES_RISK_CONTROL_YOUTUBE_EXTRA = [
    // 主规则已由 RULES_YOUTUBE 覆盖；这里仅保留主规则未覆盖的补充域名。
    'DOMAIN-SUFFIX,youtube-nocookie.com,YouTube',
    'DOMAIN-SUFFIX,yt.be,YouTube',
    'DOMAIN-SUFFIX,yt3.ggpht.com,YouTube',
    'DOMAIN-SUFFIX,youtubekids.com,YouTube',
    'DOMAIN-SUFFIX,sponsor.ajay.app,YouTube',
    'DOMAIN-SUFFIX,returnyoutubedislikeapi.com,YouTube',
  ];
  const RULES_RISK_CONTROL_GOOGLE_AI = [
    'DOMAIN-SUFFIX,gemini.google.com,AI',
    'DOMAIN-SUFFIX,generativeai.google,AI',
    'DOMAIN-SUFFIX,generativelanguage.googleapis.com,AI',
    'DOMAIN-SUFFIX,proactivebackend-pa.googleapis.com,AI',
    'DOMAIN-SUFFIX,notebooklm.google.com,AI',
  ];
  const RULES_RISK_CONTROL_DOWNLOAD = [
    'DOMAIN-SUFFIX,dl.google.com,下载专用组',
    'DOMAIN-SUFFIX,dl.googleusercontent.com,下载专用组',
    'DOMAIN-SUFFIX,redirector.gvt1.com,下载专用组',
    'DOMAIN-SUFFIX,update.googleapis.com,下载专用组',
    'DOMAIN-SUFFIX,connectivitycheck.gstatic.com,下载专用组',
  ];
  const RULES_RISK_CONTROL = [
    ...RULES_RISK_CONTROL_FCM,
    ...RULES_RISK_CONTROL_PLAY_STORE,
    ...RULES_RISK_CONTROL_YOUTUBE_EXTRA,
    ...RULES_RISK_CONTROL_GOOGLE_AI,
    ...RULES_RISK_CONTROL_DOWNLOAD,
  ];
  // AI / TikTok / 风控 / 流媒体补充规则：收纳核心规则外的专项补丁。
  // 维护约定：
  // - 这里只放主规则没有覆盖、但确实需要单独补洞的条目；
  // - 若某域名 / 进程已经进入对应主规则块，优先在主规则块维护，不要长期双写。
  const RULES_AI_EXTRA = [
    'PROCESS-NAME,ai.x.grok,AI',
    'PROCESS-NAME,ai.cici.android,AI',
    'PROCESS-NAME,com.ciciai.app,AI',
    'PROCESS-NAME,com.coze.android,AI',
    'PROCESS-NAME,ai.coze.app,AI',
    'PROCESS-NAME,com.openai.chatgpt,AI',
    'PROCESS-NAME,com.openai.chat,AI',
    'PROCESS-NAME-REGEX,(?i).*(ciciai|cici|coze).*,AI',
    'PROCESS-NAME-REGEX,(?i).*(openai|chatgpt).*,AI',
    'DOMAIN-SUFFIX,api.openai.com,AI',
    'DOMAIN-SUFFIX,auth0.openai.com,AI',
    'DOMAIN-SUFFIX,cdn.openai.com,AI',
    'DOMAIN-SUFFIX,chat.openai.com,AI',
    'DOMAIN-SUFFIX,chatgpt.com,AI',
    'DOMAIN-SUFFIX,files.oaiusercontent.com,AI',
    'DOMAIN-SUFFIX,livekit.cloud,AI',
    'DOMAIN-SUFFIX,openai.com,AI',
    'DOMAIN-SUFFIX,anthropic.com,AI',
    'DOMAIN-SUFFIX,statsigapi.net,AI',
  ];
  const RULES_TIKTOK_EXTRA = [
    'DOMAIN,frontier.tiktokv.com,TikTok',
    'DOMAIN,p16-tiktokcdn-com.akamaized.net,TikTok',
    'DOMAIN,rezvorck.github.io,TikTok',
    'DOMAIN,update.9mod.com,TikTok',
    'DOMAIN,vcs.zijieapi.com,TikTok',
    'DOMAIN-KEYWORD,mssdk,TikTok',
    'DOMAIN-KEYWORD,tiktokcdn,TikTok',
    'DOMAIN-KEYWORD,webcast-frontier,TikTok',
    'DOMAIN-SUFFIX,bytegecko-i18n.com,TikTok',
    'DOMAIN-SUFFIX,byteintlapi.com,TikTok',
    'DOMAIN-SUFFIX,ipstatp.com,TikTok',
    'DOMAIN-SUFFIX,isnssdk.com,TikTok',
    'DOMAIN-SUFFIX,sgpstatp.com,TikTok',
    'DOMAIN-SUFFIX,snssdk.com,TikTok',
    'DOMAIN-SUFFIX,tik-tokapi.com,TikTok',
    'DOMAIN-SUFFIX,tiktok-row.org,TikTok',
    'DOMAIN-SUFFIX,tiktokd.net,TikTok',
    'DOMAIN-SUFFIX,tiktokmusic.app,TikTok',
    'DOMAIN-SUFFIX,ttwebview.com,TikTok',
    'DOMAIN-SUFFIX,ttwstatic.com,TikTok',
  ];
  const RULES_FINANCE_EXTRA = [
    'PROCESS-NAME,money.boku.android,风控安全',
    'PROCESS-NAME,com.ifast.gb,风控安全',
    'PROCESS-NAME-REGEX,(?i)^io\.metamask(?::.*)?$,风控安全',
    'PROCESS-NAME,com.okinc.okex.gp,风控安全',
    'PROCESS-NAME-REGEX,(?i)^com\.okinc\.okex\.gp(?::.*)?$,风控安全',
    'PROCESS-NAME,team.noones.mobilemessenger,风控安全',
    'DOMAIN,communication-app.ifastgb.com,风控安全',
    'DOMAIN,fpjs.checkout.com,风控安全',
    'DOMAIN,fpjscache.checkout.com,风控安全',
    'DOMAIN,auth.noones.com,风控安全',

    'DOMAIN,api.noones.com,风控安全',
    'DOMAIN,static.noones.com,风控安全',
    'DOMAIN,sentry.noones.com,风控安全',
    'DOMAIN,noonessupport.zendesk.com,风控安全',
    'DOMAIN,risk.checkout.com,风控安全',
    'DOMAIN,secure.fundsupermart.com,风控安全',
    'DOMAIN,sentry.ifastgb.com,风控安全',
    'DOMAIN,static.ifastgb.com,风控安全',
    'DOMAIN,stest.zimperium.com,风控安全',
    'DOMAIN,www.ifastgb.com,风控安全',
    'DOMAIN,www.noones.com,风控安全',
    'DOMAIN-SUFFIX,fundsupermart.com,风控安全',
    'DOMAIN-SUFFIX,ifastgb.com,风控安全',
    'DOMAIN-SUFFIX,neverless.com,风控安全',
    'DOMAIN-SUFFIX,noones.com,风控安全',
    'DOMAIN-SUFFIX,okex.com,风控安全',
    'DOMAIN-SUFFIX,ouyich.biz,风控安全',
    'DOMAIN-SUFFIX,ouyich.show,风控安全',
    'DOMAIN-SUFFIX,cnouyi.pizza,风控安全',
  ];
  const RULES_STREAMING_EXTRA = [
    'PROCESS-NAME,com.oumi.utility.media.hub,流媒体',
    'DOMAIN,api.7littlemen.com,流媒体',
    'DOMAIN,bps8m.onyra.cc,流媒体',
    'DOMAIN,image.tmdb.org,流媒体',

    'DOMAIN,stream.onyra.uk,流媒体',
    'DOMAIN,vh.api.okaapps.com,流媒体',
    'DOMAIN,vh.image.okaapps.com,流媒体',
    'DOMAIN,vh.image1.okaapps.com,流媒体',
    'DOMAIN-SUFFIX,okaapps.com,流媒体',

    'DOMAIN-SUFFIX,onyra.cc,流媒体',
    'DOMAIN-SUFFIX,onyra.uk,流媒体',
    'DOMAIN-SUFFIX,premiumize.me,流媒体',
    'IP-CIDR,121.43.145.95/32,流媒体,no-resolve',
  ];
  const RULES_AI_TIKTOK_EXTRA = [
    ...RULES_AI_EXTRA,
    ...RULES_TIKTOK_EXTRA,
    ...RULES_FINANCE_EXTRA,
    ...RULES_STREAMING_EXTRA,
  ];

  // 国内服务规则：承接中国大陆常用站点与国产 AI / 内容 / 电商服务。
  const RULES_DOMESTIC = [

    // ===== 国内服务 =====
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
  ];
  // Apple 生态规则：覆盖 Apple 主站、iCloud、App Store 与时间同步服务。
  const RULES_APPLE = [

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
    'DOMAIN,time.apple.com,Apple'
  ];
  // 全球 AI 规则：覆盖 OpenAI、Anthropic、Perplexity、xAI、Poe 等服务。
  const RULES_AI_GLOBAL = [

    'DOMAIN-SUFFIX,oaistatic.com,AI',
    'DOMAIN-SUFFIX,oaiusercontent.com,AI',
    'DOMAIN-SUFFIX,openaiusercontent.com,AI',
    'DOMAIN-SUFFIX,chatgpt.livekit.cloud,AI',
    'DOMAIN-SUFFIX,openaiapi-site.azureedge.net,AI',
    'DOMAIN-SUFFIX,identrust.com,AI',
    'DOMAIN-SUFFIX,ai.com,AI',
    'DOMAIN-SUFFIX,claude.ai,AI',
    'DOMAIN-SUFFIX,claudeusercontent.com,AI',
    'DOMAIN-SUFFIX,anthropiccdn.com,AI',
    'DOMAIN-SUFFIX,perplexity.ai,AI',
    'DOMAIN-SUFFIX,perplexity.com,AI',
    'DOMAIN-SUFFIX,pplx.ai,AI',
    'DOMAIN-SUFFIX,groq.com,AI',
    'DOMAIN-SUFFIX,grok.com,AI',
    'DOMAIN-SUFFIX,x.ai,AI',
    'DOMAIN-SUFFIX,api.x.ai,AI',
    'DOMAIN-SUFFIX,braze.com,AI',
    'DOMAIN-SUFFIX,mistral.ai,AI',
    'DOMAIN-SUFFIX,lechat.ai,AI',
    'DOMAIN-SUFFIX,poe.com,AI',
    'DOMAIN-SUFFIX,poecdn.net,AI',
    'DOMAIN-SUFFIX,stability.ai,AI',
    'DOMAIN-SUFFIX,character.ai,AI',
    'DOMAIN-SUFFIX,c.ai,AI',
    'DOMAIN-SUFFIX,midjourney.com,AI'
  ];
  // 去中心化与 Cloudflare 规则：处理钱包、Branch 链路与 Cloudflare 平台流量。
  const RULES_DECENTRALIZED_AND_CLOUDFLARE = [

    'PROCESS-NAME,io.metamask,去中心化平台',
    'PROCESS-NAME,io.metamask:bridge,去中心化平台',
    'PROCESS-NAME,io.metamask:fileprovider,去中心化平台',
    'DOMAIN-SUFFIX,metamask.io,去中心化平台',
    'DOMAIN,api2.branch.io,去中心化平台',
    'DOMAIN,cdn.branch.io,去中心化平台',
    'DOMAIN-SUFFIX,cloudflare.com,Cloudflare',
    'DOMAIN-SUFFIX,cloudflare-dns.com,Cloudflare',
    'DOMAIN-SUFFIX,cloudflareclient.com,Cloudflare',
    'DOMAIN-SUFFIX,workers.dev,Cloudflare',
    'DOMAIN-SUFFIX,pages.dev,Cloudflare',
    'DOMAIN-SUFFIX,trycloudflare.com,Cloudflare',
    'DOMAIN-SUFFIX,cdnjs.cloudflare.com,Cloudflare',
    'DOMAIN,1.1.1.1,Cloudflare'
  ];
  // 下载规则：承接系统更新、开发工具与大文件下载相关域名。
  const RULES_DOWNLOAD = [

    'DOMAIN-SUFFIX,download.windowsupdate.com,下载专用组',
    'DOMAIN-SUFFIX,windowsupdate.com,下载专用组',
    'DOMAIN-SUFFIX,update.microsoft.com,下载专用组',
    'DOMAIN-SUFFIX,delivery.mp.microsoft.com,下载专用组',
    'DOMAIN-SUFFIX,download.jetbrains.com,下载专用组',
    'DOMAIN-SUFFIX,download.docker.com,下载专用组',
    'DOMAIN-SUFFIX,packages.microsoft.com,下载专用组',
    'DOMAIN-SUFFIX,download.visualstudio.microsoft.com,下载专用组',
    'DOMAIN-SUFFIX,speed.hetzner.de,下载专用组'
  ];
  // 国外游戏规则：覆盖 Steam、Epic、Riot、暴雪、任天堂、PS/Xbox 等平台。
  const RULES_GLOBAL_GAMING = [

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
    'DOMAIN-SUFFIX,battle.net,国外游戏',
    'DOMAIN-SUFFIX,blizzard.com,国外游戏',
    'DOMAIN-SUFFIX,blzddist1-a.akamaihd.net,国外游戏',
    'DOMAIN-SUFFIX,ea.com,国外游戏',
    'DOMAIN-SUFFIX,origin.com,国外游戏',
    'DOMAIN-SUFFIX,origin-a.akamaihd.net,国外游戏',
    'DOMAIN-SUFFIX,uplay.com,国外游戏',
    'DOMAIN-SUFFIX,ubisoft.com,国外游戏',
    'DOMAIN-SUFFIX,cdn.ubisoft.com,国外游戏',
    'DOMAIN-SUFFIX,rockstargames.com,国外游戏',
    'DOMAIN-SUFFIX,gog.com,国外游戏',
    'DOMAIN-SUFFIX,roblox.com,国外游戏',
    'DOMAIN-SUFFIX,rbxcdn.com,国外游戏',
    'DOMAIN-SUFFIX,minecraft.net,国外游戏',
    'DOMAIN-SUFFIX,mojang.com,国外游戏',
    'DOMAIN-SUFFIX,launcher.mojang.com,国外游戏',
    'DOMAIN-SUFFIX,piston-meta.mojang.com,国外游戏',
    'DOMAIN-SUFFIX,nintendo.com,国外游戏',
    'DOMAIN-SUFFIX,nintendo.net,国外游戏',
    'DOMAIN-SUFFIX,nintendo.co.jp,国外游戏',
    'DOMAIN-SUFFIX,cdn.nintendo.net,国外游戏',
    'DOMAIN-SUFFIX,sonyentertainmentnetwork.com,国外游戏',
    'DOMAIN-SUFFIX,playstation.com,国外游戏',
    'DOMAIN-SUFFIX,playstation.net,国外游戏',
    'DOMAIN-SUFFIX,psnprofiles.com,国外游戏',
    'DOMAIN-SUFFIX,xboxservices.com,国外游戏',
    'DOMAIN-SUFFIX,supercell.com,国外游戏',
    'DOMAIN-SUFFIX,supercell.net,国外游戏'
  ];
  // GitHub 规则：覆盖站点、资源分发、发布资产与开发环境域名。
  const RULES_GITHUB = [

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
    'DOMAIN-SUFFIX,github.dev,GitHub'
  ];
  // 微软规则：覆盖 Microsoft 账号、Office、Outlook、Bing、Teams 与 Xbox 生态。
  const RULES_MICROSOFT = [

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
    'DOMAIN-SUFFIX,xboxlive.com,微软服务'
  ];
  // 流媒体规则：覆盖 Netflix、Disney+、Prime Video、HBO Max、Hulu 等平台。
  const RULES_STREAMING = [

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
    'DOMAIN-SUFFIX,crunchyrollsvc.com,流媒体'
  ];
  // 台湾媒体规则：覆盖台湾地区视频、新闻、社区与数字内容服务。
  const RULES_TAIWAN_MEDIA = [

    'DOMAIN-SUFFIX,hamivideo.hinet.net,台湾媒体',
    'DOMAIN-SUFFIX,hami.video,台湾媒体',
    'DOMAIN-SUFFIX,litv.tv,台湾媒体',
    'DOMAIN-SUFFIX,4gtv.tv,台湾媒体',
    'DOMAIN-SUFFIX,myvideo.net.tw,台湾媒体',
    'DOMAIN-SUFFIX,ofiii.com,台湾媒体',
    'DOMAIN-SUFFIX,catchplay.com,台湾媒体',
    'DOMAIN-SUFFIX,catchplay.com.tw,台湾媒体',
    'DOMAIN-SUFFIX,garageplay.tw,台湾媒体',
    'DOMAIN-SUFFIX,friday.tw,台湾媒体',
    'DOMAIN-SUFFIX,video.friday.tw,台湾媒体',
    'DOMAIN-SUFFIX,kktv.com.tw,台湾媒体',
    'DOMAIN-SUFFIX,linetv.tw,台湾媒体',
    'DOMAIN-SUFFIX,bahamut.com.tw,台湾媒体',
    'DOMAIN-SUFFIX,gamer.com.tw,台湾媒体',
    'DOMAIN-SUFFIX,ani.gamer.com.tw,台湾媒体',
    'DOMAIN-SUFFIX,ptsplus.tv,台湾媒体',
    'DOMAIN-SUFFIX,pts.org.tw,台湾媒体',
    'DOMAIN-SUFFIX,cts.com.tw,台湾媒体',
    'DOMAIN-SUFFIX,ftvnews.com.tw,台湾媒体',
    'DOMAIN-SUFFIX,news.tvbs.com.tw,台湾媒体',
    'DOMAIN-SUFFIX,tvbs.com.tw,台湾媒体',
    'DOMAIN-SUFFIX,setn.com,台湾媒体',
    'DOMAIN-SUFFIX,ettoday.net,台湾媒体',
    'DOMAIN-SUFFIX,mirrormedia.mg,台湾媒体',
    'DOMAIN-SUFFIX,bcc.com.tw,台湾媒体',
    'DOMAIN-SUFFIX,dcard.tw,台湾媒体',
    'DOMAIN-SUFFIX,dcard.video,台湾媒体',
    'DOMAIN-SUFFIX,udn.com,台湾媒体',
    'DOMAIN-SUFFIX,udngroup.com,台湾媒体',
    'DOMAIN-SUFFIX,ltn.com.tw,台湾媒体',
    'DOMAIN-SUFFIX,thenewslens.com,台湾媒体',
    'DOMAIN-SUFFIX,businessweekly.com.tw,台湾媒体',
    'DOMAIN-SUFFIX,cmmedia.com.tw,台湾媒体',
    'DOMAIN-SUFFIX,storm.mg,台湾媒体',
    'DOMAIN-SUFFIX,nownews.com,台湾媒体',
    'DOMAIN-SUFFIX,cna.com.tw,台湾媒体',
    'DOMAIN-SUFFIX,books.com.tw,台湾媒体',
    'DOMAIN-SUFFIX,readmoo.com,台湾媒体',
    'DOMAIN-SUFFIX,mojim.com,台湾媒体',
    'DOMAIN-SUFFIX,kkbox.com,台湾媒体'
  ];
  // Twitch 规则：覆盖客户端进程与直播分发相关域名。
  const RULES_TWITCH = [

    'PROCESS-NAME,tv.twitch.android.app,Twitch',
    'PROCESS-NAME,tv.twitch.android.viewer,Twitch',
    'DOMAIN-SUFFIX,twitch.tv,Twitch',
    'DOMAIN-SUFFIX,twitchcdn.net,Twitch',
    'DOMAIN-SUFFIX,ttvnw.net,Twitch',
    'DOMAIN-SUFFIX,jtvnw.net,Twitch',
    'DOMAIN-SUFFIX,live-video.net,Twitch'
  ];
  // Meta 规则：覆盖 Facebook、Instagram、Messenger、Threads、WhatsApp。
  const RULES_META = [

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
    'DOMAIN-SUFFIX,whatsapp.net,Meta'
  ];
  // Spotify 规则：覆盖主站、CDN 与短链域名。
  const RULES_SPOTIFY = [

    'DOMAIN-SUFFIX,spotify.com,Spotify',
    'DOMAIN-SUFFIX,spotifycdn.com,Spotify',
    'DOMAIN-SUFFIX,scdn.co,Spotify',
    'DOMAIN-SUFFIX,spoti.fi,Spotify'
  ];
  // Telegram 规则：覆盖多客户端进程、核心域名与官方 IP 段。
  const RULES_TELEGRAM = [

    'PROCESS-NAME,org.telegram.messenger,Telegram',
    'PROCESS-NAME,org.telegram.messenger.web,Telegram',
    'PROCESS-NAME,com.exteragram.messenger,Telegram',
    'PROCESS-NAME,nekox.messenger,Telegram',
    'PROCESS-NAME,tw.nekomimi.nekogram,Telegram',
    'PROCESS-NAME,xyz.nextalone.nagram,Telegram',
    'PROCESS-NAME,org.telegram.plus,Telegram',
    'PROCESS-NAME,ellipi.messenger,Telegram',
    'DOMAIN-SUFFIX,telegra.ph,Telegram',
    'DOMAIN-SUFFIX,telegram.org,Telegram',
    'DOMAIN-SUFFIX,t.me,Telegram',
    'DOMAIN-SUFFIX,telesco.pe,Telegram',
    'DOMAIN-SUFFIX,telegram.me,Telegram',
    'DOMAIN-SUFFIX,telegram.dog,Telegram',
    'DOMAIN-SUFFIX,telegram-cdn.org,Telegram',
    'DOMAIN-SUFFIX,telegram.space,Telegram',
    'DOMAIN-SUFFIX,tg.dev,Telegram',
    'DOMAIN-SUFFIX,tdesktop.com,Telegram',
    'DOMAIN-SUFFIX,usercontent.dev,Telegram',
    'DOMAIN-SUFFIX,graph.org,Telegram',
    // telegram 关键词保留；tg 过短，极易误伤普通域名，不再使用。
    'DOMAIN-KEYWORD,telegram,Telegram',
    'IP-CIDR,91.108.4.0/22,Telegram,no-resolve',

    'IP-CIDR,91.108.8.0/21,Telegram,no-resolve',
    'IP-CIDR,91.108.12.0/22,Telegram,no-resolve',
    'IP-CIDR,91.108.16.0/22,Telegram,no-resolve',
    'IP-CIDR,91.108.20.0/22,Telegram,no-resolve',
    'IP-CIDR,91.108.56.0/22,Telegram,no-resolve',
    'IP-CIDR,91.105.192.0/23,Telegram,no-resolve',
    'IP-CIDR,91.108.128.0/17,Telegram,no-resolve',
    'IP-CIDR,149.154.160.0/20,Telegram,no-resolve',
    'IP-CIDR,149.154.192.0/18,Telegram,no-resolve',
    'IP-CIDR,46.17.44.0/22,Telegram,no-resolve',
    'IP-CIDR,46.17.47.0/24,Telegram,no-resolve',
    'IP-CIDR6,2001:b28:f23d::/48,Telegram,no-resolve',
    'IP-CIDR6,2001:b28:f23f::/48,Telegram,no-resolve',
    'IP-CIDR6,2001:67c:4e8::/48,Telegram,no-resolve'
  ];
  // Google 通用规则：覆盖搜索、Gmail、Drive、Maps、Workspace 与基础资源域名。
  // 维护约定：翻译与 YouTube 已有独立规则块，这里尽量不重复放专项主规则。
  const RULES_GOOGLE = [

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
    'DOMAIN-SUFFIX,earth.google.com,Google'
  ];
  // Twitter / X 规则：覆盖主站、静态资源与直播相关域名。
  const RULES_TWITTER = [

    'DOMAIN-SUFFIX,x.com,Twitter',
    'DOMAIN-SUFFIX,twitter.com,Twitter',
    'DOMAIN-SUFFIX,twimg.com,Twitter',
    'DOMAIN-SUFFIX,t.co,Twitter',
    'DOMAIN-SUFFIX,pscp.tv,Twitter',
    'DOMAIN-SUFFIX,periscope.tv,Twitter'
  ];
  // 社交信息流规则：覆盖 Reddit、Discord 及相关静态 / 邀请 / 资源域名。
  const RULES_SOCIAL_FEED = [

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
    'DOMAIN-SUFFIX,flr.app,社交信息流'
  ];
  // 去中心化补充规则：覆盖 Bluesky、Mastodon、Misskey、Lemmy、Nostr 等联邦生态。
  const RULES_DECENTRALIZED_SUPPLEMENT = [

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
    'DOMAIN-SUFFIX,nostr.com,去中心化平台'
  ];
  // TikTok 规则：覆盖主站、CDN、资源域名及关键关键词。
  const RULES_TIKTOK = [

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
    'DOMAIN-KEYWORD,musical,TikTok'
  ];
  // 日韩生态规则：覆盖 LINE、Naver、Pixiv、Abema、Kakao、Nexon 等服务。
  const RULES_JP_KR_ECOSYSTEM = [

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
    'DOMAIN-SUFFIX,nexon.co.jp,日韩生态区'
  ];
  // Niconico 规则：覆盖 Nico 系视频与资源域名。
  const RULES_NICONICO = [

    'DOMAIN-SUFFIX,nicovideo.jp,Niconico',
    'DOMAIN-SUFFIX,nimg.jp,Niconico',
    'DOMAIN-SUFFIX,nicofarre.com,Niconico',
    'DOMAIN-SUFFIX,smilevideo.jp,Niconico',
    'DOMAIN-SUFFIX,dmc.nico,Niconico'
  ];
  // 社交补充规则：补齐 Facebook 连接与图谱接口等遗漏链路。
  const RULES_SOCIAL_FEED_SUPPLEMENT = [

    'DOMAIN,connect.facebook.net,社交信息流',
    'DOMAIN,graph.facebook.com,社交信息流'
  ];
  /**
   * 最终兜底出口说明：
   * - GEOIP,CN -> 全球直连
   * - GEOIP,!CN -> 自动选择
   * - MATCH -> 漏网之鱼
   *
   * 维护提示：
   * 1. 删除或重命名分组时，必须同步检查这里的规则引用；
   * 2. UI 中隐藏或调整分组顺序，不等于规则引用已经移除；
   * 3. 这里应始终只引用实际存在的分组名。
   */
  const RULES_DIRECT_AND_FALLBACK = [
 
    'GEOIP,CN,全球直连',
    'GEOIP,!CN,自动选择',
    'MATCH,漏网之鱼'
  ];

  // 组合规则：将规则内容定义与装配顺序分离，便于后续维护优先级。
  const RULE_SET_MAP = {
    YOUTUBE: RULES_YOUTUBE,
    APP_PROCESS: RULES_APP_PROCESS,
    TRANSLATION: RULES_TRANSLATION,
    ADBLOCK: RULES_ADBLOCK,
    TRACKER: RULES_TRACKER,
    RISK_CONTROL: RULES_RISK_CONTROL,
    AI_TIKTOK_EXTRA: RULES_AI_TIKTOK_EXTRA,
    DOMESTIC: RULES_DOMESTIC,
    APPLE: RULES_APPLE,
    AI_GLOBAL: RULES_AI_GLOBAL,
    DECENTRALIZED_AND_CLOUDFLARE: RULES_DECENTRALIZED_AND_CLOUDFLARE,
    DOWNLOAD: RULES_DOWNLOAD,
    GLOBAL_GAMING: RULES_GLOBAL_GAMING,
    GITHUB: RULES_GITHUB,
    MICROSOFT: RULES_MICROSOFT,
    STREAMING: RULES_STREAMING,
    TAIWAN_MEDIA: RULES_TAIWAN_MEDIA,
    TWITCH: RULES_TWITCH,
    META: RULES_META,
    SPOTIFY: RULES_SPOTIFY,
    TELEGRAM: RULES_TELEGRAM,
    GOOGLE: RULES_GOOGLE,
    TWITTER: RULES_TWITTER,
    SOCIAL_FEED: RULES_SOCIAL_FEED,
    DECENTRALIZED_SUPPLEMENT: RULES_DECENTRALIZED_SUPPLEMENT,
    TIKTOK: RULES_TIKTOK,
    JP_KR_ECOSYSTEM: RULES_JP_KR_ECOSYSTEM,
    NICONICO: RULES_NICONICO,
    SOCIAL_FEED_SUPPLEMENT: RULES_SOCIAL_FEED_SUPPLEMENT,
    DIRECT_AND_FALLBACK: RULES_DIRECT_AND_FALLBACK
  };
  const RULE_ASSEMBLY_ORDER = [
    // 主业务优先：视频、应用进程、翻译
    'YOUTUBE',
    'APP_PROCESS',
    'TRANSLATION',
    // 强动作与系统级规则
    'ADBLOCK',
    'TRACKER',
    'RISK_CONTROL',
    // 补丁型专项规则
    'AI_TIKTOK_EXTRA',

    'DOMESTIC',
    'APPLE',
    'AI_GLOBAL',
    'DECENTRALIZED_AND_CLOUDFLARE',
    'DOWNLOAD',
    'GLOBAL_GAMING',
    'GITHUB',
    'MICROSOFT',
    'STREAMING',
    'TAIWAN_MEDIA',
    'TWITCH',
    'META',
    'SPOTIFY',
    'TELEGRAM',
    'GOOGLE',
    'TWITTER',
    'SOCIAL_FEED',
    'DECENTRALIZED_SUPPLEMENT',
    'TIKTOK',
    'JP_KR_ECOSYSTEM',
    'NICONICO',
    'SOCIAL_FEED_SUPPLEMENT',
    'DIRECT_AND_FALLBACK'
  ];
  const RULE_SET_DEFS = RULE_ASSEMBLY_ORDER
    .map(name => ({ name, rules: RULE_SET_MAP[name] }));
  // 规则落盘：按优先级顺序合并所有规则，并做最终去重。
  perfStart('rules_assemble');
  const assembledRules = collectRuleSets(RULE_SET_DEFS, RULE_ASSEMBLY_ORDER);
  config.rules = mergeRuleSets(assembledRules);
  perfEnd('rules_assemble');
  if (!config.rules.length || !config.rules.some(rule => typeof rule === 'string' && /^MATCH\s*,/i.test(rule))) {
    throw new Error('rules health check failed: missing fallback MATCH rule');
  }


  // 规则健康检查：所有策略目标都必须可解析到真实存在的组名或内建动作。
  const missingRuleTargets = [];
  const seenMissingRuleTargets = new Set();
  for (let i = 0; i < config.rules.length; i++) {
    const rule = config.rules[i];
    const target = extractRulePolicyTarget(rule);
    if (!target || availableRuleTargets.has(target)) continue;
    if (seenMissingRuleTargets.has(target)) continue;
    seenMissingRuleTargets.add(target);
    missingRuleTargets.push(target);
  }
  if (missingRuleTargets.length) {
    throw new Error('rules health check failed: missing policy target(s): ' + missingRuleTargets.join(', '));
  }
  const ruleDiagnostics = buildRuleDiagnostics(RULE_SET_DEFS, config.rules);
  if (ruleDiagnostics.riskyShortKeywords.length && typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn('rules health check warning: risky short DOMAIN-KEYWORD rule(s): ' + ruleDiagnostics.riskyShortKeywords.join(', '));
  }

  // 同 match value 多 target 现在按“后定义覆盖前定义”处理，只记录诊断，不再阻断。

  emitRuleDiagnostics(ruleDiagnostics);


  perfFlush();

  return config;
}

function clonePlainConfig(value) {
  if (!value || typeof value !== 'object') return {};
  const config = Object.assign({}, value);
  config.proxies = Array.isArray(value.proxies)
    ? value.proxies.map(proxy => (proxy && typeof proxy === 'object' ? Object.assign({}, proxy) : proxy))
    : [];
  config['proxy-groups'] = Array.isArray(value['proxy-groups'])
    ? value['proxy-groups'].map(group => (group && typeof group === 'object' ? Object.assign({}, group) : group))
    : [];
  config.rules = Array.isArray(value.rules) ? value.rules.slice() : [];
  config.dns = value.dns && typeof value.dns === 'object' ? Object.assign({}, value.dns) : {};
  config.profile = value.profile && typeof value.profile === 'object' ? Object.assign({}, value.profile) : {};
  config.sniffer = value.sniffer && typeof value.sniffer === 'object' ? Object.assign({}, value.sniffer) : {};
  config.hosts = value.hosts && typeof value.hosts === 'object' ? Object.assign({}, value.hosts) : {};
  config.experimental = value.experimental && typeof value.experimental === 'object' ? Object.assign({}, value.experimental) : {};
  return config;
}

function normalizeInputConfig(input) {
  const config = input && typeof input === 'object' ? input : {};
  if (!Array.isArray(config.proxies)) config.proxies = [];
  if (!Array.isArray(config['proxy-groups'])) config['proxy-groups'] = [];
  if (!Array.isArray(config.rules)) config.rules = [];
  if (!config.dns || typeof config.dns !== 'object') config.dns = {};
  if (!config.profile || typeof config.profile !== 'object') config.profile = {};
  if (!config.sniffer || typeof config.sniffer !== 'object') config.sniffer = {};
  if (!config.hosts || typeof config.hosts !== 'object') config.hosts = {};
  if (!config.experimental || typeof config.experimental !== 'object') config.experimental = {};
  return config;
}

function validateOutputConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('output config is not an object');
  }
  if (!Array.isArray(config.proxies)) {
    throw new Error('output proxies is not an array');
  }
  if (!Array.isArray(config['proxy-groups'])) {
    throw new Error('output proxy-groups is not an array');
  }
  if (!Array.isArray(config.rules)) {
    throw new Error('output rules is not an array');
  }
  if (!config.dns || typeof config.dns !== 'object') {
    throw new Error('output dns is not an object');
  }
  if (!config.rules.some(rule => typeof rule === 'string' && rule.startsWith('MATCH,'))) {
    throw new Error('output rules missing MATCH fallback');
  }
  return config;
}

function main(config) {
  const originalConfig = config && typeof config === 'object' ? config : {};
  try {
    const workingConfig = normalizeInputConfig(clonePlainConfig(originalConfig));
    const result = buildConfig(workingConfig);
    return validateOutputConfig(normalizeInputConfig(result));
  } catch (error) {
    console.log('[Clash.js] fatal:', error && error.stack ? error.stack : error);
    return normalizeInputConfig(clonePlainConfig(originalConfig));
  }
}

