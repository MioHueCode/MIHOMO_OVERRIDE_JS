/**
 * Clash / Mihomo 工程化配置脚本
 *
 * 模块化 Clash/Mihomo 配置生成：DNS / 分组 / 规则三位一体
 *
 * 架构：基础设施 → 网络配置 → 节点处理 → 策略构建 → 规则装配 → 联动校验
 *
 * 【三位一体联动】DNS_SERVICE_BINDINGS 为单一数据源（policy/fallback 自动生成）
 *
 * 【维护指南】
 * • 新增规则    → 添加到对应的 RULES_* 常量数组
 * • 新增分组    → 使用 makeSelectGroup / makeUrlTestGroup 等工厂函数
 * • 新增 DNS 业务 → 写生成器 + 挂到 DNS_SERVICE_BINDINGS
 * • 新增规则块   → 优先用 ruleSuffix/ruleDomain/ruleProcess/ruleKeyword
 * • 修改节点识别 → 同步更新地区归类、故障转移和业务候选池
 * • 调整优先级  → 修改 BUSINESS_CHOICE_DEFS 或 CHOICE_POOL_DEFS
 * • 性能调优    → 启用 PERF_ENABLED 查看各阶段耗时
 *
 * 【特性说明】
 * 谷歌商店专用负载均衡（consistent-hashing，地区自动组节点池）
 *
 * @version 3.9.0
 * @date 2026-07-22
 * @license MIT
 */
function buildConfig(config) {
  if (!config || !Array.isArray(config.proxies)) return config;

  // 运行上下文：保留旧分组选项顺序
  const existingGroups = Array.isArray(config['proxy-groups']) ? config['proxy-groups'] : [];
  const existingGroupMap = Object.create(null);
  for (let i = 0; i < existingGroups.length; i++) {
    const group = existingGroups[i];
    if (group && group.name) existingGroupMap[group.name] = group;
  }
  // 运行时工具：性能分析、调试与安全执行
  const PERF_ENABLED = false;
  const RULE_DIAGNOSTICS_ENABLED = false;
  
  const perfMarks = Object.create(null);
  const perfNow = () => Date.now();
  
  const debugLog = (...args) => {
    if (typeof console !== 'undefined' && typeof console.log === 'function') {
      console.log(...args);
    }
  };
  
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

  // 通用工具函数
  
  // 图标资源：统一走 Qure 图标仓库
  const QURE_BASE = 'https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/';
  const qIcon = name => QURE_BASE + name + '.png';

  // 数组工具：统一处理外部输入
  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function uniqList(arr) {
    return Array.from(new Set(asArray(arr).filter(Boolean)));
  }
  
  // 通用去重别名（保持向后兼容）
  const unique = uniqList;

  // 规则工厂：统一 DOMAIN / DOMAIN-SUFFIX / PROCESS / KEYWORD 生成
  function stripDomainPrefix(domain) {
    return String(domain || '').replace(/^\+\./, '').replace(/^\*\./, '').trim();
  }
  function ruleSuffix(domains, target) {
    return asArray(domains).map(stripDomainPrefix).filter(Boolean).map(d => 'DOMAIN-SUFFIX,' + d + ',' + target);
  }
  function ruleDomain(domains, target) {
    return asArray(domains).map(stripDomainPrefix).filter(Boolean).map(d => 'DOMAIN,' + d + ',' + target);
  }
  function ruleProcess(names, target) {
    return asArray(names).filter(Boolean).map(n => 'PROCESS-NAME,' + n + ',' + target);
  }
  function ruleKeyword(words, target) {
    return asArray(words).filter(Boolean).map(w => 'DOMAIN-KEYWORD,' + w + ',' + target);
  }
  function ruleIpCidr(cidrs, target, noResolve = true) {
    return asArray(cidrs).filter(Boolean).map(cidr => {
      const type = String(cidr).includes(':') ? 'IP-CIDR6' : 'IP-CIDR';
      return noResolve
        ? type + ',' + cidr + ',' + target + ',no-resolve'
        : type + ',' + cidr + ',' + target;
    });
  }

  // 域名生成器：压缩重复模式
  const d = (...domains) => domains.map(x => x.startsWith('+.') || x.startsWith('*.') ? x : '+.' + x);

  const googleDomains = () => d('google.com','googleapis.com','googleapis.cn','services.googleapis.cn','gstatic.com','googleusercontent.com','gvt1.com','gvt2.com','gvt3.com','recaptcha.net','recaptcha-cn.net','youtube.com','ytimg.com','googlevideo.com','youtubei.googleapis.com','youtube.googleapis.com','translate.googleapis.com','translation.googleapis.com','translate-pa.googleapis.com','twitter.com','x.com','twimg.com','t.co');

  const playStoreDomains = () => [
    'play.google.com','market.android.com','play.googleapis.com','play-fe.googleapis.com','play-pa.googleapis.com','playatoms-pa.googleapis.com','play-apps-fe-pa.googleapis.com','play-apps-download-frontend.googleapis.com','android.googleapis.com','android.clients.google.com','android.clients.google.com.cn','play-lh.googleusercontent.com','play-games.googleusercontent.com','dl.google.com','dl.l.google.com',
    '+.gvt1.com','+.gvt2.com','+.gvt3.com','+.xn--ngstr-lra8j.com','+.xn--ngstr-cn-8za9o.com','+.services.googleapis.cn','+.googleapis.cn'
  ];

  const cryptoDomains = () => d('binance.com','coinbase.com','okx.com','bybit.com','kucoin.com','metamask.io','trustwallet.com','walletconnect.com','oklink.com','okx-dns.com','okx-dns1.com','okx-dns2.com','byapis.com','bycsi.com','bybit-global.com','bybitglobal.com','bnbstatic.com','binanceapi.com');

  const financeDomains = () => [...d('paypal.com','stripe.com','wise.com','revolut.com','card.io','paypalhere.com','venmo.com','xoom.com','stripe.network','stripe-terminal-local-reader.net','checkout.com','checkoutcdn.com','checkoutshopper.com','payoneer.com','airwallex.com','worldpay.com','skrill.com','neteller.com','authy.com'), 'hcaptcha.com', 'newassets.hcaptcha.com'];

  const streamingDomains = () => d('netflix.com','nflxvideo.net','disneyplus.com','primevideo.com','spotify.com','hulu.com','hbomax.com','twitch.tv','twtrdns.net');

  const gamingDomains = () => d('steamcommunity.com','steampowered.com','epicgames.com','roblox.com','battle.net','blizzard.com','blizzardentertainment.com','battlenet.com.cn','ea.com','origin.com','uplay.com','nintendo.com','playstation.com','xbox.com','xboxlive.com','supercell.com','supercell.net');

  const discordDomains = () => d('discord.com','discord.gg','discord.gift','discord.new','discordapp.com','discordapp.net','discordcdn.com','discord.media','discordsays.com','dis.gd');

  const tiktokDomains = () => d('tiktok.com','tiktokv.com','byteoversea.com','ibytedtos.com','tiktokcdn.com','tiktokcdn-us.com','tiktokcdn-eu.com','tiktokrow-cdn.com','tiktokv.us','ibyteimg.com','muscdn.com','musical.ly','bytefcdn-oversea.com');

  const aiDomains = () => d('openai.com','chatgpt.com','claude.ai','anthropic.com','perplexity.ai','poe.com','midjourney.com','character.ai','c.ai','groq.com','mistral.ai','x.ai','cohere.com','huggingface.co','replicate.com','cursor.sh');

  const metaDomains = () => d('facebook.com','fbcdn.net','instagram.com','whatsapp.com','whatsapp.net');
  const devCommunityDomains = () => [...d('github.com','githubusercontent.com','reddit.com'), '+.reddit.map.fastly.net'];
  const bigTechDomains = () => [...d('apple.com','icloud.com','microsoft.com','live.com','aws.amazon.com'), 'account.amazon.com', 'payments.amazon.com'];
  const privacyDomains = () => [...d('cloudflare-dns.com','one.one.one.one','quad9.net','dns9.quad9.net','nextdns.io','controld.com','mullvad.net','dns.sb'), 'connectivitycheck.android.com', 'connectivitycheck.gstatic.com', 'www.gstatic.com'];
  const googlePlayIntegrityDomains = () => ['www.googleapis.com','android.googleapis.com','firebaseinstallations.googleapis.com','firebase-settings.crashlytics.com','+.firebaseio.com','+.firebaseapp.com'];
  const translationDomains = () => d('translate.google.com','translate.google.cn','translate.googleapis.com','translation.googleapis.com','translate-pa.googleapis.com','deepl.com','deeplpro.com','deeplusercontent.com','linguee.com');
  const browserRiskDomains = () => [...d('addons.mozilla.org','addons.cdn.mozilla.net','online-metrix.net'), 'api.ipify.org','fpjs.checkout.com','fpjscache.checkout.com','risk.checkout.com','challenges.cloudflare.com','turnstile.cloudflare.com','assets.cloudflare.com','hcaptcha.com','newassets.hcaptcha.com','volatile-pa.googleapis.com','settings-win.data.microsoft.com'];
  const adguardServiceDomains = () => d('adtidy.org','adguard.com','adguard.org','adguard-dns.io');
  const openaiRealtimeDomains = () => d('auth0.openai.com','oaistatic.com','oaiusercontent.com','files.oaiusercontent.com','cdn.openai.com','livekit.cloud','statsigapi.net');
  const aiFinanceRiskDomains = () => [...aiDomains(), ...d('metamask.io','neverless.com','noones.com','okx.com','okx.ac','okx.cab','xlayer.tech','ifastgb.com','fundsupermart.com','giffgaff.com'), 'noonessupport.zendesk.com', 'stest.zimperium.com', 'cdn-eu.dynamicyield.com', 'privacyportal-uk.onetrust.com', 'mobile-data.onetrust.io'];
  const mainstreamOverseasDomains = () => [...streamingDomains(), ...d('discord.com','discordapp.com','reddit.com','telegram.org','t.me','github.com','githubusercontent.com','steamcommunity.com','steampowered.com','epicgames.com','roblox.com')];
  const youtubeMediaDomains = () => ['jnn-pa.googleapis.com','youtubeembeddedplayer.googleapis.com','video.google.com','+.googlevideo.com','+.ytimg.com','+.ggpht.com'];
  const baseOverseasDomains = () => d('google.com','youtube.com','twitter.com','x.com','telegram.org','t.me');
  const infraDomains = () => d('dns.google','dns.google.com','api2.branch.io','cdn.branch.io');
  const productivityDomains = () => d('cloudflare.com');
  const adguardDomains = () => d(
    'pglstatp-toutiao.com','pglstatp.com','pangolin-sdk-toutiao.com','pangolin.snssdk.com','sgsnssdk.com','unionadjs.com',
    'adkwai.com','e.kuaishou.com','adukwai.com','tanx.com','alimama.com','mmstat.com','gdt.qq.com','e.qq.com',
    'adsmind.gdtimg.com','pgdt.gtimg.cn','guanggao.qq.com','adnet.qq.com','iadmatvideo.nosdn.127.net','iadmusicmatvideo.nosdn.127.net',
    'mi.gdt.qq.com','ad.xiaomi.com','api.ad.xiaomi.com','data.mistat.xiaomi.com','tracking.miui.com','umeng.com','umengcloud.com','mob.com',
    'bdxiguaimg.com','adsame.com','bdplus.baidu.com','pos.baidu.com','union.baidu.com','cb.baidu.com','dup.baidustatic.com','cpro.baidu.com',
    'afd.baidu.com','als.baidu.com','nsclick.baidu.com','mobads.baidu.com','eclick.baidu.com','wanfeng1.baidu.com','wm.baidu.com','duclick.baidu.com',
    'adimg.uve.weibo.com','alitui.weibo.com','biz.weibo.com','game.weibo.cn','sax.sina.com.cn','adbox.sina.com.cn','adview.cn',
    'miaozhen.com','irs01.com','admaster.com.cn','adpush.cn','cnxad.com','adkmob.com','adobe-identity.omtrdc.net','omtrdc.net','2mdn.net',
    'admob.com','admob-sdk.doubleclick.net','app-measurement.com','googlesyndication.com','googleadservices.com','googleadsserving.cn',
    'adservice.google.com','adservice.google.com.hk','pagead2.googlesyndication.com','tpc.googlesyndication.com','googletagservices.com','doubleclick.net',
    'adsrvr.org','criteo.com','criteo.net','taboola.com','taboolasyndication.com','outbrain.com','analytics.google.com','ads.google.com'
  );

  // 基础配置：运行参数、网络栈、实验特性
  
  // Profile：持久化配置
  config.profile = {
    ...(config.profile || {}),
    'store-selected': true,
    'store-fake-ip': true
  };

  // 网络与端口配置
  config['mixed-port'] = config['mixed-port'] || 7890;
  config['allow-lan'] = false;
  config['mode'] = 'rule';
  config['log-level'] = config['log-level'] || 'error';
  config.ipv6 = true;
  
  // TCP 优化
  config['tcp-concurrent'] = true;
  config['keep-alive-interval'] = 15;
  config['keep-alive-idle'] = 600;
  config['disable-keep-alive'] = false;
  
  // 其他特性
  config['etag-support'] = true;
  config['unified-delay'] = true;
  config['find-process-mode'] = 'strict';
  config['global-client-fingerprint'] = config['global-client-fingerprint'] || 'chrome';
  
  // 实验特性：QUIC 兼容性优化
  config['experimental'] = Object.assign({}, config['experimental'] || {}, {
    'quic-go-disable-gso': true,
    'quic-go-disable-ecn': true,
    'dialer-ip4p-convert': false
  });

  // 嗅探模块：域名感知与流量识别
  
  if (!config.sniffer || typeof config.sniffer !== 'object') config.sniffer = {};
  config.sniffer['force-dns-mapping'] = true;

  config.sniffer['parse-pure-ip'] = true;
  config.sniffer['override-destination'] = true;
  config.sniffer['sniff'] = {
    'HTTP': { 'ports': [80, '8080-8880'], 'override-destination': true },
    'TLS': { 'ports': [443, 8443] },
    'QUIC': { 'ports': [443, 8443], 'override-destination': true }
  };
  config.sniffer['force-domain'] = uniqList([
    ...openaiRealtimeDomains(),
    ...tiktokDomains(),
    ...googleDomains(),
    ...playStoreDomains()
  ]);
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

  // Hosts 映射：关键服务域名兜底
  
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

  // DNS 配置：解析器、策略与路由
  
  // DNS 端点定义
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

  // 健康检查参数
  const TEST_URL = 'https://www.gstatic.com/generate_204';
  const TEST_INTERVAL = 360, TEST_TOLERANCE = 80, TEST_TIMEOUT = 2000, TEST_MAX_FAILED_TIMES = 3;
  const FALLBACK_INTERVAL = 300, FALLBACK_TOLERANCE = 80, FALLBACK_TIMEOUT = 2500, FALLBACK_MAX_FAILED_TIMES = 2;
  const REGION_TEST_INTERVAL = 480, REGION_TEST_TOLERANCE = 160, REGION_TEST_TIMEOUT = 3000, REGION_TEST_MAX_FAILED_TIMES = 4;
  const PLAY_STORE_TEST_URL = TEST_URL;
  const PLAY_STORE_SPECIAL_GROUP_NAMES = ['谷歌商店专用'];
  const HEALTH_CHECK_LAZY = true;
  // 内置直连选项
  const directChoices = ['🇨🇳 直连 | IPv4优先', '🇨🇳 直连 | IPv6优先', '🇨🇳 直连 | 双栈', '全球直连'];

  const DNS_POLICY_DOMAIN_SETS = {

    adguard: adguardDomains(),
    tiktok: tiktokDomains(),
    adguardService: adguardServiceDomains(),
    browserRisk: browserRiskDomains(),

    openaiRealtime: openaiRealtimeDomains(),
    google: googleDomains(),
    playStore: playStoreDomains(),

    aiFinanceRisk: aiFinanceRiskDomains(),
    mainstreamOverseas: mainstreamOverseasDomains(),
    youtubeMedia: youtubeMediaDomains(),
    translation: translationDomains()
  };
  const DNS_FALLBACK_FILTER_DOMAIN_SETS = {
    baseOverseas: baseOverseasDomains(),
    meta: metaDomains(),
    ai: aiDomains(),
    devCommunity: devCommunityDomains(),
    discord: discordDomains(),

    tiktok: tiktokDomains(),
    productivity: productivityDomains(),

    crypto: cryptoDomains(),
    finance: financeDomains(),

    streaming: streamingDomains(),
    gaming: gamingDomains(),
    bigTech: bigTechDomains(),
    infra: infraDomains(),
    playStore: playStoreDomains(),
    youtubeMedia: youtubeMediaDomains(),
    privacyAndCaptivePortal: privacyDomains(),
    googlePlayIntegrity: googlePlayIntegrityDomains(),
    translation: translationDomains()
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
    ],
    paymentAndRiskLocal: [
      'localhost', '*.localhost', '*.invalid', '*.test', '*.example',
      '*.home', '*.home.arpa', '*.local', '*.lan'
    ],
    pushAndCast: [
      'mtalk.google.com', 'alt*.mtalk.google.com', '*.push.apple.com',
      '*.push-apple.com.akadns.net', '*.ipp.local', '*.mesh.local', '*.matter.local'
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
      ...DNS_FAKE_IP_FILTER_SETS.cloudflareChallenge,

      // 支付 / 风控 / 本地域名：尽量保留真实解析，减少 App 内校验、回环服务与局域网发现异常。
      ...DNS_FAKE_IP_FILTER_SETS.paymentAndRiskLocal,

      // 推送 / 投屏 / Matter 等设备发现链路：fake-ip 容易破坏长连接或 mDNS/局域网发现。
      ...DNS_FAKE_IP_FILTER_SETS.pushAndCast
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
  // Google Play 下载链路应保留 fake-ip 以便 TUN/规则持续接管；主动清理上游遗留的真实解析例外。
  const playStoreFakeIpDomainSet = new Set(playStoreDomains().map(domain =>
    String(domain || '').replace(/^\+\./, '').replace(/^\*\./, '')
  ));
  config.dns['fake-ip-filter'] = asArray(config.dns['fake-ip-filter']).filter(item => {
    const normalized = String(item || '').trim().replace(/^\+\./, '').replace(/^\*\./, '');
    return !playStoreFakeIpDomainSet.has(normalized);
  });
  // DNS 分流策略：按私有网络 / 国内 / 境外 / 广告 / 特殊业务域名分别指定解析器。
  // nameserver-policy 维护提示：键必须保持 Mihomo 可识别的 geosite / 域名模式，值必须是一维 DNS 列表。
  // 若把值误改成对象或二维数组，常见后果是导入失败或策略静默失效。
  const nameserverPolicy = Object.assign({}, config.dns['nameserver-policy'] || {}, {
    // 私有网络与国内站点：优先走本地 DNS / 国内 DoH，减少绕路与污染概率。
    'geosite:private': localDns,
    'geosite:cn': cnDns,

    // 境外通用站点：统一交给可信境外 DoH，保证海外服务解析一致性。
    'geosite:geolocation-!cn': trustDns,

    // 广告与追踪域名：交给 AdGuard DNS，尽量在解析层先做拦截。
    'geosite:category-ads-all': adguardDns,

    // 国内 DoH 服务自身：强制回落本地 DNS，避免解析自循环。
    'dns.alidns.com': localDns,
  });
  function appendDnsPolicyDomains(target, domains, dnsList) {
    const list = asArray(domains);
    for (let i = 0; i < list.length; i++) {
      const domain = list[i];
      if (domain) target[domain] = dnsList;
    }
  }

  // DNS / 分组 / 规则联动注册表：每项声明业务目标、策略域名、解析器和 fallback 域名。
  // 新增或扩展业务时优先修改此表及对应域名集合，避免 nameserver-policy 与 fallback-filter 分散维护。
  const DNS_SERVICE_BINDINGS = [
    { key: '广告拦截', policyDomains: DNS_POLICY_DOMAIN_SETS.adguard, dns: adguardDns },
    { key: 'TikTok', policyDomains: DNS_POLICY_DOMAIN_SETS.tiktok, fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.tiktok, dns: trustDns },
    { key: 'AdGuard服务', policyDomains: DNS_POLICY_DOMAIN_SETS.adguardService, dns: trustDns, auxiliary: true },
    { key: '风控安全', policyDomains: DNS_POLICY_DOMAIN_SETS.browserRisk, fallbackDomains: uniqList([].concat(DNS_FALLBACK_FILTER_DOMAIN_SETS.finance, DNS_FALLBACK_FILTER_DOMAIN_SETS.crypto)), dns: trustDns },
    { key: 'AI', policyDomains: uniqList([].concat(DNS_POLICY_DOMAIN_SETS.openaiRealtime, DNS_POLICY_DOMAIN_SETS.aiFinanceRisk)), fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.ai, dns: trustDns },
    { key: 'Google', policyDomains: DNS_POLICY_DOMAIN_SETS.google, fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.baseOverseas, dns: trustDns },
    { key: '谷歌商店', policyDomains: DNS_POLICY_DOMAIN_SETS.playStore, fallbackDomains: uniqList([].concat(DNS_FALLBACK_FILTER_DOMAIN_SETS.playStore, DNS_FALLBACK_FILTER_DOMAIN_SETS.googlePlayIntegrity)), dns: trustDns },
    { key: '海外通用', policyDomains: DNS_POLICY_DOMAIN_SETS.mainstreamOverseas, fallbackDomains: uniqList([].concat(DNS_FALLBACK_FILTER_DOMAIN_SETS.meta, DNS_FALLBACK_FILTER_DOMAIN_SETS.devCommunity, DNS_FALLBACK_FILTER_DOMAIN_SETS.discord, DNS_FALLBACK_FILTER_DOMAIN_SETS.streaming, DNS_FALLBACK_FILTER_DOMAIN_SETS.gaming, DNS_FALLBACK_FILTER_DOMAIN_SETS.bigTech)), dns: trustDns, auxiliary: true },
    { key: 'YouTube', policyDomains: DNS_POLICY_DOMAIN_SETS.youtubeMedia, fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.youtubeMedia, dns: trustDns },
    { key: '翻译服务', policyDomains: DNS_POLICY_DOMAIN_SETS.translation, fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.translation, dns: trustDns },
    { key: '隐私与连通性', policyDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.privacyAndCaptivePortal, fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.privacyAndCaptivePortal, dns: trustDns, auxiliary: true }
  ];
  const dnsBindingFallbackDomains = [];
  for (let i = 0; i < DNS_SERVICE_BINDINGS.length; i++) {
    const binding = DNS_SERVICE_BINDINGS[i];
    appendDnsPolicyDomains(nameserverPolicy, binding.policyDomains, binding.dns);
    const fallbackDomains = asArray(binding.fallbackDomains);
    for (let j = 0; j < fallbackDomains.length; j++) dnsBindingFallbackDomains.push(fallbackDomains[j]);
  }
  config.dns['nameserver-policy'] = nameserverPolicy;
  // fallback 过滤器：决定哪些域名 / IP 结果需要优先参考 fallback DNS。
  config.dns['fallback-filter'] = {
    // GEOIP 过滤：国内 IP 结果优先视为可信，减少无意义 fallback。
    geoip: true,
    'geoip-code': 'CN',

    // 特殊保留地址段：这类结果通常不应作为正常公网解析结果使用。
    ipcidr: ['240.0.0.0/4'],

    // 域名白名单：由服务联动表聚合；额外保留仅用于基础设施校验的 fallback 域名。
    domain: uniqList([
      ...dnsBindingFallbackDomains,
      ...DNS_FALLBACK_FILTER_DOMAIN_SETS.productivity,
      ...DNS_FALLBACK_FILTER_DOMAIN_SETS.infra
    ])
  };

  // DNS fallback 与 direct-nameserver：保持保守的 strict 行为，不再全局联动模式开关。
  config.dns.fallback = trustDns;
  config.dns['direct-nameserver'] = [...cnDns, ...localDns];
  config.dns['direct-nameserver-follow-policy'] = true;

  // 节点处理
  // 过滤非真实代理的正则表达式
  // 说明：这里必须保守过滤。很多真实节点名会带有 airport / vpn / proxy / 流量倍率等字样，
  const PROXY_INFO_RE = /(?:https?:\/\/|www\.|导航网址|网址导航|距离下次重置|流量已用|流量余额|已用流量|总流量|流量(?:剩余|到期|重置)|套餐(?:到期|余额|剩余)?|订阅(?:链接|地址|信息)?|官方(?:网站|网址|公告|通知|频道|群组)?|公告|通知|使用说明|更新订阅|复制链接|浏览器打开|更新时间|请使用|客户端|售后|工单|教程|返利|邀请|购买|续费|维护|客服|永久官网|备用地址|节点状态|账户|邮箱|验证码|防失联|网址|域名|无法使用|禁止|过期|失效|广告|推广|赞助|加群|进群|群聊|交流群|频道订阅|关注频道)/i;
  const PROXY_INFO_LINE_RE = /(?:^|[\s|｜:：,，;；\-+_\[\]【】()（）])(?:剩余|到期|过期|已用|重置|官网|订阅|套餐|更新|通知|公告|客服|网址|邮箱|账户|广告|推广|赞助|频道订阅|关注频道|加群|进群|交流群|官方群)(?:[\s|｜:：,，;；\-+_\[\]【】()（）]|$)/i;
  const PROXY_TRAFFIC_RE = /(?:\d+(?:\.\d+)?\s*(?:GB|MB|TB|G|M|T)\s*[\/\|]\s*\d+(?:\.\d+)?\s*(?:GB|MB|TB|G|M|T)|(?:剩余|已用|总计|流量).{0,12}\d+(?:\.\d+)?\s*(?:GB|MB|TB|G|M|T))/i;
  const PROXY_DATE_RE = /(?:20\d{2}[-\/.年]\d{1,2}[-\/.月]\d{1,2}|\d{1,2}[-\/.月]\d{1,2}日?).{0,8}(?:到期|过期|重置|更新|expire|reset)/i;
  const PROXY_PROMO_HANDLE_RE = /(?:^|[\s|｜:：,，;；\-+_\[\]【】()（）])@?[a-z0-9_]{2,}(?:tg|telegram|channel|group)[a-z0-9_]*(?:[\s|｜:：,，;；\-+_\[\]【】()（）]|$)/i;

  function isRealProxyName(name) {
    const text = String(name || '').trim();
    if (!text) return false;
    if (/^(urltest|select|fallback|load-balance)\b/i.test(text)) return false;
    if (/^(DIRECT|REJECT|REJECT-DROP|PASS)$/i.test(text)) return false;
    if (/^[-=*_\s|｜]+$/.test(text)) return false;
    if (/^\d+$/.test(text)) return false;
    if (/\b\d+\/\d+\b/.test(text)) return false;
    if (PROXY_TRAFFIC_RE.test(text) || PROXY_DATE_RE.test(text)) return false;
    if (PROXY_PROMO_HANDLE_RE.test(text)) return false;
    if (PROXY_INFO_RE.test(text) || PROXY_INFO_LINE_RE.test(text)) return false;
    return true;
  }
  // 节点特征：家宽 / 倍率 / 流媒体
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

  // 倍率识别
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
  const multiplierSortInfoCache = new Map();

  // 倍率排序提取
  function getMultiplierSortInfo(name) {
    const cacheKey = String(name || '');
    if (multiplierSortInfoCache.has(cacheKey)) return multiplierSortInfoCache.get(cacheKey);

    const normalized = cacheKey
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

      if (nearMultiplierMark) candidates.push({ value, index: start });
    }

    if (candidates.length) {
      candidates.sort((a, b) => a.value - b.value || a.index - b.index);
      const result = { value: candidates[0].value, recognized: true };
      multiplierSortInfoCache.set(cacheKey, result);
      return result;
    }
    const result = { value: Number.POSITIVE_INFINITY, recognized: false };
    multiplierSortInfoCache.set(cacheKey, result);
    return result;
  }
  function isMultiplierProxyName(name) {
    const text = String(name || '');
    if (multiplierNamePatterns.some(re => re.test(text))) return true;
    return getMultiplierSortInfo(text).recognized;
  }

  // 流媒体识别
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
  // 节点清洗
  const cleanProxies = [];
  const allProxyNames = [];
  const residentialProxyNames = [];
  const multiplierProxyNames = [];
  const streamingProxyNames = [];
  const seenProxyNames = new Set();

  for (let i = 0; i < config.proxies.length; i++) {
    const proxy = config.proxies[i];
    const proxyName = proxy && proxy.name;
    if (!proxyName || !isRealProxyName(proxyName) || seenProxyNames.has(proxyName)) continue;
    seenProxyNames.add(proxyName);
    cleanProxies.push(proxy);
    allProxyNames.push(proxyName);
    if (isResidentialProxyName(proxyName)) residentialProxyNames.push(proxyName);
    if (isMultiplierProxyName(proxyName)) multiplierProxyNames.push(proxyName);
    if (isStreamingProxyName(proxyName)) streamingProxyNames.push(proxyName);
  }

  const builtInDirectProxies = [
    { name: '🇨🇳 直连 | IPv4优先', type: 'direct', 'ip-version': 'ipv4-prefer' },
    { name: '🇨🇳 直连 | IPv6优先', type: 'direct', 'ip-version': 'ipv6-prefer' },
    { name: '🇨🇳 直连 | 双栈', type: 'direct' }
  ];
  for (let i = 0; i < builtInDirectProxies.length; i++) {
    const proxy = builtInDirectProxies[i];
    if (seenProxyNames.has(proxy.name)) continue;
    seenProxyNames.add(proxy.name);
    cleanProxies.push(proxy);
  }
  const builtInDirectChoiceNames = builtInDirectProxies.map(proxy => proxy && proxy.name).filter(Boolean);
  // 组级额外候选注册表
  const GROUP_SCOPED_CHOICE_REGISTRY = Object.freeze({
    '国内服务': builtInDirectChoiceNames.slice()
  });

  config.proxies = cleanProxies;
  perfEnd('proxy_classify');

  const wholeWordPatternCache = new Map();
  function hasWholeWord(text, word) {
    const key = String(word || '').toLowerCase();
    let pattern = wholeWordPatternCache.get(key);
    if (!pattern) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\/\-]/g, '\\$&');
      pattern = new RegExp('(^|[^a-z])' + escaped + '([^a-z]|$)', 'i');
      wholeWordPatternCache.set(key, pattern);
    }
    return pattern.test(String(text || ''));
  }
  // 地区识别
  const regionGroups = {
    '香港': [],
    '台湾': [],
    '日本': [],
    '新加坡': [],
    '美国': [],
    '韩国': [],
    '俄罗斯': [],
    '欧盟': [],
    '东南亚': [],
    '美洲其它': [],
    '非洲': [],
    '其它地区': [],
  };

  // 地区匹配库（中文/英文/ISO/机场码）
  const REGION_MATCH_DB = [
    {
      id: '香港',
      keywords: ['香港', '港', '港区', '港服', 'hong kong', 'hongkong', 'hkbn', 'hkt', 'kowloon', 'tsim sha tsui'],
      iso: ['HK', 'HKG']
    },
    {
      id: '台湾',
      keywords: ['台湾', '台灣', '台北', '台中', '高雄', '新北', '桃园', 'taiwan', 'taipei', 'taichung', 'kaohsiung', 'hsinchu', 'tainan', 'taoyuan', 'new taipei'],
      iso: ['TW', 'TWN', 'TPE']
    },
    {
      id: '日本',
      keywords: ['日本', '东京', '大阪', '横滨', '名古屋', '福冈', '札幌', '京都', '神户', '千叶', '埼玉', '仙台', '广岛', '冲绳', '那霸', 'japan', 'tokyo', 'osaka', 'nagoya', 'saitama', 'yokohama', 'fukuoka', 'kawasaki', 'chiba', 'sapporo', 'okinawa', 'naha', 'kyoto', 'kobe', 'sendai', 'hiroshima'],
      iso: ['JP', 'JPN', 'NRT', 'HND', 'KIX', 'NGO', 'FUK', 'CTS', 'OKA']
    },
    {
      id: '新加坡',
      keywords: ['新加坡', '狮城', '星加坡', 'singapore', 'singtel'],
      iso: ['SG', 'SGP', 'SIN']
    },
    {
      id: '美国',
      keywords: ['美国', 'united states', 'america', 'usa', '洛杉矶', 'los angeles', '圣何塞', 'san jose', '旧金山', '三藩市', 'san francisco', '西雅图', 'seattle', '纽约', 'new york', '芝加哥', 'chicago', '达拉斯', 'dallas', '丹佛', 'denver', '凤凰城', 'phoenix', '亚特兰大', 'atlanta', '迈阿密', 'miami', '波士顿', 'boston', '华盛顿', 'washington', '费城', 'philadelphia', '休斯顿', 'houston', '圣地亚哥', 'san diego', '拉斯维加斯', 'las vegas', '波特兰', 'portland', '硅谷', 'silicon valley', '弗吉尼亚', 'virginia', '夏洛特', 'charlotte', '奥斯汀', 'austin', 'ashburn'],
      iso: ['US', 'USA', 'LAX', 'SJC', 'SFO', 'SEA', 'JFK', 'EWR', 'ORD', 'DFW', 'IAD', 'ATL', 'MIA', 'BOS', 'DEN', 'PHX', 'IAH', 'PHL', 'SAN', 'LAS', 'PDX', 'CLT']
    },
    {
      id: '韩国',
      keywords: ['韩国', '南韩', '首尔', '釜山', '仁川', '大田', '大邱', '光州', '济州', 'korea', 'seoul', 'busan', 'incheon', 'daejeon', 'daegu', 'gwangju', 'jeju'],
      iso: ['KR', 'KOR', 'ICN', 'GMP', 'PUS', 'CJU']
    },
    {
      id: '俄罗斯',
      keywords: ['俄罗斯', '俄国', '俄', 'russia', 'russian federation', 'moscow', 'moskva', 'saint petersburg', 'st. petersburg', 'novosibirsk'],
      iso: ['RU', 'RUS', 'SVO', 'DME']
    },
    {
      id: '欧盟',
      keywords: [
        '英国', 'britain', 'united kingdom', 'england', 'london', 'manchester', '爱尔兰', 'ireland', 'dublin',
        '德国', 'germany', 'frankfurt', 'berlin', 'munich', 'hamburg', 'cologne',
        '法国', 'france', 'paris', 'marseille', 'lyon', 'nice',
        '荷兰', 'netherlands', 'holland', 'amsterdam', 'rotterdam',
        '土耳其', 'turkey', 'istanbul',
        '意大利', 'italy', 'milan', 'rome', 'florence',
        '西班牙', 'spain', 'madrid', 'barcelona',
        '葡萄牙', 'portugal', 'lisbon',
        '瑞典', 'sweden', 'stockholm',
        '波兰', 'poland', 'warsaw',
        '瑞士', 'switzerland', 'zurich', 'geneva',
        '奥地利', 'austria', 'vienna',
        '比利时', 'belgium', 'brussels',
        '丹麦', 'denmark', 'copenhagen',
        '芬兰', 'finland', 'helsinki',
        '挪威', 'norway', 'oslo',
        '希腊', 'greece', 'athens',
        '捷克', 'czech', 'prague',
        '匈牙利', 'hungary', 'budapest',
        '罗马尼亚', 'romania', 'bucharest',
        '保加利亚', 'bulgaria', 'sofia',
        '乌克兰', 'ukraine', 'kyiv', 'kiev',
        '欧盟', '欧洲', 'europe', 'european union'
      ],
      iso: ['EU', 'GB', 'UK', 'DE', 'FR', 'NL', 'TR', 'IT', 'ES', 'SE', 'PL', 'CH', 'AT', 'BE', 'DK', 'FI', 'NO', 'IE', 'PT', 'GR', 'CZ', 'HU', 'RO', 'BG', 'UA', 'LHR', 'LGW', 'MAN', 'CDG', 'ORY', 'FRA', 'MUC', 'BER', 'AMS', 'MAD', 'BCN', 'ZRH', 'VIE']
    },
    {
      id: '东南亚',
      keywords: [
        '东南亚', 'southeast asia', 'sea', '马来西亚', 'malaysia', 'kuala lumpur', '吉隆坡',
        '印度尼西亚', '印尼', 'indonesia', 'jakarta', '雅加达',
        '泰国', 'thailand', 'bangkok', '曼谷',
        '越南', 'vietnam', 'hanoi', '河内', 'ho chi minh', '胡志明', 'saigon',
        '菲律宾', 'philippines', 'manila', '马尼拉',
        '新加坡周边', '柬埔寨', 'cambodia', 'phnom penh', '金边',
        '缅甸', 'myanmar', 'yangon', '老挝', 'laos', 'vientiane', '文莱', 'brunei'
      ],
      iso: ['MY', 'MYS', 'KUL', 'ID', 'IDN', 'CGK', 'TH', 'THA', 'BKK', 'VN', 'VNM', 'SGN', 'HAN', 'PH', 'PHL', 'MNL', 'KH', 'KHM', 'MM', 'MMR', 'LA', 'LAO', 'BN', 'BRN', 'SEA']

    },
    {
      id: '美洲其它',
      keywords: [
        '美洲', 'americas', '拉丁美洲', 'latin america', '南美', 'south america', '中美洲', 'central america', '加勒比', 'caribbean',
        '加拿大', 'canada', 'toronto', '多伦多', 'vancouver', '温哥华', 'montreal', '蒙特利尔', 'ottawa', '渥太华', 'calgary', '卡尔加里',
        '墨西哥', 'mexico', 'mexico city', '墨西哥城', 'cancun', '坎昆', 'guadalajara', 'monterrey',
        '巴西', 'brazil', 'saopaulo', '圣保罗', 'rio de janeiro', '里约热内卢',
        '阿根廷', 'argentina', 'buenos aires', '布宜诺斯艾利斯',
        '智利', 'chile', 'santiago', '秘鲁', 'peru', 'lima', '利马',
        '哥伦比亚', 'colombia', 'bogota', '波哥大', 'medellin', '委内瑞拉', 'venezuela',
        '厄瓜多尔', 'ecuador', '玻利维亚', 'bolivia', '巴拉圭', 'paraguay', '乌拉圭', 'uruguay', 'montevideo',
        '哥斯达黎加', 'costa rica', '巴拿马', 'panama', '牙买加', 'jamaica'
      ],
      iso: ['CA', 'CAN', 'YYZ', 'YVR', 'YUL', 'MX', 'MEX', 'BR', 'BRA', 'GRU', 'GIG', 'AR', 'ARG', 'EZE', 'CL', 'CHL', 'PE', 'PER', 'CO', 'COL', 'VE', 'VEN', 'EC', 'ECU', 'BO', 'BOL', 'PY', 'PRY', 'UY', 'URY', 'AM']

    },
    {
      id: '非洲',
      keywords: [
        '非洲', 'africa', '埃及', 'egypt', 'cairo', '开罗', '摩洛哥', 'morocco', 'casablanca',
        '肯尼亚', 'kenya', 'nairobi', '南非', 'south africa', 'johannesburg', '约翰内斯堡', 'cape town', '开普敦', 'pretoria',
        '尼日利亚', 'nigeria', 'lagos', 'abuja', 'ghana', '加纳', 'accra', '埃塞俄比亚', 'ethiopia',
        '坦桑尼亚', 'tanzania', '乌干达', 'uganda', '卢旺达', 'rwanda', '突尼斯', 'tunisia', '阿尔及利亚', 'algeria',
        '苏丹', 'sudan', '利比亚', 'libya', '安哥拉', 'angola', '喀麦隆', 'cameroon', '塞内加尔', 'senegal', 'dakar'
      ],
      iso: ['EG', 'EGY', 'CAI', 'MA', 'MAR', 'KE', 'KEN', 'NBO', 'ZA', 'ZAF', 'JNB', 'CPT', 'NG', 'NGA', 'GH', 'GHA', 'ET', 'ETH', 'TZ', 'TZA', 'UG', 'UGA', 'RW', 'RWA', 'TN', 'TUN', 'DZ', 'DZA', 'AF']

    },
    {
      id: '其它地区',
      keywords: [
        '印度', 'india', 'mumbai', '孟买', 'delhi', '新德里', 'bangalore', '班加罗尔',
        '澳大利亚', '澳洲', 'australia', '悉尼', 'sydney', '墨尔本', 'melbourne', 'brisbane', 'perth', 'adelaide',
        '新西兰', 'new zealand', '奥克兰', 'auckland', 'wellington',
        '阿联酋', 'uae', 'emirates', 'dubai', '迪拜', 'abu dhabi', '卡塔尔', 'qatar', 'doha',
        '沙特', 'saudi', 'riyadh', '以色列', 'israel', 'tel aviv', '土耳其亚洲', 'turkiye asia',
        '澳门', 'macau', 'macao', '蒙古', 'mongolia', '关岛', 'guam', '斐济', 'fiji'
      ],
      iso: ['IN', 'IND', 'BOM', 'DEL', 'BLR', 'AU', 'AUS', 'SYD', 'MEL', 'NZ', 'NZL', 'AKL', 'AE', 'ARE', 'DXB', 'QA', 'QAT', 'DOH', 'SA', 'SAU', 'IL', 'ISR', 'MO', 'MAC', 'MN', 'MNG']
    }
  ];

  // 匹配优先级
  const REGION_PRIORITY = REGION_MATCH_DB.map(entry => entry.id);

  // 旗帜优先
  const REGION_FLAG_SOURCE = {
    '香港': /🇭🇰/,
    '台湾': /🇹🇼/,
    '日本': /🇯🇵/,
    '新加坡': /🇸🇬/,
    '美国': /🇺🇸|🇺🇲/,
    '韩国': /🇰🇷/,
    '俄罗斯': /🇷🇺/,
    '欧盟': /🇪🇺|🇬🇧|🇩🇪|🇫🇷|🇳🇱|🇮🇹|🇪🇸|🇸🇪|🇵🇱|🇨🇭|🇦🇹|🇧🇪|🇩🇰|🇫🇮|🇳🇴|🇹🇷|🇮🇪|🇵🇹|🇬🇷|🇨🇿|🇭🇺|🇺🇦|🇷🇴|🇧🇬/,
    '东南亚': /🇲🇾|🇮🇩|🇹🇭|🇻🇳|🇵🇭|🇰🇭|🇲🇲|🇱🇦|🇧🇳/,
    '美洲其它': /🇨🇦|🇲🇽|🇧🇷|🇦🇷|🇨🇱|🇵🇪|🇨🇴|🇻🇪|🇪🇨|🇧🇴|🇵🇾|🇺🇾/,
    '非洲': /🇪🇬|🇲🇦|🇰🇪|🇿🇦|🇳🇬|🇬🇭|🇪🇹|🇹🇿|🇺🇬|🇷🇼|🇹🇳|🇩🇿/,
  };
  const REGION_FLAG_MAP = REGION_PRIORITY
    .map(regionName => [regionName, REGION_FLAG_SOURCE[regionName]])
    .filter(([, pattern]) => pattern instanceof RegExp);
  const compiledRegionMatcherMap = Object.create(null);

  for (let i = 0; i < REGION_MATCH_DB.length; i++) {
    const region = REGION_MATCH_DB[i];
    const terms = []
      .concat(asArray(region && region.keywords))
      .concat(asArray(region && region.iso))
      .filter(Boolean);
    const compiledMatchers = [];
    for (let j = 0; j < terms.length; j++) {
      const lowerKeyword = String(terms[j] || '').toLowerCase().trim();
      if (!lowerKeyword) continue;
      compiledMatchers.push({
        lowerKeyword,
        compactKeyword: lowerKeyword.includes(' ') ? lowerKeyword.replace(/\s+/g, '') : lowerKeyword,
        isChinese: /[\u4e00-\u9fa5]/.test(lowerKeyword),
        isShortAlphaWord: lowerKeyword.length <= 4 && /^[a-z]+$/.test(lowerKeyword)
      });
    }
    compiledRegionMatcherMap[region.id] = compiledMatchers;
  }
  const normalizeCache = new Map();
  const regionMatchCache = new Map();
  // 噪声关键词
  const noiseKeywords = [
    'vip', 'svip', '倍率', 'x\d+', 'iepl', 'iplc', 'bgp', 'cn2', 'gia',
    'game', 'games', 'gaming', 'stream', 'media', 'unlock', 'nf', '奈飞',
    'netflix', 'disney', 'hbo', 'max', 'prime', 'chatgpt', 'gpt', 'ai',
    'home', 'residential', 'station', 'server', 'node', 'premium', 'traffic',
    'test', 'testing', 'expire', 'plan', 'used', 'aws', 'hy2', 'anytls',
    'relay', 'direct', 'standard', 'basic', 'pro', 'plus', '专线', '中转', '原生'
  ];
  const noisePattern = new RegExp('\\b(' + noiseKeywords.join('|') + ')\\b', 'gi');

  // 名称标准化
  function normalizeRegionName(name) {
    const key = String(name || '');
    if (normalizeCache.has(key)) return normalizeCache.get(key);
    const result = key
      .toLowerCase()
      .replace(/(?:\uD83C[\uDDE6-\uDDFF]){2}/g, ' ')
      .replace(/[\u2600-\u27BF]/g, ' ')
      .replace(/[\d]+(?:\.\d+)?\s*(?:x|倍|gb|mb|tb|g|m|t)\b/gi, ' ')
      .replace(/[|｜¦•·・,，;；:：/\_+-–—()\[\]{}<>【】「」『』]/g, ' ')
      .replace(noisePattern, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    normalizeCache.set(key, result);
    return result;
  }
  function matchCompiledRegionByKeywords(rawText, normalizedName) {
    const normalized = String(normalizedName || '');
    const compact = normalized.includes(' ') ? normalized.replace(/\s+/g, '') : normalized;
    for (let regionIndex = 0; regionIndex < REGION_PRIORITY.length; regionIndex++) {
      const regionName = REGION_PRIORITY[regionIndex];
      const matchers = compiledRegionMatcherMap[regionName] || [];
      for (let i = 0; i < matchers.length; i++) {
        const matcher = matchers[i];
        if (matcher.isChinese) {
          if (rawText.includes(matcher.lowerKeyword) || normalized.includes(matcher.lowerKeyword)) return regionName;
          continue;
        }
        if (matcher.isShortAlphaWord) {
          if (hasWholeWord(rawText, matcher.lowerKeyword) || hasWholeWord(normalized, matcher.lowerKeyword)) return regionName;
          continue;
        }
        if (normalized.includes(matcher.lowerKeyword)) return regionName;
        if (matcher.compactKeyword !== matcher.lowerKeyword && compact.includes(matcher.compactKeyword)) return regionName;
      }
    }
    return null;
  }

  function matchRegionByLooseRecovery(normalizedName) {
    const normalized = String(normalizedName || '');
    if (!normalized) return null;
    const compact = normalized.includes(' ') ? normalized.replace(/\s+/g, '') : normalized;
    for (let regionIndex = 0; regionIndex < REGION_PRIORITY.length; regionIndex++) {
      const regionName = REGION_PRIORITY[regionIndex];
      const matchers = compiledRegionMatcherMap[regionName] || [];
      for (let i = 0; i < matchers.length; i++) {
        const matcher = matchers[i];
        if (matcher.isShortAlphaWord) continue;
        if (normalized.includes(matcher.lowerKeyword)) return regionName;
        if (matcher.compactKeyword !== matcher.lowerKeyword && compact.includes(matcher.compactKeyword)) return regionName;
      }
    }
    return null;
  }
  // 地区匹配主流程：旗帜 > 词库 > 宽松恢复
  function matchRegion(name) {
    const rawName = String(name || '');
    if (regionMatchCache.has(rawName)) return regionMatchCache.get(rawName);

    let result = '其它地区';
    for (let i = 0; i < REGION_FLAG_MAP.length; i++) {
      if (REGION_FLAG_MAP[i][1].test(rawName)) {
        result = REGION_FLAG_MAP[i][0];
        break;
      }
    }
    if (result === '其它地区') {
      const normalized = normalizeRegionName(rawName);
      if (normalized) {
        result = matchCompiledRegionByKeywords(rawName.toLowerCase(), normalized)
          || matchRegionByLooseRecovery(normalized)
          || '其它地区';
      }
    }
    regionMatchCache.set(rawName, result);
    return result;
  }
  // 内置直连名称
  const builtInDirectProxyNames = new Set(['🇨🇳 直连 | IPv4优先', '🇨🇳 直连 | IPv6优先', '🇨🇳 直连 | 双栈']);
  
  perfStart('region_classify');
  for (let i = 0; i < cleanProxies.length; i++) {
    const proxy = cleanProxies[i];
    if (builtInDirectProxyNames.has(proxy.name)) continue;
    const matchedRegion = matchRegion(proxy.name);
    (regionGroups[matchedRegion] || regionGroups['其它地区']).push(proxy.name);
  }
  // 未命中地区统一回收到「其它地区」
  const otherRegionNodes = unique(regionGroups['其它地区']);
  const hasNamedPrimaryRegion = ['香港', '台湾', '日本', '新加坡', '美国', '韩国', '俄罗斯', '欧盟', '东南亚', '美洲其它', '非洲']
    .some(regionName => regionGroups[regionName].length > 0);
  perfEnd('region_classify');
  if (PERF_ENABLED) {
    const regionDebugOrder = ['香港', '台湾', '日本', '新加坡', '美国', '韩国', '俄罗斯', '欧盟', '东南亚', '美洲其它', '非洲', '其它地区'];
    const regionDebugSummary = regionDebugOrder.map(regionName => `${regionName}:${(regionGroups[regionName] || []).length}`).join(' | ');
    const otherRegionSamples = otherRegionNodes.slice(0, 12).join(' / ');
    debugLog(`[RegionClassify] ${regionDebugSummary}`);
    if (otherRegionNodes.length) debugLog(`[RegionClassify] 其它地区样本: ${otherRegionSamples}`);
  }
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
    const oldProxySeen = new Set();
    const ordered = [];
    for (let i = 0; i < oldGroup.proxies.length; i++) {
      const proxyName = oldGroup.proxies[i];
      if (!groupProxySet.has(proxyName) || oldProxySeen.has(proxyName)) continue;
      oldProxySeen.add(proxyName);
      ordered.push(proxyName);
    }
    for (let i = 0; i < group.proxies.length; i++) {
      const proxyName = group.proxies[i];
      if (oldProxySeen.has(proxyName)) continue;
      oldProxySeen.add(proxyName);
      ordered.push(proxyName);
    }
    return { ...group, proxies: ordered };
  }

  // 代理列表兜底：合并用户列表和默认项，若最终为空则至少返回 DIRECT。

  function mergeUniqueChoicesWithFallback(primaryInput, fallbackInput, emptyFallback = null) {
    const merged = [];
    const seen = new Set();
    const primary = asArray(primaryInput);
    const fallback = asArray(fallbackInput);
    for (let i = 0; i < primary.length; i++) {
      const item = primary[i];
      if (!item || seen.has(item)) continue;
      seen.add(item);
      merged.push(item);
    }
    for (let i = 0; i < fallback.length; i++) {
      const item = fallback[i];
      if (!item || seen.has(item)) continue;
      seen.add(item);
      merged.push(item);
    }
    return merged.length ? merged : (emptyFallback || []);
  }

  // 列表兜底约定：这里只能返回一维字符串数组；若改成对象/嵌套数组，会直接影响 Clash 配置反序列化。
  function ensureGroupList(list, extraDefaults) {
    const merged = mergeUniqueChoicesWithFallback(list, extraDefaults, ['DIRECT']);
    return merged.length ? merged : ['DIRECT'];
  }

  // URL Test 组：用于自动测速选优；没有节点时直接跳过创建，避免伪装成直连组。
  function normalizeHealthOptions(options = {}, defaults = {}) {
    return {
      url: options.url || defaults.url || testUrl,
      interval: typeof options.interval === 'number' ? options.interval : (typeof defaults.interval === 'number' ? defaults.interval : testInterval),
      tolerance: typeof options.tolerance === 'number' ? options.tolerance : (typeof defaults.tolerance === 'number' ? defaults.tolerance : testTolerance),
      timeout: typeof options.timeout === 'number' ? options.timeout : (typeof defaults.timeout === 'number' ? defaults.timeout : testTimeout),
      maxFailedTimes: typeof options.maxFailedTimes === 'number' ? options.maxFailedTimes : (typeof defaults.maxFailedTimes === 'number' ? defaults.maxFailedTimes : testMaxFailedTimes),
      lazy: typeof options.lazy === 'boolean' ? options.lazy : (typeof defaults.lazy === 'boolean' ? defaults.lazy : healthCheckLazy),
      strategy: options.strategy || defaults.strategy || 'consistent-hashing'
    };
  }
  function makeUrlTestGroup(name, icon, nodes, interval, tolerance, options = {}) {
    const proxies = ensureGroupList(nodes, []);
    if (!proxies.length || (proxies.length === 1 && proxies[0] === 'DIRECT')) return null;
    const health = normalizeHealthOptions(options, { interval, tolerance });
    return {
      name, type: 'url-test', icon,
      url: health.url, interval: health.interval, tolerance: health.tolerance,
      timeout: health.timeout, 'max-failed-times': health.maxFailedTimes, lazy: health.lazy,
      proxies
    };
  }
  // Select 组
  function makeSelectGroup(name, icon, list, extraDefaults = ['自动选择'], scope = null) {
    return {
      name,
      type: 'select',
      icon,
      proxies: filterUsableChoiceNames(buildChoiceList(list, extraDefaults), scope)
    };
  }
  // Fallback 组
  function makeFallbackGroup(name, icon, list, extraDefaults = ['自动选择'], options = {}) {
    const proxies = ensureGroupList(list, extraDefaults);
    const health = normalizeHealthOptions(options, {
      interval: fallbackInterval, tolerance: fallbackTolerance,
      timeout: fallbackTimeout, maxFailedTimes: fallbackMaxFailedTimes
    });
    return {
      name, type: 'fallback', icon,
      url: health.url, interval: health.interval, tolerance: health.tolerance,
      timeout: health.timeout, 'max-failed-times': health.maxFailedTimes, lazy: health.lazy,
      proxies
    };
  }
  // 批量 Select 生成
  function makeSelectGroupsFromDefs(defs) {
    const groups = [];
    const list = asArray(defs);
    for (let i = 0; i < list.length; i++) {
      const def = list[i];
      if (!def || !def.name) continue;
      groups.push(makeSelectGroup(def.name, def.icon, def.choices, def.extraDefaults, def.scope));
    }
    return groups;
  }

  // 规则集合并（后定义覆盖前定义）
  function mergeRuleSets(...ruleSets) {
    const merged = [];
    const seenRuleIndexes = new Map();
    let hasNullHole = false;
    for (let i = 0; i < ruleSets.length; i++) {
      const ruleSet = asArray(ruleSets[i]);
      for (let j = 0; j < ruleSet.length; j++) {
        const rule = ruleSet[j];
        if (!rule) continue;
        const identityKey = getRuleIdentityKey(rule) || `RAW@@${rule}`;
        if (seenRuleIndexes.has(identityKey)) {
          const prevIndex = seenRuleIndexes.get(identityKey);
          if (typeof prevIndex === 'number' && prevIndex >= 0 && prevIndex < merged.length) {
            merged[prevIndex] = null;
            hasNullHole = true;
          }
        }
        seenRuleIndexes.set(identityKey, merged.length);
        merged.push(rule);
      }
    }
    if (!hasNullHole) return merged;
    const finalized = [];
    for (let i = 0; i < merged.length; i++) {
      if (merged[i]) finalized.push(merged[i]);
    }
    return finalized;
  }

  // 规则映射表
  function buildRuleSetMap(defs) {
    const map = Object.create(null);
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      if (!def || !def.name) continue;
      map[def.name] = def.rules;
    }
    return map;
  }

  // 按顺序收集规则
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

  // 图标映射
  const regionIconMap = {
    '香港': qIcon('Hong_Kong'), '台湾': qIcon('Taiwan'), '日本': qIcon('Japan'),
    '新加坡': qIcon('Singapore'), '美国': qIcon('United_States'), '韩国': qIcon('Korea'),
    '俄罗斯': qIcon('Russia'), '欧盟': qIcon('European_Union'), '东南亚': qIcon('Asia_Map'),
    '美洲其它': qIcon('America_Map'), '非洲': qIcon('Africa_Map'), '其它地区': qIcon('World_Map')
  };
  const MINI_COLOR_BASE = 'https://raw.githubusercontent.com/Orz-3/mini/master/Color/';
  const homeRegionIconMap = {
    '香港': MINI_COLOR_BASE + 'HK.png', '台湾': MINI_COLOR_BASE + 'TW.png', '日本': MINI_COLOR_BASE + 'JP.png',
    '新加坡': MINI_COLOR_BASE + 'SG.png', '美国': MINI_COLOR_BASE + 'US.png', '韩国': MINI_COLOR_BASE + 'KR.png',
    '俄罗斯': MINI_COLOR_BASE + 'RU.png', '欧盟': MINI_COLOR_BASE + 'EU.png',
    '东南亚': regionIconMap['东南亚'], '美洲其它': regionIconMap['美洲其它'],
    '非洲': regionIconMap['非洲'], '其它地区': regionIconMap['其它地区']
  };
  const iconMap = {
    rocket: qIcon('Rocket'), auto: qIcon('Auto'), select: qIcon('Static'), balance: qIcon('Round_Robin'),
    direct: qIcon('Direct'), final: qIcon('Final'), global: qIcon('Global'),
    fallback: qIcon('Available'), fallbackFinal: qIcon('Airport'),
    flare: 'https://api.iconify.design/tabler:flame-filled.svg?color=%2300d1b2',
    lowMultiplier: 'https://api.iconify.design/tabler:gauge-filled.svg?color=%23f59e0b',
    multiplier: qIcon('Filter'), home: 'https://api.iconify.design/tabler:home-filled.svg',
    youtube: qIcon('YouTube'), youtubeFallback: qIcon('Streaming'), tiktok: qIcon('TikTok'),
    meta: 'https://api.iconify.design/simple-icons:meta.svg?color=%231877F2',
    twitter: 'https://api.iconify.design/logos:twitter.svg?color=%231DA1F2',
    telegram: qIcon('Telegram'), translate: 'https://api.iconify.design/simple-icons:googletranslate.svg?color=%234285F4', google: qIcon('Google_Search'),
    playstore: 'https://api.iconify.design/logos:google-play-icon.svg',
    microsoft: qIcon('Microsoft'), apple: qIcon('Apple'), cloudflare: qIcon('Cloudflare'),
    github: qIcon('GitHub'), ai: qIcon('ChatGPT'), aiFallback: qIcon('Bot'),
    fcm: 'https://fastly.jsdelivr.net/gh/MiToverG422/Qure@master/IconSet/Color/fcm.png',
    streaming: qIcon('Netflix'), streamingGlobal: qIcon('Media'), netflix: qIcon('Netflix'),
    spotify: qIcon('Spotify'), twitch: qIcon('Twitch'), discord: qIcon('Discord'),
    niconico: 'https://api.iconify.design/simple-icons:niconico.svg?color=%23EAB20C',
    taiwanMedia: qIcon('Bahamut'),
    social: 'https://api.iconify.design/simple-icons:reddit.svg?color=%23FF4500',
    reddit: 'https://api.iconify.design/simple-icons:reddit.svg',
    china: qIcon('China_Map'), russia: qIcon('Russia'), jpkr: qIcon('AbemaTV'),
    game: qIcon('Game'), download: qIcon('Download'), adblock: qIcon('Advertising'),
    decentralized: 'https://api.iconify.design/simple-icons:ethereum.svg?color=%23627EEA', riskControl: 'https://mihomo.echs.top/img/Hand-Painted-icon/Google_Suite/Account.png'
  };
  function makeFusionRegionGroupNames(label) {
    return {
      auto: label + '自动',
      manual: label + '手动',
      homeAuto: label + '家宽',
      homeManual: label + '家宽手动',
    };
  }
  // 地区目录与测速顺序
  const regionAutoOrder = ['香港', '台湾', '美国', '日本', '新加坡', '韩国', '俄罗斯', '欧盟', '东南亚', '美洲其它', '非洲', '其它地区'];

  // 地区目录构建
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
      ? makeUrlTestGroup(names.homeAuto, homeRegionIconMap[regionName], residentialNodes, regionUrlTestInterval, regionUrlTestTolerance, {
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
  // 地区映射缓存
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

  // 地区查询辅助
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
  function sortProxyNamesByMultiplier(names) {
    return asArray(names).slice().sort((a, b) => {
      const ai = getMultiplierSortInfo(a);
      const bi = getMultiplierSortInfo(b);
      return ai.value - bi.value || String(a).localeCompare(String(b), 'zh-Hans-CN');
    });
  }

  function getRegionNodes(regionName, options = {}) {
    const { includeResidential = true, residentialOnly = false, sortByMultiplier = false } = options;
    const info = regionCatalog[regionName];
    if (!info) return [];
    let nodes;
    if (residentialOnly) nodes = info.residentialNodes.slice();
    else if (includeResidential) nodes = info.nodes.slice();
    else nodes = info.nodes.filter(name => !isResidentialProxyName(name));
    return sortByMultiplier ? sortProxyNamesByMultiplier(nodes) : nodes;
  }
  function buildRegionNodeList(names, options = {}) {
    const regions = asArray(names);
    const merged = [];
    const seen = new Set();
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
        if (item && !seen.has(item)) {
          seen.add(item);
          merged.push(item);
        }
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
  function makeBusinessChoiceMap(defs, templateMap = null) {
    return createNamedValueMap(defs, 'key', def => {
      const pool = def.poolKey && templateMap ? templateMap[def.poolKey] : def.pool;
      return makeOrderedChoices(def.first, pool, def.scope);
    });
  }

  function makeChoicePool(first, ...poolParts) {
    return makeOrderedChoices(first, buildChoiceList(...poolParts));
  }

  // 候选池构建：不仅要合并 first + parts，还必须透传组级额外白名单。
  // 否则像“国内服务”这种允许额外候选的组，会在二次重组时又被按全局白名单刷掉。
  function buildChoicePoolsFromDefs(defs) {
    const map = Object.create(null);
    const list = asArray(defs);
    for (let i = 0; i < list.length; i++) {
      const def = list[i];
      if (!def || !def.key) continue;
      map[def.key] = makeOrderedChoices(
        def.first,
        buildChoiceList(...asArray(def.parts)),
        def.scope
      );
    }
    return map;
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
    const merged = mergeUniqueChoicesWithFallback(list, fallbackChoices, ['DIRECT']);
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
  function filterAvailableChoiceNames(list, availableChoiceNameSet, selfName) {
    const filtered = [];
    const source = asArray(list);
    for (let i = 0; i < source.length; i++) {
      const item = source[i];
      if (!item || item === selfName) continue;
      if (BUILTIN_CHOICE_NAMES.has(item) || availableChoiceNameSet.has(item)) filtered.push(item);
    }
    return filtered;
  }

  // 全局家宽池：从全部节点中抽出住宅线路，供风控 / 支付 / 登录等敏感业务优先选择。
  const globalHomeNodes = residentialProxyNames.slice();

  // 可见地区链：把地区自动组与家宽自动组统一并入手动候选菜单。
  const fusionVisibleRegions = unique(regionAutoNames.concat(regionHomeAutoNames));

  // 全局兜底地区顺序：用于自动兜底组，优先尝试更常用出口地区。
  const AUTO_FALLBACK_REGION_ORDER = ['香港', '台湾', '日本', '新加坡', '美国', '韩国', '欧盟', '俄罗斯', '东南亚', '美洲其它', '非洲', '其它地区'];

  const autoFallbackNodes = unique(buildRegionChain(AUTO_FALLBACK_REGION_ORDER));

  // 区域故障转移定义
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
    regionGroups['东南亚'],
    regionGroups['欧盟'],
    regionGroups['其它地区'],

    regionGroups['非洲'],
    regionGroups['美洲其它'],
    regionGroups['香港'],
    regionGroups['新加坡'],
    regionGroups['日本'],
    regionGroups['美国']
  ));

  // AI 候选池：优先放入对海外 AI 服务兼容性通常更稳定的地区自动组。
  const aiFallbackNodes = filterOutDirectEntries(buildChoiceList(
    buildRegionChain(['台湾', '美国', '日本', '新加坡', '韩国', '东南亚', '美洲其它', '其它地区'])
  ));

  // Cloudflare 候选：优先自动组与欧美出口，并允许显式 Cloudflare / WARP 节点参与。
  const cloudflareGroupChoices = filterOutDirectEntries(buildChoiceList(
    ['自动选择', '欧美故障转移', '全球直连', '全球手动'],
    buildNodeChain([/cloudflare/i, /\bCF\b/i, /WARP/i, /1\.1\.1\.1/]),
    buildRegionChain(['美国', '新加坡', '日本', '香港', '台湾', '欧盟'])
  ));

  // 下载分区定义
  const DOWNLOAD_REGION_DEFS = [
    { key: '香港', groupName: '香港下载', icon: regionIconMap['香港'] || qIcon('HK') },
    { key: '台湾', groupName: '台湾下载', icon: regionIconMap['台湾'] || qIcon('TW') },
    { key: '日本', groupName: '日本下载', icon: regionIconMap['日本'] || qIcon('JP') },
    { key: '韩国', groupName: '韩国下载', icon: regionIconMap['韩国'] || qIcon('KR') },
    { key: '新加坡', groupName: '新加坡下载', icon: regionIconMap['新加坡'] || qIcon('SG') },
    { key: '美国', groupName: '美国下载', icon: regionIconMap['美国'] || qIcon('US') },
    { key: '欧盟', groupName: '欧盟下载', icon: regionIconMap['欧盟'] || qIcon('EU') }
  ];
  // Load-balance 组
  function makeLoadBalanceGroup(name, icon, nodes, options = {}) {
    const proxies = ensureGroupList(nodes, []);
    if (!proxies.length || (proxies.length === 1 && proxies[0] === 'DIRECT')) return null;
    const health = normalizeHealthOptions(options);
    return {
      name, type: 'load-balance', icon,
      url: health.url, interval: health.interval, timeout: health.timeout,
      'max-failed-times': health.maxFailedTimes, strategy: health.strategy, lazy: health.lazy,
      proxies
    };
  }

  function collectNamedGroups(groups) {
    const namedGroups = [];
    const names = [];
    const list = asArray(groups);
    for (let i = 0; i < list.length; i++) {
      const group = list[i];
      if (!group || !group.name) continue;
      namedGroups.push(group);
      names.push(group.name);
    }
    return { groups: namedGroups, names };
  }
  function makeLoadBalanceGroupArtifacts(defs, nodeBuilder, optionsBuilder = () => ({})) {
    const groups = [];
    const names = [];
    const list = asArray(defs);
    for (let i = 0; i < list.length; i++) {
      const def = list[i];
      const group = makeLoadBalanceGroup(def.groupName, def.icon, nodeBuilder(def), optionsBuilder(def));
      if (!group || !group.name) continue;
      groups.push(group);
      names.push(group.name);
    }
    return { groups, names };
  }
  const downloadRegionGroupArtifacts = makeLoadBalanceGroupArtifacts(
    DOWNLOAD_REGION_DEFS,
    def => getRegionNodes(def.key, { includeResidential: false }),
    () => ({ interval: 60, timeout: 800, strategy: 'consistent-hashing' })
  );
  const downloadRegionGroups = downloadRegionGroupArtifacts.groups;

  // 下载候选池
  const downloadGroupChoices = filterOutDirectEntries(buildChoiceList(['负载均衡', '自动选择'], downloadRegionGroupArtifacts.names));

  // 候选池 / 特殊 fallback
  const excludedFallbackChoices = ['YouTube无广节点优先组', '国外AI故障转移'];
  const SPECIAL_FALLBACK_DEFS = [
    { name: 'YouTube无广节点优先组', icon: iconMap.youtubeFallback, nodes: youtubeFallbackNodes, extraDefaults: ['自动兜底'], options: { interval: 300, tolerance: 180, lazy: true } },
    { name: '国外AI故障转移', icon: iconMap.aiFallback, nodes: aiFallbackNodes, extraDefaults: ['自动兜底'], options: { interval: 300, tolerance: 180, lazy: true } }
  ];

  // fallback 组总装
  const fallbackGroupArtifacts = collectNamedGroups([
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
  ]);
  const fallbackGroups = fallbackGroupArtifacts.groups;
  const fallbackNames = fallbackGroupArtifacts.names;
  // 负载均衡与特征聚合
  function makeRegionDownloadGroupNames(regionOrder, availableNames) {
    const availableNameSet = makeNameSet(availableNames);
    return regionOrder
      .map(regionName => `${regionName}下载`)
      .filter(name => availableNameSet.has(name));
  }
  // 谷歌商店专用：地区自动组二级负载均衡
  const playStoreBalanceChoices = regionAutoNames.length ? regionAutoNames.slice() : ['自动选择'];
  const playStoreBalanceChoiceSet = makeNameSet(playStoreBalanceChoices);
  const missingPlayStoreRegionGroups = regionAutoNames.filter(name => !playStoreBalanceChoiceSet.has(name));
  if (missingPlayStoreRegionGroups.length) {
    throw new Error('play store balance health check failed: missing region group(s): ' + missingPlayStoreRegionGroups.join(', '));
  }
  const playStoreServiceChoices = ['谷歌商店专用', '自动选择'];
  const playStoreLoadBalanceOptions = {
    url: PLAY_STORE_TEST_URL,
    interval: 45,
    timeout: 600,
    maxFailedTimes: 2,
    strategy: 'consistent-hashing',
    lazy: false
  };
  // 负载均衡组
  const loadBalanceGroupArtifacts = collectNamedGroups([
    makeLoadBalanceGroup('负载均衡', iconMap.balance, ensureGroupList(allProxyNames, []), { interval: 60, timeout: 800, strategy: 'consistent-hashing' }),
    makeLoadBalanceGroup('谷歌商店专用', iconMap.playstore, ensureGroupList(playStoreBalanceChoices, []), playStoreLoadBalanceOptions)
  ]);
  const loadBalanceGroups = loadBalanceGroupArtifacts.groups;
  const loadBalanceNames = loadBalanceGroupArtifacts.names;

  // 特殊聚合组
  const globalHomeGroup = globalHomeNodes.length
    ? makeUrlTestGroup('全球家宽', iconMap.home, globalHomeNodes, regionUrlTestInterval, regionUrlTestTolerance)
    : null;

  // 倍率聚合：先按识别出的倍率值排序，再派生低倍率节点池。

  const multiplierProxyEntries = multiplierProxyNames.map(name => ({ name, info: getMultiplierSortInfo(name) }));
  multiplierProxyEntries.sort((a, b) => {
    const diff = a.info.value - b.info.value;
    if (diff !== 0) return diff;
    if (a.info.recognized !== b.info.recognized) return a.info.recognized ? -1 : 1;
    return String(a.name).localeCompare(String(b.name), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
  });
  const globalMultiplierNodes = multiplierProxyEntries.map(item => item.name);
  const lowMultiplierNodes = multiplierProxyEntries
    .filter(item => item.info.recognized && item.info.value <= 1)
    .map(item => item.name);
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
  // 排除谷歌商店专属组
  const playStoreExclusiveSet = new Set(['谷歌商店专用']);
  const commonLoadBalanceNames = loadBalanceNames.filter(name => !playStoreExclusiveSet.has(name));
  const regionFallbackNames = ['港台故障转移', '日韩故障转移', '欧美故障转移'];
  const fallbackNameSet = makeNameSet(fallbackNames);
  const excludedFallbackChoiceSet = makeNameSet(excludedFallbackChoices);
  const orderedFallbackNames = unique([
    ...regionFallbackNames.filter(name => fallbackNameSet.has(name)),
    '家宽故障转移',
    '自动兜底',
    ...fallbackNames.filter(name => !regionFallbackNames.includes(name) && name !== '家宽故障转移' && name !== '自动兜底' && !excludedFallbackChoiceSet.has(name))
  ]);
  const STATIC_CHOICE_HINTS = unique([
    '节点选择',
    '自动选择',
    '全球手动',
    '全球直连',
    '负载均衡',
    '谷歌商店专用',
    '家宽故障转移',
    '自动兜底',
    ...regionFallbackNames,
    ...fallbackNames,
    ...loadBalanceNames,
    ...downloadRegionGroupArtifacts.names,
    ...globalFeatureChoices,
    ...regionAutoNames,
    ...regionHomeAutoNames
  ]);
  const usableChoiceNameSet = makeNameSet(STATIC_CHOICE_HINTS.concat(allProxyNames));
  for (const name of BUILTIN_CHOICE_NAMES) usableChoiceNameSet.add(name);
  // 候选作用域
  function resolveScopedChoiceNames(scopeKeyOrList) {
    if (Array.isArray(scopeKeyOrList)) return scopeKeyOrList.filter(Boolean);
    if (!scopeKeyOrList) return [];
    return asArray(GROUP_SCOPED_CHOICE_REGISTRY[scopeKeyOrList]).filter(Boolean);
  }
  function createChoiceScope(scopeKeyOrChoices = null) {
    if (scopeKeyOrChoices && typeof scopeKeyOrChoices === 'object' && scopeKeyOrChoices.allowedNameSet) {
      return scopeKeyOrChoices;
    }
    const scopedChoiceNames = resolveScopedChoiceNames(scopeKeyOrChoices);
    return {
      scopedChoiceNames,
      allowedNameSet: makeNameSet(Array.from(usableChoiceNameSet).concat(scopedChoiceNames))
    };
  }

  const GLOBAL_CHOICE_SCOPE = createChoiceScope();
  function filterUsableChoiceNames(list, scope = GLOBAL_CHOICE_SCOPE) {

    const filtered = [];
    const seen = new Set();
    const source = asArray(list);
    const scoped = scope && scope.allowedNameSet ? scope : GLOBAL_CHOICE_SCOPE;
    for (let i = 0; i < source.length; i++) {
      const item = source[i];
      if (!item || seen.has(item)) continue;
      if (!BUILTIN_CHOICE_NAMES.has(item) && !scoped.allowedNameSet.has(item)) continue;
      seen.add(item);
      filtered.push(item);
    }
    return filtered;
  }
  function usableChoices(...parts) {
    return filterUsableChoiceNames(buildChoiceList(...parts), GLOBAL_CHOICE_SCOPE);
  }
  function usableChoicesForScope(scope, ...parts) {

    return filterUsableChoiceNames(buildChoiceList(...parts), scope);
  }
  function usableChoicesForScopeKey(scopeKeyOrChoices, ...parts) {
    return usableChoicesForScope(createChoiceScope(scopeKeyOrChoices), ...parts);
  }

  function makeChoiceDef(key, scope, first, ...parts) {
    return {
      key,
      scope: scope || GLOBAL_CHOICE_SCOPE,
      first: usableChoicesForScope(scope || GLOBAL_CHOICE_SCOPE, first),
      parts: parts.map(part => usableChoicesForScope(scope || GLOBAL_CHOICE_SCOPE, part))
    };
  }
  function usableChoiceDef(key, first, ...parts) {
    return makeChoiceDef(key, GLOBAL_CHOICE_SCOPE, first, ...parts);
  }
  // 带作用域候选定义
  function makeScopedChoiceDef(key, scopeKeyOrChoices, first, ...parts) {
    return makeChoiceDef(key, createChoiceScope(scopeKeyOrChoices), first, ...parts);
  }
  function makeSelectGroupDef(name, icon, choices, extraDefaults, scopeKeyOrChoices = null) {
    const scope = createChoiceScope(scopeKeyOrChoices);

    return {
      name,
      icon,
      scope,
      choices: filterUsableChoiceNames(choices, scope),
      extraDefaults: filterUsableChoiceNames(extraDefaults, scope)
    };
  }

  function makeSelectGroupDefList(entries) {
    const defs = [];
    const list = asArray(entries);
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (!entry || !entry.name) continue;
      defs.push(makeSelectGroupDef(entry.name, entry.icon, entry.choices, entry.extraDefaults, entry.scope || entry.extraAllowedChoices));

    }
    return defs;
  }

  const baseChoices = usableChoices(['节点选择', '自动选择', '负载均衡', '全球手动'], orderedFallbackNames, commonLoadBalanceNames, globalFeatureChoices, fusionVisibleRegions, allProxyNames);
  const commonBaseChoices = baseChoices.filter(name => !excludedFallbackChoiceSet.has(name));
  const youtubeOnlyBaseChoices = baseChoices.filter(name => name !== '国外AI故障转移');
  const aiOnlyBaseChoices = baseChoices.filter(name => name !== 'YouTube无广节点优先组');
  // 候选构造器（first 强优先）
  function makeOrderedChoices(first, pool, scope = GLOBAL_CHOICE_SCOPE) {
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
    return filterUsableChoiceNames(merged, scope);
  }

  // 业务候选项
  const domesticChoices = directChoices.concat(fusionVisibleRegions);
  const taiwanAutoChoice = getRegionAuto('台湾');

  // 分流候选池
  const CHOICE_POOL_DEFS = [
    usableChoiceDef('common', ['节点选择'], commonBaseChoices),
    usableChoiceDef('youtubeOnly', ['节点选择', 'YouTube无广节点优先组'], youtubeOnlyBaseChoices),
    usableChoiceDef('aiOnly', ['节点选择', '国外AI故障转移'], aiOnlyBaseChoices),
    usableChoiceDef('playStore', playStoreServiceChoices, commonBaseChoices),
    usableChoiceDef('streaming', globalStreamingGroup ? ['全球流媒体', '节点选择', '自动选择'] : ['节点选择', '自动选择'], commonBaseChoices),
    usableChoiceDef('taiwanMedia', unique(['港台故障转移', taiwanAutoChoice, '节点选择', '自动选择'].filter(Boolean)), commonBaseChoices),
    usableChoiceDef('riskControl', [
      '家宽故障转移',
      globalHomeGroup ? '全球家宽' : null,
      // 地区家宽紧跟全球家宽
      ...regionHomeAutoNames.filter(name => name && name !== '全球家宽'),
      '全球手动',
      '节点选择',
      '自动选择'
    ].filter(Boolean), [
      '港台故障转移', '日韩故障转移', '欧美故障转移',
      ...regionAutoNames.filter(name => name && !String(name).includes('家宽')),
      '自动兜底',
      '全球直连'
    ])
  ];

  const CHOICE_POOLS = buildChoicePoolsFromDefs(CHOICE_POOL_DEFS);

  const commonFirst = ['节点选择', '自动选择'];
  const BUSINESS_CHOICE_DEFS = [
    ...['Meta', 'Telegram', 'Twitch', '国外游戏', 'Twitter', 'Discord', '社交信息流', 'GitHub', '翻译服务']
      .map(key => ({ key, first: commonFirst, poolKey: 'common' })),
    { key: 'YouTube', first: ['YouTube无广节点优先组', '节点选择'], poolKey: 'youtubeOnly' },
    ...['Spotify', 'Google', 'TikTok'].map(key => ({ key, first: ['港台故障转移'], poolKey: 'common' })),
    ...['日韩生态区', 'Niconico'].map(key => ({ key, first: ['日韩故障转移'], poolKey: 'common' })),
    { key: '去中心化平台', first: ['欧美故障转移'], poolKey: 'common' },
    { key: '微软服务', first: ['节点选择', '自动选择', '全球直连'], poolKey: 'common' },
    { key: '谷歌商店', first: playStoreServiceChoices, poolKey: 'playStore' },
    { key: 'AI', first: ['国外AI故障转移', '节点选择'], poolKey: 'aiOnly' }
  ];
  const BUSINESS_SERVICE_HEAD = [
    ['YouTube', iconMap.youtube], ['TikTok', iconMap.tiktok], ['Meta', iconMap.meta],
    ['Twitter', iconMap.twitter], ['Niconico', iconMap.niconico], ['日韩生态区', iconMap.jpkr],
    ['Spotify', iconMap.spotify], ['Telegram', iconMap.telegram], ['Google', iconMap.google],
    ['谷歌商店', iconMap.playstore], ['微软服务', iconMap.microsoft]
  ];
  const BUSINESS_SERVICE_TAIL = [
    ['翻译服务', iconMap.translate], ['Twitch', iconMap.twitch], ['GitHub', iconMap.github],
    ['AI', iconMap.ai], ['国外游戏', iconMap.game], ['社交信息流', iconMap.social],
    ['去中心化平台', iconMap.decentralized], ['Discord', iconMap.discord]
  ];
  const BUSINESS_SERVICE_ICON_DEFS = BUSINESS_SERVICE_HEAD.concat(BUSINESS_SERVICE_TAIL);
  const businessChoiceMap = makeBusinessChoiceMap(BUSINESS_CHOICE_DEFS, CHOICE_POOLS);
  const businessServiceGroupDefs = makeSelectGroupDefList(BUSINESS_SERVICE_ICON_DEFS.map(entry => ({
    name: entry[0],
    icon: entry[1],
    choices: businessChoiceMap[entry[0]]
  })));

  const CHOICE_GROUPS = {
    streaming: usableChoices(CHOICE_POOLS.streaming),
    taiwanMedia: usableChoices(CHOICE_POOLS.taiwanMedia),
    riskControl: usableChoices(CHOICE_POOLS.riskControl)
  };
  const preferredHomeFailover = [
    '香港家宽', '香港自动', '新加坡家宽', '新加坡自动',
    '日本家宽', '日本自动', '韩国家宽', '韩国自动',
    '美国家宽', '美国自动', '欧盟家宽', '欧盟自动'
  ];
  const availableHomeAutoNames = new Set(regionHomeAutoNames);
  const homeFailoverChoices = unique([
    ...preferredHomeFailover.filter(name => availableHomeAutoNames.has(name)),
    ...regionHomeAutoNames.filter(name => !preferredHomeFailover.includes(name))
  ].filter(Boolean));

  // 主分组候选项
  const MAIN_CHOICE_POOL_DEFS = [
    usableChoiceDef('nodeSelection', ['节点选择', '自动选择', '负载均衡', '全球手动'], fallbackNames, globalFeatureChoices, fusionVisibleRegions),
    usableChoiceDef('systemService', ['节点选择', '自动选择', '全球手动', '全球直连'], fusionVisibleRegions, allProxyNames),
    // 国内服务放行内置直连
    makeScopedChoiceDef('domesticService', '国内服务', ['全球直连'], builtInDirectChoiceNames, domesticChoices.filter(x => x !== '全球直连' && !directChoices.includes(x))),

    // 最终兜底候选
    usableChoiceDef('finalFallback', ['自动选择', '全球手动'], fallbackNames.filter(name => !excludedFallbackChoiceSet.has(name)), fusionVisibleRegions)
  ];
  const MAIN_CHOICE_POOLS = buildChoicePoolsFromDefs(MAIN_CHOICE_POOL_DEFS);
  // Choice Scope 自检
  const domesticServiceScopeDef = MAIN_CHOICE_POOL_DEFS.find(def => def && def.key === 'domesticService');
  if (!domesticServiceScopeDef || !domesticServiceScopeDef.scope || !domesticServiceScopeDef.scope.allowedNameSet) {
    throw new Error('choice scope health check failed: domesticService def missing scope metadata');
  }
  for (let i = 0; i < builtInDirectChoiceNames.length; i++) {
    const name = builtInDirectChoiceNames[i];
    if (!domesticServiceScopeDef.scope.allowedNameSet.has(name)) {
      throw new Error('choice scope health check failed: domesticService scope missing extra allowed choice: ' + name);
    }
  }
  // 附加显示组
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
  // 服务分流组
  const RISK_CONTROL_SERVICE_GROUP = makeSelectGroupDef('风控安全', iconMap.riskControl, CHOICE_GROUPS.riskControl, []);
  const DOMESTIC_SERVICE_GROUP = makeSelectGroupDef('国内服务', iconMap.china, MAIN_CHOICE_POOLS.domesticService, [], '国内服务');
  const SERVICE_GROUP_BASE_DEFS = makeSelectGroupDefList([
    RISK_CONTROL_SERVICE_GROUP,
    DOMESTIC_SERVICE_GROUP,
    { name: '流媒体', icon: iconMap.streaming, choices: CHOICE_GROUPS.streaming },
    { name: '台湾媒体', icon: iconMap.taiwanMedia, choices: CHOICE_GROUPS.taiwanMedia },
    { name: 'FCM', icon: iconMap.fcm, choices: MAIN_CHOICE_POOLS.systemService },
    { name: 'Apple', icon: iconMap.apple, choices: MAIN_CHOICE_POOLS.systemService },
    { name: 'Cloudflare', icon: iconMap.cloudflare || iconMap.global, choices: cloudflareGroupChoices }
  ]);
  const serviceGroupDefs = makeSelectGroupDefList([
    RISK_CONTROL_SERVICE_GROUP,
    ...businessServiceGroupDefs.slice(0, BUSINESS_SERVICE_HEAD.length),
    DOMESTIC_SERVICE_GROUP,
    ...businessServiceGroupDefs.slice(BUSINESS_SERVICE_HEAD.length),
    ...SERVICE_GROUP_BASE_DEFS.slice(2)
  ]);

  // 工具组
  const UTILITY_GROUP_PRESET_DEFS = makeSelectGroupDefList([
    { name: '广告拦截', icon: iconMap.adblock, choices: ['REJECT', 'REJECT-DROP', 'PASS'], extraDefaults: ['REJECT-DROP'] },
    { name: '跟踪分析', icon: qIcon('Reject'), choices: ['REJECT', 'DIRECT', '自动选择'], extraDefaults: ['REJECT'] },
    { name: '全球直连', icon: iconMap.direct, choices: ['DIRECT'], extraDefaults: [] },
    { name: '漏网之鱼', icon: iconMap.final, choices: MAIN_CHOICE_POOLS.finalFallback }
  ]);
  const utilityGroupDefs = makeSelectGroupDefList([
    { name: '下载专用组', icon: iconMap.download || iconMap.fallback, choices: downloadGroupChoices.filter(name => name !== 'DIRECT') },
    ...UTILITY_GROUP_PRESET_DEFS
  ]);

  const defaultAutoGroup = makeUrlTestGroup('自动选择', iconMap.auto, allProxyNames, 300, 50);
  const autoGroup = defaultAutoGroup || {
    name: '自动选择',
    type: 'select',
    icon: iconMap.auto,
    proxies: sanitizeChoiceList(usableChoices(allProxyNames), usableChoices(['全球手动', 'DIRECT']))
  };
  const homeFailoverGroup = makeFallbackGroup('家宽故障转移', iconMap.flare, usableChoices(homeFailoverChoices), usableChoices(['自动兜底']));

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
      // 隐藏辅助组：下载组、谷歌商店专用组不在主列表展示。
      const shouldHide = /^(香港|台湾|日本|韩国|新加坡|美国|欧盟)下载$/.test(group.name)
        || group.name === '谷歌商店专用';
      if (shouldHide) {
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
  // 包含真实节点名、已生成的组名、组级额外放行项，以及 DIRECT / REJECT 等内建动作。
  const availableChoiceNameSet = buildAvailableChoiceNameSetFromGroups(finalizedProxyGroups);
  // realChoiceCandidateSet：只包含真实节点名与脚本显式注册为“真实候选”的额外名字，用来判断当前组是否仍有可保留候选。
  const realChoiceCandidateSet = buildRealChoiceCandidateSet();
  assertChoiceNamesRegistered(builtInDirectChoiceNames, 'scoped choice');
  function hasRealChoiceCandidates(list) {
    // 只要候选中还存在一个真实节点，就说明这个组不需要走语义兜底。
    return asArray(list).some(name => realChoiceCandidateSet.has(name));
  }

  function finalizeGroupChoices(group, candidates) {
    // candidates 是已经过基础过滤后的候选列表；这里再按组类型决定最终落盘形式。
    const proxies = asArray(candidates);
    const fallbackChoices = getGroupFallbackChoices(group.name);
    const hasRealChoices = hasRealChoiceCandidates(proxies);
    // 全球直连组固定只保留 DIRECT，避免被旧配置或别处逻辑污染。
    if (group.name === '全球直连') return ['DIRECT'];
    // 全球手动组若被清空，则回填全部真实节点；极端情况下至少保留 DIRECT，避免 select 组缺失 proxies。
    if (group.name === '全球手动') return ensureGroupList(proxies.length ? proxies : allProxyNames, ['DIRECT']);
    // fallback 组只保留构建阶段明确给它的候选；这里不额外补“自动选择”。
    // 如果清洗后彻底为空，ensureGroupList(..., []) 会退到 DIRECT，至少保证配置仍可导入。
    if (group.type === 'fallback') return ensureGroupList(proxies, []);
    // 只有主自动选择组允许在没有真实节点时走语义兜底。
    if (group.name === '自动选择') {
      return hasRealChoices ? proxies : ensureGroupList(proxies, fallbackChoices);
    }
    // 其他 url-test / load-balance 组如果没有真实节点，应直接视为空组，后续删除。
    // 谷歌商店专用组按设计承载地区自动组，只要仍有有效成员就保留。
    if (group.type === 'url-test' || group.type === 'load-balance') {
      if (PLAY_STORE_SPECIAL_GROUP_NAMES.includes(group.name)) return proxies.length ? proxies : [];
      return hasRealChoices ? proxies : [];
    }

    // 其余 select / 行为组：有真实节点就直接保留；没真实节点才走语义兜底。
    return hasRealChoices ? proxies : sanitizeChoiceList(proxies, fallbackChoices);
  }
  function shouldDropEmptyGroup(group) {
    if (!group || !group.name) return true;
    if (!Array.isArray(group.proxies)) return false;
    
    // 核心组永不删除
    const coreGroups = ['自动选择', '全球手动', '全球直连'];
    if (coreGroups.includes(group.name)) return false;
    
    // 测速/负载组通常必须包含真实节点；谷歌商店专用组允许包含地区自动组。
    if (group.type === 'url-test' || group.type === 'load-balance') {
      if (PLAY_STORE_SPECIAL_GROUP_NAMES.includes(group.name)) return !asArray(group.proxies).length;
      return !hasRealChoiceCandidates(group.proxies);
    }

    return false;
  }

  // Final Choice Registry
  // cleanup 阶段统一从这里获取“最终承认存在的名字”，避免把组级额外候选再次误删。
  function getAllScopedChoiceNames() {
    const merged = [];
    const keys = Object.keys(GROUP_SCOPED_CHOICE_REGISTRY);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      merged.push(...asArray(GROUP_SCOPED_CHOICE_REGISTRY[key]));
    }
    return unique(merged.filter(Boolean));
  }
  function buildRealChoiceCandidateSet() {
    return makeNameSet(allProxyNames.concat(
      getAllScopedChoiceNames(),
      ['谷歌商店专用']
    ));
  }

  function assertChoiceNamesRegistered(list, label) {
    const candidates = asArray(list);
    const registry = buildRealChoiceCandidateSet();
    for (let i = 0; i < candidates.length; i++) {
      const name = candidates[i];
      if (!name || registry.has(name)) continue;
      throw new Error('final choice registry health check failed: missing ' + label + ': ' + name);
    }
  }
  // 最终清洗可见名集合：除真实节点与组名外，还要包含脚本注入的内置直连名。
  // 否则前面已放行的三直连会在 cleanup 阶段再次被当成“无效候选”删除。
  function buildAvailableChoiceNameSetFromGroups(groups) {
    const names = buildRealChoiceCandidateSet();
    const list = asArray(groups);

    for (let i = 0; i < list.length; i++) {
      const group = list[i];
      if (group && group.name) names.add(group.name);
    }
    for (const name of BUILTIN_CHOICE_NAMES) names.add(name);
    return names;
  }
  function runProxyGroupCleanupPass(groups, availableChoiceNameSet) {
    // 第一步：过滤无效候选并最终化选项
    const cleanedGroups = asArray(groups)
      .map(group => {
        if (!group || !Array.isArray(group.proxies) || !group.name) return group;
        const filteredProxies = filterAvailableChoiceNames(group.proxies, availableChoiceNameSet, group.name);
        return Object.assign({}, group, { proxies: finalizeGroupChoices(group, filteredProxies) });
      })
      .filter(group => !shouldDropEmptyGroup(group));

    // 构建组映射表
    const groupMap = Object.create(null);
    for (let i = 0; i < cleanedGroups.length; i++) {
      const group = cleanedGroups[i];
      if (group && group.name) groupMap[group.name] = group;
    }

    // 第二步：切除自引用和互环引用
    return cleanedGroups
      .map(group => {
        if (!group || !Array.isArray(group.proxies) || !group.name) return group;
        const nextProxies = [];
        for (let i = 0; i < group.proxies.length; i++) {
          const proxyName = group.proxies[i];
          const targetGroup = groupMap[proxyName];
          
          // 不是组引用，直接保留
          if (!targetGroup || !Array.isArray(targetGroup.proxies)) {
            nextProxies.push(proxyName);
            continue;
          }
          
          // 自引用 A -> A：丢弃
          if (targetGroup.name === group.name) continue;
          
          // 互环引用 A -> B && B -> A：丢弃
          if (targetGroup.proxies.includes(group.name)) continue;
          
          nextProxies.push(proxyName);
        }
        
        return Object.assign({}, group, { proxies: finalizeGroupChoices(group, nextProxies) });
      })
      .filter(group => !shouldDropEmptyGroup(group));
  }

  function getProxyGroupSignature(groups) {
    return JSON.stringify(asArray(groups).map(group => {
      if (!group || !group.name) return null;
      return {
        name: group.name,
        type: group.type || '',
        proxies: Array.isArray(group.proxies) ? group.proxies.slice() : null
      };
    }));
  }

  // 稳定化清洗：反复执行“删失效引用 -> 切环 -> 删空自动组”，直到分组关系不再变化。
  // 这样即使存在 A 引用 B、B 删除后又影响 C 的级联场景，也不会残留 not found。
  let stabilizedProxyGroups = finalizedProxyGroups.slice();
  let previousSignature = '';
  for (let round = 0; round < 8; round++) {
    const availableChoiceNameSet = buildAvailableChoiceNameSetFromGroups(stabilizedProxyGroups);
    stabilizedProxyGroups = runProxyGroupCleanupPass(stabilizedProxyGroups, availableChoiceNameSet);
    const nextAvailableChoiceNameSet = buildAvailableChoiceNameSetFromGroups(stabilizedProxyGroups);
    stabilizedProxyGroups = runProxyGroupCleanupPass(stabilizedProxyGroups, nextAvailableChoiceNameSet);
    const signature = getProxyGroupSignature(stabilizedProxyGroups);

    if (signature === previousSignature) break;
    previousSignature = signature;
  }
  config['proxy-groups'] = stabilizedProxyGroups;

  // 最终分组自检：国内服务如果存在，必须仍然保留三直连可见性，避免回归到“前面放行、后面 cleanup 删除”。
  const domesticServiceGroup = stabilizedProxyGroups.find(group => group && group.name === '国内服务');
  if (domesticServiceGroup && Array.isArray(domesticServiceGroup.proxies)) {
    for (let i = 0; i < builtInDirectChoiceNames.length; i++) {
      const name = builtInDirectChoiceNames[i];

      if (!domesticServiceGroup.proxies.includes(name)) {
        throw new Error('proxy group health check failed: domesticService missing built-in direct choice after cleanup: ' + name);
      }
    }
  }

  // 规则目标校验：规则里引用的策略名必须真的存在。
  // 这是规则区最常见的维护事故之一：改了组名，却忘了同步规则目标。
  const availableRuleTargets = makeNameSet(config['proxy-groups'].map(group => group && group.name));
  for (const name of BUILTIN_CHOICE_NAMES) availableRuleTargets.add(name);
  const RULE_TRAILING_FLAGS = new Set(['NO-RESOLVE', 'SRC', 'DST', 'UDP', 'TCP']);
  // 规则解析工具：统一处理规则字符串的解析、目标提取和标识计算
  function parseRuleParts(rule) {
    if (typeof rule !== 'string') return null;
    const parts = rule.split(',').map(p => String(p || '').trim());
    return parts.length ? parts : null;
  }
  
  function extractRulePolicyTarget(ruleOrParts) {
    const parts = Array.isArray(ruleOrParts) ? ruleOrParts : parseRuleParts(ruleOrParts);
    if (!parts || parts.length < 3) return null;
    
    // 从后往前找第一个非标志位的值作为目标
    for (let i = parts.length - 1; i >= 2; i--) {
      const value = parts[i];
      if (value && !RULE_TRAILING_FLAGS.has(value.toUpperCase())) return value;
    }
    return null;
  }

  function extractRuleMatchValue(ruleOrParts) {
    const parts = Array.isArray(ruleOrParts) ? ruleOrParts : parseRuleParts(ruleOrParts);
    if (!parts || parts.length < 2) return null;
    
    return {
      type: parts[0].toUpperCase(),
      value: parts[1],
      target: extractRulePolicyTarget(parts)
    };
  }
  
  function getRuleIdentityKey(rule) {
    const parts = parseRuleParts(rule);
    if (!parts) return null;
    
    const meta = extractRuleMatchValue(parts);
    if (!meta || !meta.type || !meta.value) return `RAW@@${rule}`;
    
    const extraParts = parts.length > 3 ? parts.slice(3).join(',') : '';
    return `${meta.type}@@${meta.value}@@${extraParts}`;
  }
  function buildRuleDiagnostics(ruleSetDefs, mergedRules) {
    const diagnostics = {
      totalSourceRules: 0,
      totalMergedRules: Array.isArray(mergedRules) ? mergedRules.length : 0,
      dedupedRuleCount: 0,
      ruleSetSizes: [],
      mergedRuleTypeCounts: {},
      duplicateRulesAcrossSets: [],
      overriddenRuleTargets: [],
      redundantDomainCoveredBySuffix: [],
      riskyShortKeywords: [],
      broadKeywordOverlapHints: []
    };
    const exactRuleOwners = new Map();
    const normalizedMatchOwners = new Map();

    // 第一轮：收集规则所有权和匹配信息
    for (const def of ruleSetDefs) {
      const rules = Array.isArray(def && def.rules) ? def.rules : [];
      const validRules = rules.filter(rule => typeof rule === 'string');
      
      diagnostics.totalSourceRules += validRules.length;
      diagnostics.ruleSetSizes.push({ name: def && def.name ? def.name : 'UNKNOWN', count: validRules.length });
      
      for (const rule of validRules) {
        // 记录完整规则的所有权
        if (!exactRuleOwners.has(rule)) exactRuleOwners.set(rule, []);
        exactRuleOwners.get(rule).push(def.name);

        // 记录匹配键的所有权（用于检测目标覆盖）
        const meta = extractRuleMatchValue(rule);
        if (!meta || !meta.type || !meta.value || !meta.target) continue;
        
        const ownerKey = `${meta.type}@@${meta.value}`;
        if (!normalizedMatchOwners.has(ownerKey)) normalizedMatchOwners.set(ownerKey, []);
        normalizedMatchOwners.get(ownerKey).push({ target: meta.target, set: def.name, rule });
      }
    }

    // 第二轮：检测跨规则集的重复和覆盖
    for (const [rule, owners] of exactRuleOwners.entries()) {
      const uniqOwners = Array.from(new Set(owners));
      if (uniqOwners.length > 1) {
        diagnostics.duplicateRulesAcrossSets.push({ rule, sets: uniqOwners });
      }
    }
    
    for (const [matchKey, entries] of normalizedMatchOwners.entries()) {
      const uniqTargets = Array.from(new Set(entries.map(item => item.target)));
      if (uniqTargets.length > 1) {
        diagnostics.overriddenRuleTargets.push({
          matchKey,
          targets: uniqTargets,
          entries: entries.slice(0, 10),
          effectiveTarget: entries[entries.length - 1].target
        });
      }
    }

    diagnostics.dedupedRuleCount = Math.max(0, diagnostics.totalSourceRules - diagnostics.totalMergedRules);
    diagnostics.ruleSetSizes.sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name)));

    // 第三轮：分析合并后的规则
    const suffixRuleMap = new Map();
    const keywordRules = [];
    
    for (const rule of mergedRules) {
      const meta = extractRuleMatchValue(rule);
      if (!meta || !meta.type || !meta.value || !meta.target) continue;
      
      // 统计规则类型
      diagnostics.mergedRuleTypeCounts[meta.type] = (diagnostics.mergedRuleTypeCounts[meta.type] || 0) + 1;
      
      // 收集后缀和关键词规则用于后续检查
      if (meta.type === 'DOMAIN-SUFFIX') suffixRuleMap.set(`${meta.value}@@${meta.target}`, rule);
      if (meta.type === 'DOMAIN-KEYWORD') keywordRules.push(meta);
    }

    // 第四轮：检测冗余规则
    // 检测被后缀规则覆盖的域名规则
    for (const rule of mergedRules) {
      const meta = extractRuleMatchValue(rule);
      if (!meta || meta.type !== 'DOMAIN' || !meta.value || !meta.target) continue;
      
      if (suffixRuleMap.has(`${meta.value}@@${meta.target}`)) {
        diagnostics.redundantDomainCoveredBySuffix.push(rule);
      }
    }

    // 检测风险关键词
    for (const meta of keywordRules) {
      if (meta.value && meta.value.length <= 2) {
        diagnostics.riskyShortKeywords.push(`DOMAIN-KEYWORD,${meta.value},${meta.target}`);
      }
    }
    
    // 检测关键词重叠
    for (let i = 0; i < keywordRules.length; i++) {
      for (let j = i + 1; j < keywordRules.length; j++) {
        const a = keywordRules[i];
        const b = keywordRules[j];
        
        // 同目标或空值跳过
        if (a.target === b.target || !a.value || !b.value) continue;
        
        const av = a.value.toLowerCase();
        const bv = b.value.toLowerCase();
        if (av === bv) continue;
        
        // 检测包含关系
        if (av.length >= 4 && bv.includes(av)) {
          diagnostics.broadKeywordOverlapHints.push({ broader: a, narrower: b });
        } else if (bv.length >= 4 && av.includes(bv)) {
          diagnostics.broadKeywordOverlapHints.push({ broader: b, narrower: a });
        }
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
  const RULES_YOUTUBE = [
    ...ruleProcess(['com.google.android.youtube', 'app.rvx.android.youtube', 'app.rvx.android.apps.youtube', 'app.revanced.android.youtube', 'app.morphe.android.youtube', 'com.google.android.apps.youtube.music'], 'YouTube'),
    ...ruleDomain(['www.youtube.com', 'm.youtube.com', 'youtubeembeddedplayer.googleapis.com', 'jnn-pa.googleapis.com', 'video.google.com'], 'YouTube'),
    ...ruleSuffix(['youtube.com', 'youtubei.googleapis.com', 'youtube.googleapis.com', 'googlevideo.com', 'ytimg.com', 'ggpht.com', 'youtu.be'], 'YouTube')
  ];
  // 应用进程规则
  const RULES_APP_PROCESS = [
    ...ruleProcess(['ai.perplexity.app.android', 'com.google.android.apps.bard'], 'AI'),
    ...ruleProcess(['com.spotify.music'], 'Spotify'),
    ...ruleProcess(['com.netflix.mediaclient', 'com.disney.disneyplus', 'com.amazon.avod.thirdpartyclient', 'com.hulu.plus', 'com.hbo.hbonow', 'com.hbo.max'], '流媒体'),
    ...ruleProcess(['com.discord'], 'Discord'),
    ...ruleProcess(['com.twitter.android'], 'Twitter'),
    ...ruleProcess(['com.reddit.frontpage'], '社交信息流'),
    ...ruleProcess(['com.valvesoftware.android.steam.community', 'com.microsoft.xboxone.smartglass'], '国外游戏'),
    ...ruleProcess(['com.google.android.apps.translate', 'com.deepl.mobiletranslator'], '翻译服务'),
    ...ruleProcess(['com.google.android.gms', 'com.google.android.gsf', 'com.google.android.apps.maps'], 'Google'),
    ...ruleProcess(['com.deniscerri.ytdl', 'com.deniscerri.ytdlnis', 'io.github.deniscerri.ytdlnis'], '下载专用组')
  ];

  // 翻译服务规则
  const RULES_TRANSLATION = [
    ...ruleDomain(['translate.googleapis.com','translation.googleapis.com','translate-pa.googleapis.com','translate.google.com','translate.google.cn','www.deepl.com','api.deepl.com','www2.deepl.com','dict.deepl.com','static.deepl.com'], '翻译服务'),
    ...ruleSuffix(['translate.googleapis.com','translation.googleapis.com','translate-pa.googleapis.com','translate.google.com','translate.google.cn','deepl.com','deeplpro.com','deeplusercontent.com','linguee.com'], '翻译服务')
  ];

  // 广告拦截规则
  const RULES_ADBLOCK = [

    'DOMAIN,incoming.telemetry.mozilla.org,REJECT-DROP',
    'DOMAIN-REGEX,^(log|mon)[0-9A-Za-z.-]*\.tiktokv\.com$,REJECT',
    'PROCESS-NAME,TikTok.Mod.Jaggu,TikTok',
    'PROCESS-NAME-REGEX,(?i)^TikTok\.Mod\.Jaggu(?::.*)?$,TikTok',
    'GEOSITE,category-ads-all,广告拦截',
    // 关键词拦截只保留高置信度广告词
    ...ruleKeyword(['adserver','adnetwork','adtech','adsdk','adapi','adtrack','adclick','adcount','adstat','adload','adsystem','impression','conversion','atdmt','adform','taboola','popunder','clickhubs','adriver'], '广告拦截'),
    ...ruleSuffix(adguardDomains(), '广告拦截')
  ];

  // 风控安全规则
  const RULES_RISK_SECURITY = ruleSuffix(['accounts.google.com', 'myaccount.google.com', 'ogs.google.com', 'androidauth.googleapis.com', 'oauthaccountmanager.googleapis.com', 'oauth2.googleapis.com', 'securetoken.googleapis.com', 'identitytoolkit.googleapis.com', 'firebaseauth.googleapis.com', 'accounts.youtube.com', 'families.google.com', 'accounts.google.cn', 'workspace.google.com', 'admin.google.com', 'passwords.google.com', 'notifications.google.com', 'recaptcha.net', 'recaptcha-enterprise.google.com', 'hcaptcha.com', 'newassets.hcaptcha.com', 'account.amazon.com', 'payments.amazon.com', 'paypal.com', 'paypal.com.hk', 'paypal.com.sg', 'paypal.me', 'paypal.hk', 'paypal.jp', 'paypal.us', 'paypalservice.com', 'paypalcredit.com', 'braintreegateway.com', 'braintreepayments.com', 'card.io', 'paypalhere.com', 'venmo.com', 'xoom.com', 'stripe.com', 'stripe.network', 'stripe-terminal-local-reader.net', 'checkout.com', 'checkoutcdn.com', 'checkoutshopper.com', 'payoneer.com', 'airwallex.com', 'worldpay.com', 'skrill.com', 'neteller.com', 'wise.com', 'transferwise.com', 'hsbc.com', 'interactivebrokers.com', 'adyen.com', 'visa.com', 'mastercard.com', 'amex.com', 'revolut.com', 'ibkr.com', 'schwab.com', 'binance.com', 'binance.us', 'bnbstatic.com', 'binanceapi.com', 'coinbase.com', 'okx.com', 'oklink.com', 'okx-dns.com', 'okx-dns1.com', 'okx-dns2.com', 'bybit.com', 'bytick.com', 'byapis.com', 'bycsi.com', 'bybit-global.com', 'bybitglobal.com', 'gate.io', 'gateimg.com', 'gatedata.org', 'kucoin.com', 'kucoin.plus', 'kraken.com', 'bitget.com', 'mexc.com', 'huobi.com', 'htx.com', 'trustwallet.com', 'walletconnect.com', 'walletconnect.org', 'ethereum.org', 'etherscan.io', 'opensea.io', 'uniswap.org', 'safepal.com', 'isafepal.com', 'trezor.io', 'ledger.com', 'hyperliquid.xyz', 'polymarket.com', 'dydx.exchange', 'bitfinex.com', 'bitstamp.net', 'deribit.com', 'bitflyer.com', 'onekey.so', 'onekeycn.com', 'redotpay.com', 'login.live.com', 'login.microsoftonline.com', 'account.live.com', 'account.microsoft.com', 'signup.live.com', 'appleid.apple.com', 'appleaccount.apple.com', 'idmsa.apple.com', 'idms-apple.com', 'iforgot.apple.com', 'signin.aws.amazon.com', 'dash.cloudflare.com', 'challenges.cloudflare.com', 'turnstile.cloudflare.com', 'assets.cloudflare.com', 'authy.com'], '风控安全');
  // 跟踪分析规则：覆盖 Tracker、遥测、统计与分析域名。
  const RULES_TRACKER = [
    'GEOSITE,tracker,跟踪分析',
    ...ruleKeyword(['tracker', 'analytics', 'telemetry', 'metrics', 'logging', 'heatmap', 'segment', 'amplitude', 'mixpanel', 'sentry', 'datadog', 'newrelic'], '跟踪分析'),
    ...ruleSuffix(['google-analytics.com', 'googletagmanager.com'], '跟踪分析')
  ];
  // 风控与系统规则：覆盖 FCM、Play Store、Google AI、下载与高敏感登录链路。
  const RULES_RISK_CONTROL_FCM = [
    ...ruleSuffix(['fcm.googleapis.com', 'fcm-xmpp.googleapis.com', 'mtalk.google.com', 'mtalk4.google.com', 'mtalk-staging.google.com', 'fcmtoken.googleapis.com'], 'FCM'),
    'DST-PORT,5228,FCM',
    'DST-PORT,5229,FCM',
    'DST-PORT,5230,FCM'
  ];
  const RULES_RISK_CONTROL_PLAY_STORE = [
    ...ruleProcess(['com.android.vending', 'com.android.providers.downloads', 'com.android.providers.downloads.ui'], '谷歌商店'),
    ...ruleSuffix(['play.google.com', 'play.googleapis.com', 'play-fe.googleapis.com', 'play-pa.googleapis.com', 'playatoms-pa.googleapis.com', 'play-apps-fe-pa.googleapis.com', 'play-apps-download-frontend.googleapis.com', 'play-lh.googleusercontent.com', 'play-games.googleusercontent.com', 'market.android.com', 'android.googleapis.com', 'android.clients.google.com', 'android.clients.google.com.cn', 'clientservices.googleapis.com', 'dl.google.com', 'dl.l.google.com', 'gvt1.com', 'gvt2.com', 'gvt3.com', 'xn--ngstr-lra8j.com', 'xn--ngstr-cn-8za9o.com'], '谷歌商店')
  ];
  const RULES_RISK_CONTROL_YOUTUBE_EXTRA = ruleSuffix(['youtube-nocookie.com', 'yt.be', 'yt3.ggpht.com', 'youtubekids.com', 'sponsor.ajay.app', 'returnyoutubedislikeapi.com'], 'YouTube');
  const RULES_RISK_CONTROL_GOOGLE_AI = ruleSuffix(['gemini.google.com', 'generativeai.google', 'generativelanguage.googleapis.com', 'proactivebackend-pa.googleapis.com', 'notebooklm.google.com'], 'AI');
  const RULES_RISK_CONTROL_DOWNLOAD = ruleSuffix(['dl.googleusercontent.com', 'redirector.gvt1.com', 'update.googleapis.com'], '下载专用组');
  const RULES_RISK_CONTROL = [
    ...RULES_RISK_CONTROL_FCM,
    ...RULES_RISK_CONTROL_PLAY_STORE,
    ...RULES_RISK_CONTROL_YOUTUBE_EXTRA,
    ...RULES_RISK_CONTROL_GOOGLE_AI,
    ...RULES_RISK_CONTROL_DOWNLOAD,
  ];
  // RULES_AI_EXTRA
  // AI / TikTok / 风控 / 流媒体补充规则
  const RULES_AI_EXTRA = [
    ...ruleProcess(['ai.x.grok', 'ai.cici.android', 'com.ciciai.app', 'com.coze.android', 'ai.coze.app', 'com.openai.chatgpt', 'com.openai.chat'], 'AI'),
    ...ruleSuffix(['api.openai.com', 'auth0.openai.com', 'cdn.openai.com', 'chat.openai.com', 'chatgpt.com', 'files.oaiusercontent.com', 'livekit.cloud', 'openai.com', 'anthropic.com', 'statsigapi.net'], 'AI'),
    'PROCESS-NAME-REGEX,(?i).*(ciciai|cici|coze).*,AI',
    'PROCESS-NAME-REGEX,(?i).*(openai|chatgpt).*,AI'
  ];
  const RULES_TIKTOK_EXTRA = [
    ...ruleDomain(['frontier.tiktokv.com', 'p16-tiktokcdn-com.akamaized.net', 'rezvorck.github.io', 'update.9mod.com', 'vcs.zijieapi.com'], 'TikTok'),
    ...ruleKeyword(['mssdk', 'tiktokcdn', 'webcast-frontier'], 'TikTok'),
    ...ruleSuffix(['bytegecko-i18n.com', 'byteintlapi.com', 'ipstatp.com', 'isnssdk.com', 'sgpstatp.com', 'snssdk.com', 'tik-tokapi.com', 'tiktok-row.org', 'tiktokd.net', 'tiktokmusic.app', 'ttwebview.com', 'ttwstatic.com'], 'TikTok')
  ];
  const RULES_FINANCE_EXTRA = [
    ...ruleProcess(['money.boku.android', 'com.ifast.gb', 'com.okinc.okex.gp', 'team.noones.mobilemessenger'], '风控安全'),
    ...ruleDomain(['communication-app.ifastgb.com', 'fpjs.checkout.com', 'fpjscache.checkout.com', 'auth.noones.com', 'api.noones.com', 'static.noones.com', 'sentry.noones.com', 'noonessupport.zendesk.com', 'risk.checkout.com', 'secure.fundsupermart.com', 'sentry.ifastgb.com', 'static.ifastgb.com', 'stest.zimperium.com', 'www.ifastgb.com', 'www.noones.com'], '风控安全'),
    ...ruleSuffix(['fundsupermart.com', 'ifastgb.com', 'neverless.com', 'noones.com', 'okex.com', 'ouyich.biz', 'ouyich.show', 'cnouyi.pizza'], '风控安全'),
    'PROCESS-NAME-REGEX,(?i)^io\.metamask(?::.*)?$,风控安全',
    'PROCESS-NAME-REGEX,(?i)^com\.okinc\.okex\.gp(?::.*)?$,风控安全'
  ];
  const RULES_STREAMING_EXTRA = [
    ...ruleProcess(['com.oumi.utility.media.hub'], '流媒体'),
    ...ruleDomain(['api.7littlemen.com', 'bps8m.onyra.cc', 'image.tmdb.org', 'stream.onyra.uk', 'vh.api.okaapps.com', 'vh.image.okaapps.com', 'vh.image1.okaapps.com'], '流媒体'),
    ...ruleSuffix(['okaapps.com', 'onyra.cc', 'onyra.uk', 'premiumize.me'], '流媒体'),
    'IP-CIDR,121.43.145.95/32,流媒体,no-resolve'
  ];
  const RULES_AI_TIKTOK_EXTRA = [
    ...RULES_AI_EXTRA,
    ...RULES_TIKTOK_EXTRA,
    ...RULES_FINANCE_EXTRA,
    ...RULES_STREAMING_EXTRA,
  ];

  // 国内服务规则
  const RULES_DOMESTIC = [
    'GEOSITE,CN,国内服务',
    ...ruleSuffix(['wechat.com', 'weixin.qq.com', 'qq.com', 'gtimg.com', 'qpic.cn', 'tenpay.com', 'qqvideo.tc.qq.com', 'v.qq.com', 'hunyuan.tencent.com', 'yuanbao.tencent.com', 'alicdn.com', 'aliyun.com', 'aliyuncs.com', 'taobao.com', 'tmall.com', 'alipay.com', 'alipayobjects.com', 'youku.com', 'youkuimg.com', 'tongyi.com', 'tongyi.aliyun.com', 'jd.com', 'jdstatic.com', 'pinduoduo.com', 'smzdm.com', 'meituan.com', 'dianping.com', 'ctrip.com', '12306.cn', 'bilibili.com', 'biliapi.com', 'biliimg.com', 'bilivideo.com', 'bilivideo.cn', 'hdslb.com', 'iqiyi.com', 'iqiyipic.com', 'mgtv.com', 'douyin.com', 'douyincdn.com', 'bytecdn.cn', 'byteimg.com', 'byted.org', 'iesdouyin.com', 'amemv.com', 'doubao.com', 'volces.com', 'kuaishou.com', 'ksapisrv.com', 'kspkg.com', 'ksyuncdn.com', 'zhihu.com', 'zhimg.com', 'weibo.com', 'weibocdn.com', 'xiaohongshu.com', 'xhscdn.com', 'xhsglobal.com', 'baidu.com', 'bdimg.com', 'bdstatic.com', 'qianfan.baidu.com', 'erniebot.com', 'yiyan.baidu.com', '163.com', '126.net', '126.com', 'sina.com.cn', 'sohu.com', 'deepseek.com', 'deepseek.cn', 'moonshot.cn', 'kimi.com', 'minimaxi.com', 'xinghuo.xfyun.cn', 'sensenova.cn'], '国内服务')
  ];
  const RULES_APPLE_MEDIA = ruleSuffix(['tv.apple.com', 'video.apple.com'], '流媒体');
  // Apple 生态规则
  const RULES_APPLE = [
    ...ruleDomain(['time.apple.com'], 'Apple'),
    ...ruleSuffix(['apple.com', 'icloud.com', 'icloud-content.com', 'itunes.apple.com', 'apps.apple.com', 'mzstatic.com', 'apple-dns.net', 'apple-mapkit.com', 'cdn-apple.com', 'apple.news', 'applemusic.com', 'appstore.com'], 'Apple')
  ];
  // 全球 AI 规则
  const RULES_AI_GLOBAL = ruleSuffix(['oaistatic.com', 'oaiusercontent.com', 'openaiusercontent.com', 'chatgpt.livekit.cloud', 'openaiapi-site.azureedge.net', 'ai.com', 'claude.ai', 'claudeusercontent.com', 'anthropiccdn.com', 'perplexity.ai', 'perplexity.com', 'pplx.ai', 'groq.com', 'grok.com', 'x.ai', 'api.x.ai', 'mistral.ai', 'lechat.ai', 'poe.com', 'poecdn.net', 'stability.ai', 'character.ai', 'c.ai', 'midjourney.com'], 'AI');
  // 去中心化与 Cloudflare 规则
  const RULES_DECENTRALIZED_AND_CLOUDFLARE = [
    ...ruleProcess(['io.metamask', 'io.metamask:bridge', 'io.metamask:fileprovider'], '去中心化平台'),
    ...ruleDomain(['api2.branch.io', 'cdn.branch.io'], '去中心化平台'),
    ...ruleSuffix(['metamask.io'], '去中心化平台'),
    ...ruleDomain(['1.1.1.1'], 'Cloudflare'),
    ...ruleSuffix(['cloudflare.com', 'cloudflare-dns.com', 'cloudflareclient.com', 'workers.dev', 'pages.dev', 'trycloudflare.com', 'cdnjs.cloudflare.com'], 'Cloudflare')
  ];
  // 下载规则
  const RULES_DOWNLOAD = ruleSuffix(['download.windowsupdate.com', 'windowsupdate.com', 'update.microsoft.com', 'delivery.mp.microsoft.com', 'download.jetbrains.com', 'download.docker.com', 'packages.microsoft.com', 'download.visualstudio.microsoft.com', 'speed.hetzner.de'], '下载专用组');
  // 国外游戏规则
  const RULES_GLOBAL_GAMING = ruleSuffix(['steamcommunity.com', 'steampowered.com', 'steamstatic.com', 'steamcdn-a.akamaihd.net', 'steamserver.net', 'steamcontent.com', 'steampipe.akamaized.net', 'epicgames.com', 'unrealengine.com', 'epicgames-download1.akamaized.net', 'download.epicgames.com', 'riotgames.com', 'leagueoflegends.com', 'playvalorant.com', 'riotcdn.net', 'lol.secure.dyn.riotcdn.net', 'battle.net', 'blizzard.com', 'blzddist1-a.akamaihd.net', 'ea.com', 'origin.com', 'origin-a.akamaihd.net', 'uplay.com', 'ubisoft.com', 'cdn.ubisoft.com', 'rockstargames.com', 'gog.com', 'roblox.com', 'rbxcdn.com', 'minecraft.net', 'mojang.com', 'launcher.mojang.com', 'piston-meta.mojang.com', 'nintendo.com', 'nintendo.net', 'nintendo.co.jp', 'cdn.nintendo.net', 'sonyentertainmentnetwork.com', 'playstation.com', 'playstation.net', 'psnprofiles.com', 'xboxservices.com', 'supercell.com', 'supercell.net'], '国外游戏');
  // GitHub 规则
  const RULES_GITHUB = ruleSuffix(['github.com','github.io','githubusercontent.com','githubassets.com','githubstatus.com','ghcr.io','npmjs.com','npmjs.org','yarnpkg.com','github.dev'], 'GitHub');
  // 微软规则
  const RULES_MICROSOFT = ruleSuffix(['microsoft.com', 'microsoftonline.com', 'live.com', 'live.net', 'outlook.com', 'officeapps.live.com', 'onedrive.com', 'bing.com', 'bingapis.com', 'bingstatic.com', 'copilot.microsoft.com', 'msn.com', 'office.com', 'office.net', 'office365.com', 'microsoft365.com', 'sharepoint.com', 'skype.com', 'teams.microsoft.com', 'xbox.com', 'xboxlive.com'], '微软服务');
  // 流媒体规则
  const RULES_STREAMING = ruleSuffix(['netflix.com', 'nflxvideo.net', 'nflximg.net', 'nflxext.com', 'nflxso.net', 'netflix.net', 'disneyplus.com', 'disney-plus.net', 'dssott.com', 'bamgrid.com', 'primevideo.com', 'amazonvideo.com', 'media-amazon.com', 'max.com', 'hbomax.com', 'hbo.com', 'hulu.com', 'huluim.com', 'appletvplus.com', 'paramountplus.com', 'cbsi.com', 'peacocktv.com', 'crunchyroll.com', 'crunchyrollsvc.com'], '流媒体');
  // 台湾媒体规则
  const RULES_TAIWAN_MEDIA = ruleSuffix(['hamivideo.hinet.net', 'hami.video', 'litv.tv', '4gtv.tv', 'myvideo.net.tw', 'ofiii.com', 'catchplay.com', 'catchplay.com.tw', 'garageplay.tw', 'friday.tw', 'video.friday.tw', 'kktv.com.tw', 'linetv.tw', 'bahamut.com.tw', 'gamer.com.tw', 'ani.gamer.com.tw', 'ptsplus.tv', 'pts.org.tw', 'cts.com.tw', 'ftvnews.com.tw', 'news.tvbs.com.tw', 'tvbs.com.tw', 'setn.com', 'ettoday.net', 'mirrormedia.mg', 'bcc.com.tw', 'dcard.tw', 'dcard.video', 'udn.com', 'udngroup.com', 'ltn.com.tw', 'thenewslens.com', 'businessweekly.com.tw', 'cmmedia.com.tw', 'storm.mg', 'nownews.com', 'cna.com.tw', 'books.com.tw', 'readmoo.com', 'mojim.com', 'kkbox.com'], '台湾媒体');
  // Twitch 规则
  const RULES_TWITCH = [
    ...ruleProcess(['tv.twitch.android.app','tv.twitch.android.viewer'], 'Twitch'),
    ...ruleSuffix(['twitch.tv','twitchcdn.net','ttvnw.net','jtvnw.net','live-video.net'], 'Twitch')
  ];
  // Meta 规则
  const RULES_META = ruleSuffix(['facebook.com', 'facebook.net', 'fb.com', 'fbcdn.net', 'fbsbx.com', 'tfbnw.net', 'messenger.com', 'm.me', 'instagram.com', 'cdninstagram.com', 'ig.me', 'threads.net', 'threadsdotnet.com', 'whatsapp.com', 'whatsapp.net'], 'Meta');
  // Spotify 规则
  const RULES_SPOTIFY = ruleSuffix(['spotify.com','scdn.co','spoti.fi'], 'Spotify');
  // Telegram 规则
  const RULES_TELEGRAM = [
    ...ruleProcess(['org.telegram.messenger', 'org.telegram.messenger.web', 'com.exteragram.messenger', 'nekox.messenger', 'tw.nekomimi.nekogram', 'xyz.nextalone.nagram', 'org.telegram.plus', 'ellipi.messenger'], 'Telegram'),
    ...ruleKeyword(['telegram'], 'Telegram'),
    ...ruleSuffix(['telegra.ph', 'telegram.org', 't.me', 'telesco.pe', 'telegram.me', 'telegram.dog', 'telegram-cdn.org', 'telegram.space', 'tg.dev', 'tdesktop.com', 'usercontent.dev', 'graph.org'], 'Telegram'),
    ...ruleIpCidr([
      '91.108.4.0/22', '91.108.8.0/21', '91.108.12.0/22', '91.108.16.0/22', '91.108.20.0/22', '91.108.56.0/22',
      '91.105.192.0/23', '91.108.128.0/17', '149.154.160.0/20', '149.154.192.0/18', '46.17.44.0/22', '46.17.47.0/24',
      '2001:b28:f23d::/48', '2001:b28:f23f::/48', '2001:67c:4e8::/48'
    ], 'Telegram')
  ];
  // Google 通用规则
  const RULES_GOOGLE = [
    ...ruleDomain(['dns.google', 'dns.google.com', 'mail.google.com'], 'Google'),
    ...ruleSuffix(['google.com', 'googleapis.com', 'gstatic.com', 'gmail.com', 'googlemail.com', 'ggpht.cn', 'googleusercontent.com', 'googleusercontent.cn', 'withgoogle.com', 'g.co', 'goo.gl', 'googleearth.com', 'clients1.google.com', 'clients2.google.com', 'clients3.google.com', 'clients4.google.com', 'clients5.google.com', 'clients6.google.com', 'clients.googleapis.com', 'one.google.com', 'lens.google.com', 'photos.google.com', 'maps.google.com', 'maps.gstatic.com', 'news.google.com', 'meet.google.com', 'chat.google.com', 'drive.google.com', 'docs.google.com', 'sheets.google.com', 'slides.google.com', 'classroom.google.com', 'calendar.google.com', 'contacts.google.com', 'keep.google.com', 'earth.google.com'], 'Google'),
    ...ruleSuffix(['gvt1.com', 'gvt2.com', 'gvt3.com', 'xn--ngstr-lra8j.com', 'xn--ngstr-cn-8za9o.com'], '谷歌商店')
  ];

  // Twitter / X 规则
  const RULES_TWITTER = ruleSuffix(['x.com','twitter.com','twimg.com','t.co','pscp.tv','periscope.tv'], 'Twitter');
  // Discord 规则：主站、邀请、资源与客户端
  const RULES_DISCORD = [
    ...ruleProcess(['com.discord'], 'Discord'),
    ...ruleSuffix(['discord.com','discord.gg','discord.gift','discord.new','discordapp.com','discordapp.net','discordcdn.com','discord.media','discordsays.com','dis.gd'], 'Discord')
  ];
  // 社交信息流规则：Reddit
  const RULES_SOCIAL_FEED = [
    ...ruleSuffix(['reddit.com','redditinc.com','redditmedia.com','redditstatic.com','redditspace.com','redd.it','flr.app'], '社交信息流'),
    ...ruleDomain(['reddit.map.fastly.net'], '社交信息流')
  ];

  // 去中心化补充规则
  const RULES_DECENTRALIZED_SUPPLEMENT = ruleSuffix(['bluesky.app', 'bsky.app', 'bsky.social', 'bsky.network', 'bsky.chat', 'skyfeed.app', 'skyfeed.me', 'clearsky.app', 'staging.bsky.dev', 'atproto.com', 'atproto.blue', 'atproto.plus', 'brid.gy', 'mastodon.social', 'mastodon.online', 'mastodon.cloud', 'mastodon.green', 'mastodon.world', 'mastodon.jp', 'mstdn.jp', 'mstdn.social', 'mastodon.uno', 'mas.to', 'pawoo.net', 'fedibird.com', 'otadon.com', 'friends.nico', 'joinmastodon.org', 'activitypub.rocks', 'activitypub.academy', 'joinfediverse.wiki', 'hachyderm.io', 'techhub.social', 'infosec.exchange', 'journa.host', 'mathstodon.xyz', 'universeodon.com', 'fosstodon.org', 'bsd.network', 'hostux.social', 'dice.camp', 'misskey.io', 'misskey.id', 'misskey.design', 'misskey.art', 'misskey.cloud', 'misskey.dev', 'misskey.gg', 'misskey.niri.la', 'misskey.pm', 'misskey.systems', 'misskey-square.net', 'nijimiss.moe', 'sushi.ski', 'yufan.me', 'firefish.social', 'firefish.city', 'firefish.nz', 'calckey.jp', 'calckey.world', 'lemmy.world', 'lemmy.ml', 'lemmy.zip', 'beehaw.org', 'sh.itjust.works', 'programming.dev', 'kbin.social', 'mbin.social', 'fedia.io', 'pleroma.social', 'pleroma.envs.net', 'akkoma.dev', 'social.seattle.wa.us', 'mk.absturztau.be', 'joinpeertube.org', 'peertube.tv', 'tilvids.com', 'diode.zone', 'pixelfed.social', 'pixelfed.de', 'pixelfed.uno', 'writefreely.org', 'write.as', 'mobilizon.org', 'friendi.ca', 'hubzilla.org', 'primal.net', 'damus.io', 'snort.social', 'nostr.band', 'iris.to', 'nostr.com'], '去中心化平台');
  // TikTok 规则
  const RULES_TIKTOK = [
    ...ruleKeyword(['tiktok', 'musical'], 'TikTok'),
    ...ruleSuffix(['tiktok.com', 'tiktokcdn.com', 'tiktokv.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'tiktokrow-cdn.com', 'tiktokv.us', 'ibyteimg.com', 'ibytedtos.com', 'byteoversea.com', 'muscdn.com', 'musical.ly', 'tiktokd.org'], 'TikTok')
  ];
  // 日韩生态规则
  const RULES_JP_KR_ECOSYSTEM = ruleSuffix(['line.me', 'line-apps.com', 'line-scdn.net', 'naver.com', 'naver.net', 'naver.jp', 'linecorp.com', 'band.us', 'weverse.io', 'weverseapi.io', 'weverseassets.io', 'ameba.jp', 'note.com', 'tapple.me', 'pixiv.net', 'pximg.net', 'fc2.com', 'fc2blog.net', 'livedoor.com', 'hatena.ne.jp', 'goo.ne.jp', 'abema.tv', 'tver.jp', 'ntv.co.jp', 'tbs.co.jp', 'nhk.or.jp', 'dmm.com', 'fanbox.cc', 'kakao.com', 'kakao.co.kr', 'kakaocdn.net', 'daum.net', 'dcinside.com', 'afreecatv.com', 'sooplive.co.kr', 'coupang.com', 'coupangcdn.com', 'nexon.com', 'nexon.co.jp'], '日韩生态区');
  // Niconico 规则
  const RULES_NICONICO = ruleSuffix(['nicovideo.jp','nimg.jp','nicofarre.com','smilevideo.jp','dmc.nico'], 'Niconico');
  // 社交补充规则
  const RULES_SOCIAL_FEED_SUPPLEMENT = [
    ...ruleDomain(['connect.facebook.net', 'graph.facebook.com'], 'Meta')
  ];
  // 兜底规则：国内直连 / 境外自动 / 漏网之鱼
  const RULES_DIRECT_AND_FALLBACK = [
    'GEOIP,CN,全球直连',
    'GEOIP,!CN,自动选择',
    'MATCH,漏网之鱼'
  ];

  // 规则内容与装配顺序分离
  const RULE_SET_MAP = {
    YOUTUBE: RULES_YOUTUBE,
    TRANSLATION: RULES_TRANSLATION,
    RISK_SECURITY: RULES_RISK_SECURITY,
    RISK_CONTROL: RULES_RISK_CONTROL,
    APP_PROCESS: RULES_APP_PROCESS,
    ADBLOCK: RULES_ADBLOCK,
    TRACKER: RULES_TRACKER,
    AI_TIKTOK_EXTRA: RULES_AI_TIKTOK_EXTRA,
    DOMESTIC: RULES_DOMESTIC,
    APPLE_MEDIA: RULES_APPLE_MEDIA,
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
    DISCORD: RULES_DISCORD,
    SOCIAL_FEED: RULES_SOCIAL_FEED,
    DECENTRALIZED_SUPPLEMENT: RULES_DECENTRALIZED_SUPPLEMENT,

    TIKTOK: RULES_TIKTOK,
    JP_KR_ECOSYSTEM: RULES_JP_KR_ECOSYSTEM,
    NICONICO: RULES_NICONICO,
    SOCIAL_FEED_SUPPLEMENT: RULES_SOCIAL_FEED_SUPPLEMENT,
    DIRECT_AND_FALLBACK: RULES_DIRECT_AND_FALLBACK
  };

  const RULE_ASSEMBLY_ORDER = [
    // 登录/支付风控必须先于其父域业务规则，避免 accounts.youtube.com 等子域被提前吞掉。
    'RISK_SECURITY',
    // 专项业务优先：视频、翻译与 Google Play 精确链路。
    'YOUTUBE',
    'TRANSLATION',
    'RISK_CONTROL',
    // 进程兜底必须位于精确域名之后，避免 GMS/下载器吞掉专项流量。
    'APP_PROCESS',
    // 广告与跟踪位于登录/支付保护之后，降低核心链路误拦截概率。
    'ADBLOCK',
    'TRACKER',
    // 补丁型专项规则
    'AI_TIKTOK_EXTRA',

    'DOMESTIC',
    'APPLE_MEDIA',
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
    'DISCORD',
    'SOCIAL_FEED',

    'DECENTRALIZED_SUPPLEMENT',
    'TIKTOK',
    'JP_KR_ECOSYSTEM',
    'NICONICO',
    'SOCIAL_FEED_SUPPLEMENT',
    'DIRECT_AND_FALLBACK'
  ];

  // 规则装配
  
  const RULE_SET_DEFS = RULE_ASSEMBLY_ORDER.map(name => ({ 
    name, 
    rules: RULE_SET_MAP[name] 
  }));
  
  perfStart('rules_assemble');
  const assembledRules = collectRuleSets(RULE_SET_DEFS, RULE_ASSEMBLY_ORDER);
  config.rules = mergeRuleSets(assembledRules);
  perfEnd('rules_assemble');
  
  // 规则健康检查：确保存在最终兜底规则
  if (!config.rules.length || !config.rules.some(rule => typeof rule === 'string' && /^MATCH\s*,/i.test(rule))) {
    throw new Error('rules health check failed: missing fallback MATCH rule');
  }
  // 规则目标校验：确保所有目标都指向有效策略组
  
  const missingRuleTargets = [];
  const seenMissingRuleTargets = new Set();
  
  for (let i = 0; i < config.rules.length; i++) {
    const rule = config.rules[i];
    const target = extractRulePolicyTarget(rule);
    
    // 跳过有效目标和已记录的缺失目标
    if (!target || availableRuleTargets.has(target)) continue;
    if (seenMissingRuleTargets.has(target)) continue;
    
    seenMissingRuleTargets.add(target);
    missingRuleTargets.push(target);
  }
  if (missingRuleTargets.length) {
    throw new Error('rules health check failed: missing policy target(s): ' + missingRuleTargets.join(', '));
  }

  // DNS / 分组 / 规则联动校验：只校验声明表中的业务，不猜测未注册策略组。
  const dnsBindingErrors = [];
  const fallbackDomainSet = new Set(asArray(config.dns['fallback-filter'] && config.dns['fallback-filter'].domain));
  for (let i = 0; i < DNS_SERVICE_BINDINGS.length; i++) {
    const binding = DNS_SERVICE_BINDINGS[i];
    if (!binding || !binding.key) continue;
    if (!binding.auxiliary && !availableRuleTargets.has(binding.key)) {
      dnsBindingErrors.push(binding.key + ': missing policy group');
    }
    const policyDomains = asArray(binding.policyDomains);
    if (!policyDomains.length) dnsBindingErrors.push(binding.key + ': empty DNS policy domains');
    for (let j = 0; j < policyDomains.length; j++) {
      const domain = policyDomains[j];
      const policy = nameserverPolicy[domain];
      if (!Array.isArray(policy) || !policy.length) {
        dnsBindingErrors.push(binding.key + ': DNS policy not applied for ' + domain);
        break;
      }
    }
    const fallbackDomains = asArray(binding.fallbackDomains);
    for (let j = 0; j < fallbackDomains.length; j++) {
      if (!fallbackDomainSet.has(fallbackDomains[j])) {
        dnsBindingErrors.push(binding.key + ': fallback domain not applied for ' + fallbackDomains[j]);
        break;
      }
    }
  }
  if (dnsBindingErrors.length) {
    throw new Error('DNS service binding check failed: ' + dnsBindingErrors.join(' | '));
  }
  
  // 规则诊断：可选的深度分析（开发调试用）
  
  if (RULE_DIAGNOSTICS_ENABLED) {
    const ruleDiagnostics = buildRuleDiagnostics(RULE_SET_DEFS, config.rules);
    
    // 警告：风险关键词规则
    if (ruleDiagnostics.riskyShortKeywords.length && typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('rules health check warning: risky short DOMAIN-KEYWORD rule(s): ' + ruleDiagnostics.riskyShortKeywords.join(', '));
    }

    // 注：同 match value 多 target 现在按"后定义覆盖前定义"处理，只记录诊断，不再阻断
    emitRuleDiagnostics(ruleDiagnostics);
  }

  // 完成：性能统计与配置返回
  
  perfFlush();
  return config;
}

// 辅助工具
function clonePlainConfig(value) {
  if (!value || typeof value !== 'object') return {};
  
  const config = Object.assign({}, value);
  
  // 克隆核心配置字段
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
  if (!config.rules.some(rule => typeof rule === 'string' && /^MATCH\s*,/i.test(rule))) {
    throw new Error('output rules missing MATCH fallback');
  }

  return config;
}
function main(config) {
  const originalConfig = config && typeof config === 'object' ? config : {};
  const workingConfig = normalizeInputConfig(clonePlainConfig(originalConfig));
  const result = buildConfig(workingConfig);
  return validateOutputConfig(normalizeInputConfig(result));
}
