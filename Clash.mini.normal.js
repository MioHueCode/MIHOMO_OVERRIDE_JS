/**
 * Clash / Mihomo 工程化配置脚本（Normal 版）
 *
 * 核心：DNS/规则/分组三位一体联动，基于业务语义的分流与自动选路。
 * Smart 版：使用 LightGBM 智能选路，适合少手动干预场景。
 * Normal 版：使用 url-test/fallback 传统组合，适合偏好手动切换场景。
 *
 * 开源仓库：https://github.com/MioHueCode/MIHOMO_OVERRIDE_JS
 * @version 3.13.1 @date 2026-08-25 @license MIT
 *
 * ⚠️ Windows 用户注意事项：
 * 在 Windows 系统上开启 fake-ip 模式时，系统「智能多宿主 DNS 解析」功能会干扰 fake-ip
 * 映射表，导致 Edge/Chrome 等浏览器出现雪崩式重复请求（日志中可见大量 "dial DIRECT error"）。
 * 解决方法（二选一）：
 *   ① 关闭系统 DNS 加密：设置 → 网络 → DNS 设置 → 关闭「加密 DNS」
 *   ② 在 Clash 客户端中开启「严格路由」或 equivalent 选项
 */
// ════════════════════════════════════════════════════════════════
// 【外部资源集中管理】所有外部 URL 统一在此定义，换源只改一处
// ════════════════════════════════════════════════════════════════
var EXTERNAL_URLS = {
  cdn: {
    jsdelivrFastly: "https://fastly.jsdelivr.net/gh/",
    jsdelivrCdn: "https://cdn.jsdelivr.net/gh/",
    githubRaw: "https://raw.githubusercontent.com/",
    iconify: "https://api.iconify.design/"
  },
  icons: {
    qureBase: "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/",
    miniColor: "https://raw.githubusercontent.com/Orz-3/mini/master/Color/",
    fcm: "https://fastly.jsdelivr.net/gh/MiToverG422/Qure@master/IconSet/Color/fcm.png"
  },
  rules: {
    dnsLeakGuard: "https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/tld-not-cn.txt",
    telegramCidr: "https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/telegramcidr.txt",
    adRules: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/reject.txt",
    safeMrs: "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/safe.mrs",
    cnGeositeMrs: "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/cn.mrs",
    cnGeoipMrs: "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/cn.mrs",
    gfwMrs: "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/gfw.mrs"
  }
}, qIcon = name => EXTERNAL_URLS.icons.qureBase + name + ".png";

function buildConfig(config) {
  // ---------- 统一去重 ----------
  function unique(arr) {
    return Array.from(new Set((arr || []).filter(Boolean)));
  }
  // 若无代理节点直接返回，避免后续遍历耗时
    if (
  // ---------- 统一日志 & 调试 ----------
  "undefined" != typeof console && console.log && console.log.bind(console), 
  // ---------- 正则缓存 ----------
  new Map, !Array.isArray(config.proxies) || 0 === config.proxies.length) return config;
  if (!config || !Array.isArray(config.proxies)) return config;
  // 运行上下文：保留旧分组选项顺序
    const existingGroups = Array.isArray(config["proxy-groups"]) ? config["proxy-groups"] : [], existingGroupMap = Object.create(null);
  for (let i = 0; i < existingGroups.length; i++) {
    const group = existingGroups[i];
    group && group.name && (existingGroupMap[group.name] = group);
  }
  // === 运行时工具：性能分析、调试与安全执行 ===
    function isHostname(value) {
    const s = String(value || "").trim().toLowerCase();
    return !!s && !/^\d+\.\d+\.\d+\.\d+$/.test(s) && !s.includes(":") && /^[a-z0-9.-]+$/.test(s) && s.includes(".");
  }
  // 节点字段合法性校验：部分订阅源会混入带非法字符（如 "+"）的 server/sni，
  // 这类值无法通过内核的域名合法性检查，若不提前过滤会导致整个配置导入失败（DNS ResolverRule invalid domain）。
    Object.create(null);
  const DOMAIN_OR_IP_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;
  function isValidProxyServerField(value) {
    const s = String(value || "").trim();
    return !!s && (!!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(s) || !(!s.includes(":") || !/^[0-9a-fA-F:]+$/.test(s)) || DOMAIN_OR_IP_PATTERN.test(s));
  }
  // sni/servername 允许缺省（不是所有协议都必须携带），但一旦出现就必须是合法域名/IP。
    function isValidOptionalProxyDomainField(value) {
    const s = String(value || "").trim();
    return !s || isValidProxyServerField(s);
  }
  // 端口合法性校验：畸形订阅可能给出空值/非数字/超范围端口，同样会导致节点无法被内核加载。
    function isValidProxyPort(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 65535;
  }
  // === 通用工具与规则工厂 ===
  // 数组工具：统一处理外部输入
    function asArray(value) {
    return Array.isArray(value) ? value : [];
  }
  function uniqList(arr) {
    return Array.from(new Set(asArray(arr).filter(Boolean)));
  }
  // 通用去重别名（保持向后兼容）
  // unique 已在上方统一定义
  // 规则工厂：统一 DOMAIN / DOMAIN-SUFFIX / PROCESS / KEYWORD 生成
    function stripDomainPrefix(domain) {
    return String(domain || "").replace(/^\+\./, "").replace(/^\*\./, "").trim();
  }
  function ruleSuffix(domains, target) {
    return asArray(domains).map(stripDomainPrefix).filter(Boolean).map(d => "DOMAIN-SUFFIX," + d + "," + target);
  }
  function ruleDomain(domains, target) {
    return asArray(domains).map(stripDomainPrefix).filter(Boolean).map(d => "DOMAIN," + d + "," + target);
  }
  function ruleProcess(names, target) {
    return asArray(names).filter(Boolean).map(n => "PROCESS-NAME," + n + "," + target);
  }
  function ruleKeyword(words, target) {
    return asArray(words).filter(Boolean).map(w => "DOMAIN-KEYWORD," + w + "," + target);
  }
  function ruleIpCidr(cidrs, target, noResolve = !0) {
    return asArray(cidrs).filter(Boolean).map(cidr => {
      const type = String(cidr).includes(":") ? "IP-CIDR6" : "IP-CIDR";
      return noResolve ? type + "," + cidr + "," + target + ",no-resolve" : type + "," + cidr + "," + target;
    });
  }
  // 域名生成器：压缩重复模式
    const d = (...domains) => domains.map(x => x.startsWith("+.") || x.startsWith("*.") ? x : "+." + x), googleDomains = () => d("google.com", "googleapis.com", "googleapis.cn", "services.googleapis.cn", "gstatic.com", "googleusercontent.com", "gvt1.com", "gvt2.com", "gvt3.com", "recaptcha.net", "recaptcha-cn.net", "youtube.com", "ytimg.com", "googlevideo.com", "youtubei.googleapis.com", "youtube.googleapis.com", "translate.googleapis.com", "translation.googleapis.com", "translate-pa.googleapis.com"), streamingDomains = () => d("netflix.com", "nflxvideo.net", "nflximg.net", "nflxext.com", "nflxso.net", "netflix.net", "disneyplus.com", "disney-plus.net", "dssott.com", "bamgrid.com", "primevideo.com", "amazonvideo.com", "media-amazon.com", "spotify.com", "scdn.co", "spoti.fi", "hulu.com", "huluim.com", "max.com", "hbomax.com", "hbo.com", "twitch.tv", "twitchcdn.net", "ttvnw.net", "jtvnw.net", "live-video.net", "twtrdns.net", "crunchyroll.com", "crunchyrollsvc.com", "paramountplus.com", "peacocktv.com", "appletvplus.com"), discordDomains = () => d("discord.com", "discord.gg", "discord.gift", "discord.new", "discordapp.com", "discordapp.net", "discordcdn.com", "discord.media", "discordsays.com", "dis.gd"), telegramDomains = () => d("telegram.org", "t.me", "telegra.ph", "telegram.me", "telegram.dog", "telegram-cdn.org", "telegram.space", "tg.dev", "tdesktop.com", "telesco.pe", "usercontent.dev", "graph.org"), collaborationDomains = () => d("zoom.us", "zoom.com", "zoomgov.com", "zoomcdn.com", "zoomapp.com", "slack.com", "slack-edge.com", "slack-msgs.com", "notion.so", "notion.site", "notion.com", "dropbox.com", "dropboxapi.com", "dropboxusercontent.com", "box.com", "boxcloud.com", "figma.com", "figma-gov.com", "canva.com", "miro.com", "mirocdn.com", "atlassian.com", "atlassian.net", "jira.com", "trello.com", "asana.com", "monday.com", "airtable.com", "linear.app", "linearassets.com", "clickup.com"), developerDomains = () => d("stackoverflow.com", "stackexchange.com", "serverfault.com", "superuser.com", "askubuntu.com", "docker.com", "docker.io", "dockerstatic.com", "pypi.org", "pythonhosted.org", "files.pythonhosted.org", "crates.io", "static.crates.io", "static.rust-lang.org", "golang.org", "proxy.golang.org", "pkg.go.dev", "sum.golang.org", "maven.org", "repo1.maven.org", "repo.maven.apache.org", "gradle.org", "services.gradle.org", "registry.npmjs.org", "npmjs.com", "npmjs.org", "yarnpkg.com", "rubygems.org", "packagist.org", "nuget.org", "cdn.nuget.org", "gcr.io", "ghcr.io", "quay.io", "k8s.io", "kubernetes.io", "hashicorp.com", "terraform.io", "vagrantup.com", "github.com", "githubusercontent.com", "githubassets.com", "github.io", "github.dev", "ghcr.io", "githubstatus.com"), socialExtraDomains = () => d("linkedin.com", "licdn.com", "pinterest.com", "pinimg.com", "snapchat.com", "sc-cdn.net", "signal.org", "signal.art", "signal.tube", "medium.com", "wikipedia.org", "wikimedia.org", "wikidata.org", "wiktionary.org", "wikiquote.org", "v2ex.com", "quora.com", "quoracdn.net"), tiktokDomains = () => d("tiktok.com", "tiktokv.com", "byteoversea.com", "ibytedtos.com", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "tiktokrow-cdn.com", "tiktokv.us", "ibyteimg.com", "muscdn.com", "musical.ly", "bytefcdn-oversea.com", "tiktokd.org", "tiktokd.net", "tiktokmusic.app", "ttwebview.com", "ttwstatic.com", "bytegecko-i18n.com", "byteintlapi.com", "isnssdk.com"), aiDomains = () => d("openai.com", "chatgpt.com", "oaistatic.com", "oaiusercontent.com", "openaiusercontent.com", "claude.ai", "anthropic.com", "anthropiccdn.com", "claudeusercontent.com", "perplexity.ai", "perplexity.com", "pplx.ai", "poe.com", "poecdn.net", "midjourney.com", "character.ai", "c.ai", "groq.com", "mistral.ai", "lechat.ai", "x.ai", "grok.com", "cohere.com", "huggingface.co", "replicate.com", "cursor.sh", "cursor.com", "gemini.google.com", "generativeai.google", "generativelanguage.googleapis.com", "proactivebackend-pa.googleapis.com", "notebooklm.google.com", "stability.ai", "ai.com", "sora.com", "elevenlabs.io", "suno.com", "suno.ai", "lmsys.org", "pomona.ai", "optimizerai.app", "qwen.ai", "deepmind.google", "glean.com", "you.com", "phind.com", "kagihub.com"), metaDomains = () => d("facebook.com", "facebook.net", "fb.com", "fbcdn.net", "fbsbx.com", "tfbnw.net", "messenger.com", "m.me", "instagram.com", "cdninstagram.com", "ig.me", "threads.net", "threadsdotnet.com", "whatsapp.com", "whatsapp.net"), openaiRealtimeDomains = () => d("auth0.openai.com", "oaistatic.com", "oaiusercontent.com", "files.oaiusercontent.com", "cdn.openai.com", "livekit.cloud", "statsigapi.net", "chatgpt.livekit.cloud", "openaiapi-site.azureedge.net"), adguardDomains = () => d("pglstatp-toutiao.com", "pglstatp.com", "pangolin-sdk-toutiao.com", "pangolin.snssdk.com", "sgsnssdk.com", "unionadjs.com", "adkwai.com", "e.kuaishou.com", "adukwai.com", "tanx.com", "alimama.com", "mmstat.com", "gdt.qq.com", "e.qq.com", "adsmind.gdtimg.com", "pgdt.gtimg.cn", "guanggao.qq.com", "adnet.qq.com", "iadmatvideo.nosdn.127.net", "iadmusicmatvideo.nosdn.127.net", "mi.gdt.qq.com", "ad.xiaomi.com", "api.ad.xiaomi.com", "data.mistat.xiaomi.com", "tracking.miui.com", "umeng.com", "umengcloud.com", "mob.com", "bdxiguaimg.com", "adsame.com", "bdplus.baidu.com", "pos.baidu.com", "union.baidu.com", "cb.baidu.com", "dup.baidustatic.com", "cpro.baidu.com", "afd.baidu.com", "als.baidu.com", "nsclick.baidu.com", "mobads.baidu.com", "eclick.baidu.com", "wanfeng1.baidu.com", "wm.baidu.com", "duclick.baidu.com", "adimg.uve.weibo.com", "alitui.weibo.com", "biz.weibo.com", "game.weibo.cn", "sax.sina.com.cn", "adbox.sina.com.cn", "adview.cn", "miaozhen.com", "irs01.com", "admaster.com.cn", "adpush.cn", "cnxad.com", "adkmob.com", "adobe-identity.omtrdc.net", "omtrdc.net", "2mdn.net", "admob.com", "admob-sdk.doubleclick.net", "app-measurement.com", "googlesyndication.com", "googleadservices.com", "googleadsserving.cn", "adservice.google.com", "adservice.google.com.hk", "pagead2.googlesyndication.com", "tpc.googlesyndication.com", "googletagservices.com", "doubleclick.net", "adsrvr.org", "criteo.com", "criteo.net", "taboola.com", "taboolasyndication.com", "outbrain.com", "analytics.google.com", "ads.google.com"), EXTERNAL_PROVIDERS_all = (_nextRpInterval, proxyName) => ({
    "dns-leak-guard": {
      type: "http",
      interval: _nextRpInterval(),
      behavior: "domain",
      format: "text",
      url: EXTERNAL_URLS.rules.dnsLeakGuard
    },
    telegramcidr: {
      type: "http",
      interval: _nextRpInterval(),
      behavior: "ipcidr",
      format: "text",
      url: EXTERNAL_URLS.rules.telegramCidr
    },
    adrules: {
      type: "http",
      behavior: "classical",
      interval: _nextRpInterval(),
      format: "yaml",
      url: EXTERNAL_URLS.rules.adRules
    },
    safe: {
      type: "http",
      interval: _nextRpInterval(),
      behavior: "domain",
      format: "mrs",
      proxy: proxyName,
      url: EXTERNAL_URLS.rules.safeMrs,
      path: "./rules/echs_safe.mrs"
    },
    gfw: {
      type: "http",
      interval: _nextRpInterval(),
      behavior: "domain",
      format: "mrs",
      proxy: proxyName,
      url: EXTERNAL_URLS.rules.gfwMrs
    }
  }), DOMESTIC_SERVICE_MODULE_all = () => d(), DOMESTIC_SERVICE_MODULE_dnsPolicySets = () => ({
    domestic: d()
  }), DOMESTIC_SERVICE_MODULE_providers = _nextRpInterval => ({
    "cn-direct": {
      type: "http",
      interval: _nextRpInterval(),
      behavior: "domain",
      format: "mrs",
      url: EXTERNAL_URLS.rules.cnGeositeMrs
    },
    "cn-cidr": {
      type: "http",
      interval: _nextRpInterval(),
      behavior: "ipcidr",
      format: "mrs",
      url: EXTERNAL_URLS.rules.cnGeoipMrs
    }
  });
  // === 基础配置：运行参数、网络栈与实验特性 ===
  // Profile：持久化配置
    config.profile = {
    ...config.profile || {},
    "store-selected": !0,
    "store-fake-ip": !0,
    tracing: !0
  }, 
  // 网络与端口配置：优先保留上游已有端口（避免覆盖用户自定义端口）
  config["mixed-port"] = config["mixed-port"] || 7890, config["allow-lan"] = void 0 !== config["allow-lan"] && config["allow-lan"], 
  config.mode = "rule", 
  // log-level 保留上游值，仅当为空时设置默认
  config["log-level"] = config["log-level"] && "info" !== config["log-level"] ? config["log-level"] : "error", 
  config.ipv6 = !0, 
  // TCP 优化
  config["tcp-concurrent"] = !0, config["keep-alive-interval"] = 15, config["keep-alive-idle"] = 30, 
  config["disable-keep-alive"] = !1, 
  // 其他特性
  config["etag-support"] = !0, config["unified-delay"] = !0, config["find-process-mode"] = "strict", 
  config["global-client-fingerprint"] = config["global-client-fingerprint"] || "chrome", 
  // 实验特性：QUIC 兼容性优化
  config.experimental = Object.assign({}, config.experimental || {}, {
    "quic-go-disable-gso": !0,
    "quic-go-disable-ecn": !0,
    "dialer-ip4p-convert": !1,
    "geodata-loader": "memconservative",
    "geo-auto-update": !0,
    "geo-update-interval": 24
  }), 
  // 嗅探模块：域名感知与流量识别
  config.sniffer && "object" == typeof config.sniffer || (config.sniffer = {}), config.sniffer["force-dns-mapping"] = !0, 
  config.sniffer["parse-pure-ip"] = !0, config.sniffer["override-destination"] = !0, 
  config.sniffer.sniff = {
    HTTP: {
      ports: [ 80, "8080-8880" ],
      "override-destination": !0
    },
    TLS: {
      ports: [ 443, 8443 ]
    },
    QUIC: {
      ports: [ 443, 8443 ],
      "override-destination": !1
    }
  }, config.sniffer["force-domain"] = uniqList([ ...openaiRealtimeDomains(), ...tiktokDomains(), ...googleDomains(), "play.google.com", "market.android.com", "play.googleapis.com", "play-fe.googleapis.com", "play-pa.googleapis.com", "playatoms-pa.googleapis.com", "play-apps-fe-pa.googleapis.com", "play-apps-download-frontend.googleapis.com", "android.googleapis.com", "android.clients.google.com", "android.clients.google.com.cn", "play-lh.googleusercontent.com", "play-games.googleusercontent.com", "dl.google.com", "dl.l.google.com", "+.gvt1.com", "+.gvt2.com", "+.gvt3.com", "+.xn--ngstr-lra8j.com", "+.xn--ngstr-cn-8za9o.com", "+.services.googleapis.cn", "+.googleapis.cn", ...telegramDomains(), ...metaDomains(), ...discordDomains(), ...streamingDomains(), ...aiDomains() ]), 
  // 注：此处已使用 uniqList 去重，确保嗅探列表无冗余
  config.sniffer["skip-domain"] = sanitizeCompatDomainList(uniqList([ ...asArray(config.sniffer["skip-domain"]), 
  // DoH 域名：解析器自身不参与嗅探，避免请求链路互相干扰。
  "dns.adguard-dns.com", "dns.google", "dns.google.com", "cloudflare-dns.com", "one.one.one.one", "doh.pub", "doh.360.cn", "dns.alidns.com", 
  // 时间同步：校时请求应尽量保持简单直接，避免额外嗅探干预。
  "time.windows.com", "time.apple.com", "time.android.com" ])), 
  // Hosts 映射：关键服务域名兜底
  config.hosts && "object" == typeof config.hosts || (config.hosts = {});
  const dnsHostMap = {
    "dns.alidns.com": [ "223.5.5.5", "223.6.6.6" ],
    "doh.pub": [ "120.53.53.53", "1.12.12.12" ],
    "doh.360.cn": [ "101.198.198.198" ],
    "dns.google": [ "8.8.8.8", "8.8.4.4" ],
    "dns.google.com": [ "8.8.8.8", "8.8.4.4" ],
    "dns64.dns.google": [ "8.8.8.8", "8.8.4.4" ],
    "cloudflare-dns.com": [ "1.1.1.1", "1.0.0.1" ],
    "mozilla.cloudflare-dns.com": [ "1.1.1.1", "1.0.0.1" ],
    "one.one.one.one": [ "1.1.1.1", "1.0.0.1" ],
    "family.cloudflare-dns.com": [ "1.1.1.1", "1.0.0.1" ],
    "security.cloudflare-dns.com": [ "1.1.1.1", "1.0.0.1" ],
    "dns.quad9.net": [ "9.9.9.9", "149.112.112.112" ],
    "dns11.quad9.net": [ "9.9.9.9", "149.112.112.112" ],
    "dns.adguard-dns.com": [ "94.140.14.14", "94.140.15.15" ]
  };
  for (const [k, v] of Object.entries(dnsHostMap)) config.hosts[k] = v;
  config.hosts["services.googleapis.cn"] = "services.googleapis.com", config.hosts["google.cn"] = "google.com", 
  config.hosts["cn.bing.com"] = "global.bing.com", config.hosts["t.me"] = "telegram.me";
  const sanitizedHosts = {};
  for (const [k, v] of Object.entries(config.hosts || {})) {
    const key = sanitizeCompatDomainPattern(k);
    !key || key.startsWith("*.") || key.includes("*") || key.startsWith("rule-set:") || key.startsWith("geosite:") || (sanitizedHosts[key] = v);
  }
  config.hosts = sanitizedHosts;
  // DNS 配置：解析器、策略与路由
  // DNS 端点定义
  const localDns = [ "223.5.5.5", "223.6.6.6", "119.29.29.29", "180.76.76.76" ], cnDns = [ "223.5.5.5", "223.6.6.6", "119.29.29.29", "180.76.76.76", "https://dns.alidns.com/dns-query", "https://doh.pub/dns-query" ], trustDns = [ "https://1.1.1.1/dns-query", "https://dns.google/dns-query" ], trustBootstrapDns = [ "1.1.1.1", "1.0.0.1", "8.8.8.8", "8.8.4.4" ], proxyBootstrapDns = [ "223.5.5.5", "119.29.29.29", "1.1.1.1", "8.8.8.8" ], fastDomesticDns = uniqList([ ...localDns, ...cnDns.filter(item => !/^https:\/\//i.test(String(item || ""))) ]), fallbackDns = uniqList([ ...trustDns, "https://dns.quad9.net/dns-query" ]), adguardDns = [ "https://dns.adguard-dns.com/dns-query" ], TEST_URL = "https://connectivitycheck.gstatic.com/generate_204", directProxyNames = [ "IPv4优先", "IPv6优先", "双栈", "仅IPv4", "仅IPv6" ], directProxyIpVersionMap = {
    "IPv4优先": "ipv4-prefer",
    "IPv6优先": "ipv6-prefer",
    "双栈": "dual",
    "仅IPv4": "ipv4",
    "仅IPv6": "ipv6"
  }, PLAY_STORE_TEST_URL = TEST_URL, PLAY_STORE_SPECIAL_GROUP_NAMES = [ "谷歌商店专用" ], CF_ANYCAST_NAME_RE = /cloudflare|anycast|(?:^|[^a-z])cf(?:[^a-z]|$)/i, IPV6_ONLY_NAME_RE = /ipv6|(?:^|[^a-z0-9])v6(?:[^a-z0-9]|$)/i, directChoices = [ "IPv4优先", "IPv6优先", "双栈", "仅IPv4", "仅IPv6", "DIRECT" ], domesticServiceChoices = [ "IPv4优先", "IPv6优先", "双栈", "仅IPv4", "仅IPv6", "DIRECT" ], DNS_POLICY_DOMAIN_SETS = {
    adguard: adguardDomains(),
    domestic: DOMESTIC_SERVICE_MODULE_dnsPolicySets().domestic,
    tiktok: tiktokDomains(),
    adguardService: d("adtidy.org", "adguard.com", "adguard.org", "adguard-dns.io", "dns.adguard-dns.com"),
    browserRisk: [ ...d("addons.mozilla.org", "addons.cdn.mozilla.net", "online-metrix.net"), "api.ipify.org", "fpjs.checkout.com", "fpjscache.checkout.com", "risk.checkout.com", "challenges.cloudflare.com", "turnstile.cloudflare.com", "assets.cloudflare.com", "hcaptcha.com", "newassets.hcaptcha.com", "volatile-pa.googleapis.com", "settings-win.data.microsoft.com", "accounts.google.com", "myaccount.google.com", "login.live.com", "login.microsoftonline.com", "appleid.apple.com" ],
    openaiRealtime: openaiRealtimeDomains(),
    google: googleDomains(),
    playStore: [ "play.google.com", "market.android.com", "play.googleapis.com", "play-fe.googleapis.com", "play-pa.googleapis.com", "playatoms-pa.googleapis.com", "play-apps-fe-pa.googleapis.com", "play-apps-download-frontend.googleapis.com", "android.googleapis.com", "android.clients.google.com", "android.clients.google.com.cn", "play-lh.googleusercontent.com", "play-games.googleusercontent.com", "dl.google.com", "dl.l.google.com", "+.gvt1.com", "+.gvt2.com", "+.gvt3.com", "+.xn--ngstr-lra8j.com", "+.xn--ngstr-cn-8za9o.com", "+.services.googleapis.cn", "+.googleapis.cn" ],
    ai: aiDomains(),
    mainstreamOverseas: uniqList([ ...streamingDomains(), ...telegramDomains(), ...collaborationDomains(), ...socialExtraDomains(), ...d("discord.com", "discordapp.com", "reddit.com", "github.com", "githubusercontent.com", "steamcommunity.com", "steampowered.com", "epicgames.com", "roblox.com", "instagram.com", "whatsapp.com", "facebook.com") ]),
    youtubeMedia: [ "jnn-pa.googleapis.com", "youtubeembeddedplayer.googleapis.com", "video.google.com", "+.googlevideo.com", "+.ytimg.com", "+.ggpht.com", "+.youtube.com", "+.youtu.be" ],
    translation: d("translate.google.com", "translate.google.cn", "translate.googleapis.com", "translation.googleapis.com", "translate-pa.googleapis.com", "deepl.com", "deeplpro.com", "deeplusercontent.com", "linguee.com"),
    telegram: telegramDomains(),
    meta: metaDomains(),
    discord: discordDomains(),
    streaming: streamingDomains(),
    gaming: d("steamcommunity.com", "steampowered.com", "steamstatic.com", "steamcontent.com", "steamserver.net", "epicgames.com", "unrealengine.com", "epicgames-download1.akamaized.net", "roblox.com", "rbxcdn.com", "battle.net", "blizzard.com", "blizzardentertainment.com", "battlenet.com.cn", "ea.com", "origin.com", "uplay.com", "ubisoft.com", "nintendo.com", "nintendo.net", "playstation.com", "playstation.net", "xbox.com", "xboxlive.com", "xboxservices.com", "supercell.com", "supercell.net", "riotgames.com", "leagueoflegends.com", "playvalorant.com", "minecraft.net", "mojang.com"),
    collaboration: collaborationDomains(),
    developer: developerDomains(),
    socialExtra: socialExtraDomains(),
    crypto: d("binance.com", "binance.us", "binanceapi.com", "bnbstatic.com", "coinbase.com", "okx.com", "okx.ac", "okx.cab", "oklink.com", "okx-dns.com", "okx-dns1.com", "okx-dns2.com", "bybit.com", "bytick.com", "byapis.com", "bycsi.com", "bybit-global.com", "bybitglobal.com", "kucoin.com", "kucoin.plus", "gate.io", "gateimg.com", "gatedata.org", "kraken.com", "bitget.com", "mexc.com", "huobi.com", "htx.com", "metamask.io", "trustwallet.com", "walletconnect.com", "walletconnect.org", "ethereum.org", "etherscan.io", "opensea.io", "uniswap.org", "ledger.com", "trezor.io", "hyperliquid.xyz", "polymarket.com"),
    finance: [ ...d("paypal.com", "paypal.com.hk", "paypal.com.sg", "paypal.me", "paypalservice.com", "paypalcredit.com", "braintreegateway.com", "braintreepayments.com", "stripe.com", "stripe.network", "stripe-terminal-local-reader.net", "wise.com", "transferwise.com", "revolut.com", "card.io", "paypalhere.com", "venmo.com", "xoom.com", "checkout.com", "checkoutcdn.com", "checkoutshopper.com", "payoneer.com", "airwallex.com", "worldpay.com", "skrill.com", "neteller.com", "authy.com", "adyen.com", "visa.com", "mastercard.com", "amex.com", "ibkr.com", "interactivebrokers.com", "schwab.com"), "hcaptcha.com", "newassets.hcaptcha.com" ],
    microsoftBing: d("bing.com", "cn.bing.com", "global.bing.com", "bing.com.cn", "bingapis.com", "bingstatic.com", "bing.net", "copilot.microsoft.com", "msn.com", "msn.cn", "bingagencyawards.com", "bingplaces.com"),
    twitter: d("x.com", "twitter.com", "twimg.com", "t.co", "pscp.tv", "periscope.tv", "twttr.com", "x.dev", "twtrdns.net", "twttr.net"),
    appleService: d("apple.com", "icloud.com", "icloud-content.com", "itunes.apple.com", "apps.apple.com", "mzstatic.com", "apple-dns.net", "apple-mapkit.com", "cdn-apple.com", "apple.news", "applemusic.com", "appstore.com"),
    twitch: d("twitch.tv", "twitchcdn.net", "ttvnw.net", "jtvnw.net", "live-video.net"),
    socialFeed: d("reddit.com", "redditinc.com", "redditmedia.com", "redditstatic.com", "redditspace.com", "redd.it", "linkedin.com", "licdn.com", "pinterest.com", "pinimg.com", "snapchat.com", "sc-cdn.net", "medium.com", "quora.com", "quoracdn.net"),
    jpKrEcosystem: d("line.me", "line-apps.com", "line-scdn.net", "naver.com", "naver.net", "naver.jp", "linecorp.com", "band.us", "weverse.io", "weverseapi.io", "weverseassets.io", "ameba.jp", "note.com", "tapple.me", "pixiv.net", "pximg.net", "kakao.com", "kakaocdn.net", "daum.net"),
    niconico: d("nicovideo.jp", "nimg.jp", "nicofarre.com", "smilevideo.jp", "dmc.nico"),
    taiwanMedia: d("hami.video", "litv.tv", "4gtv.tv", "myvideo.net.tw", "ofiii.com", "catchplay.com", "catchplay.com.tw", "friday.tw", "kktv.com.tw", "linetv.tw", "bahamut.com.tw", "gamer.com.tw", "ptsplus.tv", "pts.org.tw", "kkbox.com")
  }, DNS_FALLBACK_FILTER_DOMAIN_SETS = {
    baseOverseas: d("google.com", "youtube.com", "twitter.com", "x.com", "telegram.org", "t.me", "instagram.com", "whatsapp.com"),
    ai: aiDomains(),
    devCommunity: uniqList([ ...d("github.com", "githubusercontent.com", "githubassets.com", "github.io", "ghcr.io", "reddit.com", "redditmedia.com", "redditstatic.com", "redd.it"), "+.reddit.map.fastly.net", ...developerDomains() ]),
    productivity: uniqList([ ...d("cloudflare.com", "workers.dev", "pages.dev", "trycloudflare.com"), ...collaborationDomains() ]),
    bigTech: [ ...d("apple.com", "icloud.com", "icloud-content.com", "microsoft.com", "microsoftonline.com", "live.com", "office.com", "office365.com", "onedrive.com", "bing.com", "aws.amazon.com"), "account.amazon.com", "payments.amazon.com" ],
    infra: d("dns.google", "dns.google.com", "cloudflare-dns.com", "api2.branch.io", "cdn.branch.io"),
    privacyAndCaptivePortal: [ ...d("cloudflare-dns.com", "one.one.one.one", "quad9.net", "dns9.quad9.net", "nextdns.io", "controld.com", "mullvad.net", "dns.sb", "dns.adguard-dns.com"), "connectivitycheck.android.com", "connectivitycheck.gstatic.com", "www.gstatic.com" ],
    googlePlayIntegrity: [ "www.googleapis.com", "android.googleapis.com", "firebaseinstallations.googleapis.com", "firebase-settings.crashlytics.com", "+.firebaseio.com", "+.firebaseapp.com", "play-fe.googleapis.com", "clientservices.googleapis.com" ],
    domestic: DOMESTIC_SERVICE_MODULE_all(),
    // 以下从 DNS_POLICY_DOMAIN_SETS 复用
    meta: DNS_POLICY_DOMAIN_SETS.meta,
    discord: DNS_POLICY_DOMAIN_SETS.discord,
    telegram: DNS_POLICY_DOMAIN_SETS.telegram,
    tiktok: DNS_POLICY_DOMAIN_SETS.tiktok,
    collaboration: DNS_POLICY_DOMAIN_SETS.collaboration,
    developer: DNS_POLICY_DOMAIN_SETS.developer,
    socialExtra: DNS_POLICY_DOMAIN_SETS.socialExtra,
    crypto: DNS_POLICY_DOMAIN_SETS.crypto,
    finance: DNS_POLICY_DOMAIN_SETS.finance,
    streaming: DNS_POLICY_DOMAIN_SETS.streaming,
    gaming: DNS_POLICY_DOMAIN_SETS.gaming,
    playStore: DNS_POLICY_DOMAIN_SETS.playStore,
    youtubeMedia: DNS_POLICY_DOMAIN_SETS.youtubeMedia,
    translation: DNS_POLICY_DOMAIN_SETS.translation,
    twitter: DNS_POLICY_DOMAIN_SETS.twitter,
    appleService: DNS_POLICY_DOMAIN_SETS.appleService,
    twitch: DNS_POLICY_DOMAIN_SETS.twitch,
    socialFeed: DNS_POLICY_DOMAIN_SETS.socialFeed,
    jpKrEcosystem: DNS_POLICY_DOMAIN_SETS.jpKrEcosystem,
    niconico: DNS_POLICY_DOMAIN_SETS.niconico,
    taiwanMedia: DNS_POLICY_DOMAIN_SETS.taiwanMedia
  };
  function sanitizeCompatDomainPattern(pattern) {
    if ("string" != typeof pattern) return "";
    let s = pattern.trim();
    return s ? 
    // DNS ResolverRule / nameserver-policy 在部分内核或前端环境中不接受 geosite / rule-set 语法，
    // 这里统一只保留纯域名与简单前导通配，避免出现 “DNS ResolverRule invalid domain”。
    s.startsWith("rule-set:") || s.startsWith("geosite:") ? "" : (s = s.replace(/^\+\./, "*."), 
    /[*?]/.test(s) && !/^\*\.[A-Za-z0-9.-]+$/.test(s) ? "" : /^[A-Za-z0-9.-]+$/.test(s) || /^\*\.[A-Za-z0-9.-]+$/.test(s) ? s.toLowerCase() : "") : "";
  }
  function sanitizeCompatDomainList(list) {
    const out = [], seen = new Set;
    for (const item of Array.isArray(list) ? list : []) {
      const v = sanitizeCompatDomainPattern(item);
      v && !seen.has(v) && (seen.add(v), out.push(v));
    }
    return out;
  }
  function sanitizeDnsServerList(list) {
    const out = [], seen = new Set;
    for (const item of asArray(list)) {
      const text = String(item || "").trim();
      text && !seen.has(text) && (seen.add(text), out.push(text));
    }
    return out;
  }
  const DNS_FAKE_IP_FILTER_SETS = {
    lan: [ "*.lan", "*.local", "*.localdomain", "*.home.arpa", "*.internal" ],
    connectivityCheck: [ "localhost.ptlogin2.qq.com", "captive.apple.com" ],
    timeSync: [ "time.windows.com", "time.apple.com", "time.android.com", "pool.ntp.org", "ntp.*.com", "ntp.*.cn" ],
    routerGateway: [ "router.asus.com", "routerlogin.net", "www.routerlogin.com", "tplogin.cn", "tplinkwifi.net", "miwifi.com", "router.miwifi.com", "my.router", "fritz.box", "dlinkrouter.local", "orbilogin.com" ],
    realtimeRelay: [ "stun.*", "stun.*.*", "stun.*.*.*", "turn.*", "turn.*.*", "relay.*" ],
    consoleAuth: [ "cable.auth.com", "*.srv.nintendo.net", "*.stun.playstation.net", "xbox.*.microsoft.com", "*.xboxlive.com", "*.xbox.com", "*.xboxservices.com", "*.playstation.net", "*.playstation.com", "psnprofiles.com", "*.nintendo.com", "*.nintendo.net", "*.nintendo.co.jp" ],
    gamingPlatforms: [ "*.battle.net", "*.battlenet.com.cn", "*.wotgame.cn", "*.wggames.cn", "*.wowsgame.cn", "*.wargaming.net", "*.blizzard.com", "*.blizzardentertainment.com", "*.roblox.com", "*.rbxcdn.com", "*.minecraft.net", "*.mojang.com", "*.mojangstudios.com", "*.epicgames.com", "*.unrealengine.com", "*.epicgames-download1.akamaized.net", "*.riotgames.com", "*.leagueoflegends.com", "*.playvalorant.com", "*.riotcdn.net", "*.lol.secure.dyn.riotcdn.net", "*.ea.com", "*.origin.com", "*.origin-a.akamaihd.net", "*.ubisoft.com", "*.uplay.com", "*.cdn.ubisoft.com", "*.rockstargames.com", "*.gog.com", "*.steamcommunity.com", "*.steampowered.com", "*.steamstatic.com", "*.steamcdn-a.akamaihd.net", "*.steamcontent.com", "*.supercell.com", "*.supercell.net", "*.piston-meta.mojang.com", "*.launcher.mojang.com" ],
    cloudflareChallenge: [ "challenges.cloudflare.com", "turnstile.cloudflare.com", "assets.cloudflare.com", "*.cloudflare.com" ],
    paymentAndRiskLocal: [ "localhost", "*.localhost", "*.invalid", "*.test", "*.example", "*.home", "*.lan" ],
    pushAndCast: [ "mtalk.google.com", "alt*.mtalk.google.com", "*.push.apple.com", "*.push-apple.com.akadns.net", "*.ipp.local", "*.mesh.local", "*.matter.local" ]
  }, safeTrustDns = trustDns.length ? trustDns : [ "https://1.1.1.1/dns-query" ], safeLocalDns = localDns.length ? localDns : [ "223.5.5.5" ], safeCnDns = cnDns.length ? cnDns : [ "223.5.5.5" ], safeFallbackDns = fallbackDns.length ? fallbackDns : [ "https://dns.quad9.net/dns-query" ], safeFastDomesticDns = fastDomesticDns.length ? fastDomesticDns : safeLocalDns, safeAdguardDns = adguardDns.length ? adguardDns : [ "https://dns.adguard-dns.com/dns-query" ], safeProxyBootstrapDns = proxyBootstrapDns.length ? proxyBootstrapDns : [ "223.5.5.5", "1.1.1.1" ];
  // === DNS 主配置：防泄露、分流与自举稳定性 ===
  // 负责 fake-ip、nameserver、hosts 与策略分流的统一落盘。
  // 防泄露原则：
  // 1) fake-ip 接管应用 DNS，避免系统直连 ISP DNS；
  // 2) respect-rules=true 让 DNS 查询跟随分流规则（境外走代理、国内直连）；
  // 3) nameserver 用境外可信 DoH；direct-nameserver / proxy-server-nameserver 用国内解析，避免环依赖与污染。
  // 安全兜底：确保关键 DNS 数组不为空，防止内核因空 nameserver 崩溃。
    config.dns = Object.assign({}, config.dns || {}, {
    enable: !0,
    listen: "0.0.0.0:1053",
    ipv6: !0,
    "ipv6-timeout": 150,
    "cache-algorithm": "arc",
    "cache-size": 4096,
    "prefer-h3": !1,
    // DNS 跟随规则：境外域名的解析请求经代理发出，显著降低 DNS 泄露面。
    "use-system-hosts": !1,
    "edns-preserve-mode": "passthrough",
    "respect-rules": !0,
    "use-hosts": !0,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.0/15",
    "fake-ip-filter-mode": "blacklist",
    "fake-ip-ttl": 60,
    "fake-ip-filter": sanitizeCompatDomainList(uniqList([ 
    // 局域网 / 本地域名：这类地址通常用于内网发现与本地服务，不适合 fake-ip。
    ...asArray(config.dns && config.dns["fake-ip-filter"]), 
    // 连通性检测：系统用来判断网络状态，使用 fake-ip 容易触发误判。
    ...DNS_FAKE_IP_FILTER_SETS.lan, 
    // 时间同步：NTP / 校时域名应返回真实地址，避免时钟同步异常。
    ...DNS_FAKE_IP_FILTER_SETS.connectivityCheck, 
    // 路由器 / 网关管理地址：管理页和本地路由器域名不应走 fake-ip。
    ...DNS_FAKE_IP_FILTER_SETS.timeSync, 
    // STUN / TURN / Relay：实时通信协商依赖真实地址，fake-ip 容易破坏打洞与中继。
    ...DNS_FAKE_IP_FILTER_SETS.routerGateway, 
    // 主机平台 / 家用设备联机认证：保持真实解析，减少 NAT / 联机检测异常。
    ...DNS_FAKE_IP_FILTER_SETS.realtimeRelay, 
    // 海外 PC / 主机游戏平台：下载器、认证、联机与反作弊链路尽量保留真实 IP。
    ...DNS_FAKE_IP_FILTER_SETS.consoleAuth, 
    // Cloudflare 挑战 / 验证资源：验证码与挑战链路对真实地址更敏感。
    ...DNS_FAKE_IP_FILTER_SETS.gamingPlatforms, 
    // 支付 / 风控 / 本地域名：尽量保留真实解析，减少 App 内校验、回环服务与局域网发现异常。
    ...DNS_FAKE_IP_FILTER_SETS.cloudflareChallenge, ...DNS_FAKE_IP_FILTER_SETS.pushAndCast ])),
    nameserver: uniqList([ ...safeTrustDns, ...asArray(config.dns && config.dns.nameserver).filter(item => {
      const text = String(item || "");
      return /^https:\/\//i.test(text) && !safeLocalDns.includes(item) && !safeCnDns.includes(item);
    }) ]),
    "default-nameserver": uniqList([ ...trustBootstrapDns, ...safeLocalDns ]),
    // 节点服务器域名必须直连解析；不再追加本地 DNS 回退，优先使用可直连的中立公共解析器完成自举。
    "direct-nameserver": safeFastDomesticDns,
    "proxy-server-nameserver": uniqList([ ...safeProxyBootstrapDns, ...asArray(config.dns && config.dns["proxy-server-nameserver"]).filter(item => !safeCnDns.includes(item) && !safeLocalDns.includes(item)) ])
  }), config.dns["fake-ip-filter"] = function(filter, domains) {
    const blocked = new Set(asArray(domains).map(domain => String(domain || "").trim().replace(/^\+\./, "").replace(/^\*\./, "").toLowerCase()).filter(Boolean));
    return asArray(filter).filter(item => {
      const normalized = String(item || "").trim().replace(/^\+\./, "").replace(/^\*\./, "").toLowerCase();
      return normalized && !blocked.has(normalized);
    });
  }(config.dns["fake-ip-filter"], uniqList([ "play.google.com", "market.android.com", "play.googleapis.com", "play-fe.googleapis.com", "play-pa.googleapis.com", "playatoms-pa.googleapis.com", "play-apps-fe-pa.googleapis.com", "play-apps-download-frontend.googleapis.com", "android.googleapis.com", "android.clients.google.com", "android.clients.google.com.cn", "play-lh.googleusercontent.com", "play-games.googleusercontent.com", "dl.google.com", "dl.l.google.com", "+.gvt1.com", "+.gvt2.com", "+.gvt3.com", "+.xn--ngstr-lra8j.com", "+.xn--ngstr-cn-8za9o.com", "+.services.googleapis.cn", "+.googleapis.cn", ...googleDomains(), "jnn-pa.googleapis.com", "youtubeembeddedplayer.googleapis.com", "video.google.com", "+.googlevideo.com", "+.ytimg.com", "+.ggpht.com", "+.youtube.com", "+.youtu.be", ...aiDomains(), ...telegramDomains(), ...tiktokDomains(), ...streamingDomains(), ...developerDomains(), ...metaDomains(), ...discordDomains() ]));
  const nameserverPolicy = Object.assign({}, config.dns["nameserver-policy"] || {}, {
    "geosite:private": safeFastDomesticDns,
    "geosite:cn": safeFastDomesticDns,
    "geosite:geolocation-!cn": safeTrustDns,
    "geosite:category-ads-all": safeAdguardDns
  }), dnsBootstrapPolicy = {
    "dns.alidns.com": safeLocalDns,
    "doh.pub": safeLocalDns,
    "doh.360.cn": safeLocalDns,
    "dns.google": trustBootstrapDns,
    "dns.google.com": trustBootstrapDns,
    "dns64.dns.google": trustBootstrapDns,
    "cloudflare-dns.com": trustBootstrapDns,
    "mozilla.cloudflare-dns.com": trustBootstrapDns,
    "one.one.one.one": trustBootstrapDns,
    "family.cloudflare-dns.com": trustBootstrapDns,
    "security.cloudflare-dns.com": trustBootstrapDns,
    "dns.adguard-dns.com": trustBootstrapDns,
    "dns.quad9.net": trustBootstrapDns,
    "dns11.quad9.net": trustBootstrapDns
  };
  for (const [k, v] of Object.entries(dnsBootstrapPolicy)) nameserverPolicy[k] = v;
  function appendDnsPolicyDomains(target, domains, dnsList) {
    const list = asArray(domains);
    for (let i = 0; i < list.length; i++) {
      const domain = list[i];
      domain && (target[domain] = dnsList);
    }
    // DNS / 分组 / 规则联动注册表：每项声明业务目标、策略域名、解析器和 fallback 域名。
    // 新增或扩展业务时优先修改此表及对应域名集合，避免 nameserver-policy 与 fallback-filter 分散维护。
    }
  const DNS_SERVICE_BINDINGS = [ {
    key: "广告拦截",
    policyDomains: DNS_POLICY_DOMAIN_SETS.adguard,
    dns: safeAdguardDns
  }, {
    key: "TikTok",
    policyDomains: DNS_POLICY_DOMAIN_SETS.tiktok,
    fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.tiktok,
    dns: safeTrustDns
  }, {
    key: "AdGuard服务",
    policyDomains: DNS_POLICY_DOMAIN_SETS.adguardService,
    dns: safeTrustDns,
    auxiliary: !0
  }, {
    key: "风控安全",
    policyDomains: uniqList([].concat(DNS_POLICY_DOMAIN_SETS.browserRisk, DNS_POLICY_DOMAIN_SETS.finance, DNS_POLICY_DOMAIN_SETS.crypto)),
    fallbackDomains: uniqList([].concat(DNS_FALLBACK_FILTER_DOMAIN_SETS.finance, DNS_FALLBACK_FILTER_DOMAIN_SETS.crypto)),
    dns: safeTrustDns
  }, {
    key: "国外AI",
    policyDomains: uniqList([].concat(DNS_POLICY_DOMAIN_SETS.openaiRealtime, DNS_POLICY_DOMAIN_SETS.ai)),
    fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.ai,
    dns: safeTrustDns
  }, {
    key: "Google",
    policyDomains: DNS_POLICY_DOMAIN_SETS.google,
    dns: safeTrustDns
  }, {
    key: "谷歌商店",
    policyDomains: DNS_POLICY_DOMAIN_SETS.playStore,
    fallbackDomains: uniqList([].concat(DNS_FALLBACK_FILTER_DOMAIN_SETS.playStore, DNS_FALLBACK_FILTER_DOMAIN_SETS.googlePlayIntegrity)),
    dns: safeTrustDns
  }, {
    key: "YouTube",
    policyDomains: DNS_POLICY_DOMAIN_SETS.youtubeMedia,
    fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.youtubeMedia,
    dns: safeTrustDns
  }, {
    key: "翻译服务",
    policyDomains: DNS_POLICY_DOMAIN_SETS.translation,
    fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.translation,
    dns: safeTrustDns
  }, {
    key: "Telegram",
    policyDomains: DNS_POLICY_DOMAIN_SETS.telegram,
    fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.telegram,
    dns: safeTrustDns
  }, {
    key: "Meta",
    policyDomains: DNS_POLICY_DOMAIN_SETS.meta,
    fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.meta,
    dns: safeTrustDns
  }, {
    key: "Discord",
    policyDomains: DNS_POLICY_DOMAIN_SETS.discord,
    fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.discord,
    dns: safeTrustDns
  }, {
    key: "流媒体",
    policyDomains: DNS_POLICY_DOMAIN_SETS.streaming,
    fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.streaming,
    dns: safeTrustDns
  }, {
    key: "国外游戏",
    policyDomains: DNS_POLICY_DOMAIN_SETS.gaming,
    fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.gaming,
    dns: safeTrustDns
  }, {
    key: "微软Bing",
    policyDomains: DNS_POLICY_DOMAIN_SETS.microsoftBing,
    dns: safeTrustDns
  }, {
    key: "GitHub",
    policyDomains: DNS_POLICY_DOMAIN_SETS.developer,
    fallbackDomains: uniqList([].concat(DNS_FALLBACK_FILTER_DOMAIN_SETS.developer, DNS_FALLBACK_FILTER_DOMAIN_SETS.devCommunity)),
    dns: safeTrustDns
  }, {
    key: "Twitter",
    policyDomains: DNS_POLICY_DOMAIN_SETS.twitter,
    fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.twitter,
    dns: safeTrustDns
  }, {
    key: "Apple",
    policyDomains: DNS_POLICY_DOMAIN_SETS.appleService,
    dns: safeTrustDns
  }, {
    key: "Twitch",
    policyDomains: DNS_POLICY_DOMAIN_SETS.twitch,
    fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.twitch,
    dns: safeTrustDns
  }, {
    key: "社交信息流",
    policyDomains: DNS_POLICY_DOMAIN_SETS.socialFeed,
    fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.socialFeed,
    dns: safeTrustDns
  }, {
    key: "日韩生态区",
    policyDomains: DNS_POLICY_DOMAIN_SETS.jpKrEcosystem,
    fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.jpKrEcosystem,
    dns: safeTrustDns
  }, {
    key: "Niconico",
    policyDomains: DNS_POLICY_DOMAIN_SETS.niconico,
    fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.niconico,
    dns: safeTrustDns
  }, {
    key: "台湾媒体",
    policyDomains: DNS_POLICY_DOMAIN_SETS.taiwanMedia,
    fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.taiwanMedia,
    dns: safeTrustDns
  }, {
    key: "海外通用",
    policyDomains: DNS_POLICY_DOMAIN_SETS.mainstreamOverseas,
    fallbackDomains: uniqList([].concat(DNS_FALLBACK_FILTER_DOMAIN_SETS.meta, DNS_FALLBACK_FILTER_DOMAIN_SETS.devCommunity, DNS_FALLBACK_FILTER_DOMAIN_SETS.discord, DNS_FALLBACK_FILTER_DOMAIN_SETS.telegram, DNS_FALLBACK_FILTER_DOMAIN_SETS.streaming, DNS_FALLBACK_FILTER_DOMAIN_SETS.gaming, DNS_FALLBACK_FILTER_DOMAIN_SETS.collaboration, DNS_FALLBACK_FILTER_DOMAIN_SETS.socialExtra, DNS_FALLBACK_FILTER_DOMAIN_SETS.bigTech)),
    dns: safeTrustDns,
    auxiliary: !0
  }, {
    key: "隐私与连通性",
    policyDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.privacyAndCaptivePortal,
    fallbackDomains: DNS_FALLBACK_FILTER_DOMAIN_SETS.privacyAndCaptivePortal,
    dns: safeTrustDns,
    auxiliary: !0
  } ], dnsBindingFallbackDomains = [];
  for (let i = 0; i < DNS_SERVICE_BINDINGS.length; i++) {
    const binding = DNS_SERVICE_BINDINGS[i];
    appendDnsPolicyDomains(nameserverPolicy, binding.policyDomains, binding.dns);
    const fallbackDomains = asArray(binding.fallbackDomains);
    for (let j = 0; j < fallbackDomains.length; j++) dnsBindingFallbackDomains.push(fallbackDomains[j]);
  }
  const sanitizedNameserverPolicy = {};
  for (const [k, v] of Object.entries(nameserverPolicy || {})) {
    const key = sanitizeCompatDomainPattern(k), arr = sanitizeDnsServerList(v);
    key && arr.length && (sanitizedNameserverPolicy[key] = arr);
  }
  // geosite: 前缀在 mihomo 的 nameserver-policy 中是合法语法，但上面的
  // sanitizeCompatDomainPattern 为兼容旧前端会把 rule-set:/geosite: 键一律丢弃，
  // 实际后果：国内域名只剩逐条枚举的百余项目走国内 DNS，其余全部落到主 nameserver
  // （境外 DoH），抖音 CDN 这类域名被解析到境外/异地节点后直连必然绕路、卡顿。
  // 这里在清洗之后重新注入，保证「国内域名 = 国内解析」这条链路真正生效。
    const reinjectGeoPolicy = [ [ "geosite:private", safeFastDomesticDns ], [ "geosite:cn", safeFastDomesticDns ], [ "geosite:geolocation-!cn", safeTrustDns ], [ "geosite:category-ads-all", safeAdguardDns ] ];
  for (const [k, v] of reinjectGeoPolicy) {
    const arr = sanitizeDnsServerList(v);
    arr.length && (sanitizedNameserverPolicy[k] = arr);
  }
  // 字节系等国内直连域名的解析绑定，已由文件末尾的
  // syncDnsPolicyWithRules 从规则表自动派生，无需在此硬编码。
  // 节点域名解析策略：仅作用于代理节点域名，避免和通用业务 DNS 分流混用。
    config.dns["nameserver-policy"] = sanitizedNameserverPolicy;
  const proxyServerNameserverPolicy = Object.assign({}, config.dns["proxy-server-nameserver-policy"] || {});
  for (const [k, v] of Object.entries(dnsBootstrapPolicy)) proxyServerNameserverPolicy[k] = v;
  // fallback 过滤器：决定哪些域名 / IP 结果需要优先参考 fallback DNS。
    config.dns["proxy-server-nameserver-policy"] = proxyServerNameserverPolicy, 
  // GEOIP 过滤：国内 IP 结果优先视为可信，减少无意义 fallback。
  config.dns["fallback-filter"] = {
    geoip: !0,
    // 特殊保留 / 常见污染地址段：这类结果通常不应作为正常公网解析结果使用。
    "geoip-code": "CN",
    ipcidr: [ "0.0.0.0/32", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "169.254.169.254/32", "172.16.0.0/12", "192.168.0.0/16", "198.18.0.0/15", "224.0.0.0/4", "240.0.0.0/4", "::/128", "::1/128", "64:ff9b::/96", "100::/64", "2001::/32", "2001:db8::/32", "2002::/16", "fc00::/7", "fe80::/10", 
    // 域名白名单：由服务联动表聚合；额外保留仅用于基础设施校验的 fallback 域名。
    "ff00::/8", "203.0.113.0/24", "198.51.100.0/24", "192.0.2.0/24" ],
    // DNS fallback：主查询保持 Cloudflare + Google，后备层额外纳入 Quad9 扩大污染兜底面。
    domain: uniqList([ 
    // 直连域名（国内 / 局域网 / 直连策略）使用国内 DoH + 本地 DNS，避免境外绕路。
    ...dnsBindingFallbackDomains, 
    // default-nameserver 只能是 IP，避免 DoH 域名在 bootstrap 阶段形成解析环。
    ...DNS_FALLBACK_FILTER_DOMAIN_SETS.infra ])
  }, config.dns.fallback = safeFallbackDns, config.dns["default-nameserver"] = uniqList(asArray(config.dns["default-nameserver"]).filter(server => {
    const text = String(server || "").trim();
    return !!text && !(/^https?:\/\//i.test(text) || /^tls:\/\//i.test(text) || /^quic:\/\//i.test(text)) && (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(text) || text.includes(":"));
  })), config.dns["default-nameserver"].length || (config.dns["default-nameserver"] = trustBootstrapDns.slice()), 
  config.ipv6 = !0, config.dns.enable = !0, 
  // === 节点处理：清洗、识别、分类与排序 ===
  // 过滤非真实代理的正则表达式
  // 这里必须保守过滤：很多真实节点名会带有 airport / vpn / proxy / 流量倍率等字样，
  config.dns.ipv6 = !0, config.dns["enhanced-mode"] = "fake-ip", config.dns["respect-rules"] = !0, 
  config.dns["use-system-hosts"] = !1;
  const PROXY_INFO_RE = /(?:https?:\/\/|www\.|导航网址|网址导航|距离下次重置|流量已用|流量余额|已用流量|总流量|流量(?:剩余|到期|重置)|套餐(?:到期|余额|剩余)?|订阅(?:链接|地址|信息)?|官方(?:网站|网址|公告|通知|频道|群组)?|公告|通知|使用说明|更新订阅|复制链接|浏览器打开|更新时间|请使用|客户端|售后|工单|教程|返利|邀请|购买|续费|维护|客服|永久官网|备用地址|节点状态|账户|邮箱|验证码|防失联|网址|域名|无法使用|禁止|过期|失效|广告|推广|赞助|加群|进群|群聊|交流群|频道订阅|关注频道)/i, PROXY_INFO_LINE_RE = /(?:^|[\s|｜:：,，;；\-+_\[\]【】()（）])(?:剩余|到期|过期|已用|重置|官网|订阅|套餐|更新|通知|公告|客服|网址|邮箱|账户|广告|推广|赞助|频道订阅|关注频道|加群|进群|交流群|官方群)(?:[\s|｜:：,，;；\-+_\[\]【】()（）]|$)/i, PROXY_TRAFFIC_RE = /(?:\d+(?:\.\d+)?\s*(?:GB|MB|TB|G|M|T)\s*[\/\|]\s*\d+(?:\.\d+)?\s*(?:GB|MB|TB|G|M|T)|(?:剩余|已用|总计|流量).{0,12}\d+(?:\.\d+)?\s*(?:GB|MB|TB|G|M|T))/i, PROXY_DATE_RE = /(?:20\d{2}[-\/.年]\d{1,2}[-\/.月]\d{1,2}|\d{1,2}[-\/.月]\d{1,2}日?).{0,8}(?:到期|过期|重置|更新|expire|reset)/i, PROXY_PROMO_HANDLE_RE = /(?:^|[\s|｜:：,，;；\-+_\[\]【】()（）])@?[a-z0-9_]{2,}(?:tg|telegram|channel|group)[a-z0-9_]*(?:[\s|｜:：,，;；\-+_\[\]【】()（）]|$)/i;
  function isRealProxyName(name) {
    const text = String(name || "").trim();
    return !(!text || /^(urltest|select|fallback|load-balance)\b/i.test(text) || /^(DIRECT|REJECT|REJECT-DROP|PASS)$/i.test(text) || /^[-=*_\s|｜]+$/.test(text) || /^\d+$/.test(text) || /\b\d+\/\d+\b/.test(text) || PROXY_TRAFFIC_RE.test(text) || PROXY_DATE_RE.test(text) || PROXY_PROMO_HANDLE_RE.test(text) || PROXY_INFO_RE.test(text) || PROXY_INFO_LINE_RE.test(text));
  }
  // ═══ 节点特征识别器（家宽 / 专线 / 倍率 / 流媒体 / 运营商）═══
  // ── 运营商识别 ── 关键字命中即归类（同一节点可归入多个运营商），供运营商优化组使用
    const CARRIER_CLASSIFIER = {
    carriers: [ {
      label: "移动",
      kw: [ "移动", "cmcc", "chinamobile", "china mobile" ]
    }, {
      label: "联通",
      kw: [ "联通", "cucc", "chinaunicom", "china unicom" ]
    }, {
      label: "电信",
      kw: [ "电信", "ctcc", "chinatelecom", "china telecom" ]
    }, {
      label: "广电",
      kw: [ "广电", "cbn", "cbnnet", "chinabroadcast", "china broadcast" ]
    } ],
    carrierIcons: {
      "移动": EXTERNAL_URLS.cdn.jsdelivrFastly + "/mini@master/Color/10086.png",
      "联通": EXTERNAL_URLS.cdn.jsdelivrFastly + "/mini@master/Color/10010.png",
      "电信": EXTERNAL_URLS.cdn.jsdelivrFastly + "/mini@master/Color/10000.png",
      "广电": EXTERNAL_URLS.cdn.iconify + "tabler:router.svg?color=%23722ED1"
    },
    carrierEmoji: {
      "移动": "📱",
      "联通": "📶",
      "电信": "☎️",
      "广电": "🗼"
    },
    matchCarriers(name) {
      const c = String(name || "").toLowerCase(), found = [];
      for (const car of this.carriers) car.kw.some(k => c.includes(k)) && found.push(car.label);
      return found;
    },
    // ── 三网优化识别（独立于运营商，不与移动/联通/电信/广电交叉）──
    // 命名含“三网”字样即视为三网优化线路（同时服务移动·联通·电信），
    // 单独成组，避免被误归入某一个运营商优化组造成选线偏差。
    isTripleNet: name => String(name || "").includes("三网"),
    classifyAll(proxyNames) {
      const result = {};
      for (const name of proxyNames) {
        const cars = this.matchCarriers(name);
        for (const c of cars) result[c] || (result[c] = []), result[c].push(name);
      }
      return result;
    },
    buildGroups(carrierMap, anchorFn) {
      const groups = [], visible = [];
      for (const car of this.carriers) {
        const list = carrierMap[car.label];
        if (!list || !list.length) continue;
        const emoji = this.carrierEmoji[car.label], autoName = emoji + car.label + "优化自动", selName = emoji + car.label + "优化", icon = this.carrierIcons[car.label];
        groups.push(Object.assign(anchorFn(!0), {
          name: autoName,
          proxies: list.slice(),
          icon: icon
        })), groups.push({
          name: selName,
          type: "select",
          proxies: [ autoName ].concat(list.slice()),
          "empty-fallback": "REJECT",
          icon: icon
        }), visible.push(selName);
      }
      return {
        groups: groups,
        visible: visible
      };
    }
  }, _residentialNegCombined = new RegExp([ /商宽|商务宽带|商业宽带|企业宽带|企业专线|商用线路/, /\biepl\b/i, /\biplc\b/i, /\bcn2\b/i, /\bgia\b/i, /\bbgp\b/i, /\bdedicated\b/i, /\bpremium(?:\s|-|_)*(?:line|route|link)?\b/i ].map(re => re.source).join("|"), "i"), _residentialPosCombined = new RegExp([ /家宽|家庭宽带|家庭住宅|住宅宽带|住宅|宽带|民用宽带|家庭网络|原生住宅/, /\bresi(?:dential)?\b/i, /\bhome(?:\s|-|_)?ip\b/i, /\bhome(?:\s|-|_)?broadband\b/i, /\bbroadband\b/i, /\bisp\b/i, /\bnative(?:\s|-|_)?ip\b/i, /\bhome(?:\s|-|_)?network\b/i, /\bconsumer(?:\s|-|_)?line\b/i, /\bhouse(?:\s|-|_)?hold\b/i, /\bresi(?:\s|-|_)?ip\b/i ].map(re => re.source).join("|"), "i"), _residentialOverride = /家宽|住宅|resi|home\s*ip|native\s*ip/i;
  function isResidentialProxyName(name) {
    const text = String(name || "");
    return !!text && !(_residentialNegCombined.test(text) && !_residentialOverride.test(text)) && _residentialPosCombined.test(text);
  }
  const multiplierNamePatterns = [ /倍率/, /\bbandwidth\b/i, /\bboost\b/i, /\bturbo\b/i, /(?<![a-z])\d+(?:\.\d+)?\s*x\b/i, /\bx\s*\d+(?:\.\d+)?(?![a-z])/i, /\d+(?:\.\d+)?\s*倍/, /×/, /[\d０-９]\s*[%％]/ ], multiplierSortInfoCache = new Map;
  function getMultiplierSortInfo(name) {
    const cacheKey = String(name || "");
    if (multiplierSortInfoCache.has(cacheKey)) return multiplierSortInfoCache.get(cacheKey);
    const n = cacheKey.toLowerCase().replace(/[０-９]/g, function(c) {
      return String.fromCharCode(c.charCodeAt(0) - 65248);
    }).replace(/[．。]/g, ".").replace(/[ｘＸ×]/g, "x").replace(/[％%]/g, "%").replace(/[（【［(]/g, "(").replace(/[）】］)]/g, ")").replace(/[，、｜|_]/g, " ").replace(/倍率/g, "x").replace(/倍/g, "x").replace(/\s+/g, " ").trim(), candidates = [], re = /(?<![a-z])(\d+(?:\.\d+)?)\s*x\b|\bx\s*(\d+(?:\.\d+)?)(?![a-z])/gi;
    let m;
    for (;null !== (m = re.exec(n)); ) {
      const v = Number(m[1] || m[2]);
      Number.isFinite(v) && v > 0 && v <= 100 && candidates.push({
        value: v,
        index: m.index
      });
    }
    if (!candidates.length) {
      var pm = n.match(/(\d+(?:\.\d+)?)\s*%/);
      if (pm) {
        var pv = Number(pm[1]);
        if (Number.isFinite(pv) && pv > 0 && pv <= 1e4) {
          var pval = pv / 100;
          pval > 0 && pval <= 100 && candidates.push({
            value: pval,
            index: pm.index
          });
        }
      }
    }
    if (candidates.length) {
      candidates.sort((a, b) => a.value - b.value || a.index - b.index);
      const result = {
        value: candidates[0].value,
        recognized: !0
      };
      return multiplierSortInfoCache.set(cacheKey, result), result;
    }
    const result = {
      value: Number.POSITIVE_INFINITY,
      recognized: !1
    };
    return multiplierSortInfoCache.set(cacheKey, result), result;
  }
  function isMultiplierProxyName(name) {
    const text = String(name || "");
    return !!multiplierNamePatterns.some(re => re.test(text)) || getMultiplierSortInfo(text).recognized;
  }
  const _streamingCombined = new RegExp([ /流媒体|streaming|unlock|奈飞|netflix|disney|hbo|max|prime|youtube|ytb|bilibili|b站|爱奇艺|iqiyi|腾讯视频|abema|bahamut|动画疯|tvb|dazn|hulu|pornhub/i, /媒体全解|全流媒体|流媒体专用|流媒体优化|流媒体节点|流媒体线路|原生解锁|全解锁|流媒体解锁/, /\bnf\b/i, /\bmedia\b/i, /\bstream(?:ing)?\b/i ].map(re => re.source).join("|"), "i");
  // 优化：合并为单一正则
    function isStreamingProxyName(name) {
    return _streamingCombined.test(String(name || ""));
  }
  const _dedicatedNameCombined = new RegExp([ /专线|精品专线|国际专线|跨境专线|直连专线|专线节点|专线线路|专线优化|企业专线|游戏专线|加速专线|高速专线|隧道专线|独享专线|独享线路|静态专线|内网专线|跨区专线|跨洋专线/, /联通精品|电信精品|移动精品|精品网|精品线路|陆缆|海缆专线|商宽专线|商业专线/, /独享\s*IP|静态\s*IP|固定\s*IP/, /\biplc\b/i, /\biepl\b/i, /\bcni?2(?:\s|-|_)*gia\b/i, /\bbgp(?:\s|-|_)*(?:transit|direct|line|专线)\b/i, /\bdedicated(?:\s|-|_)*(?:line|link|route|ip)?\b/i, /\bprivate(?:\s|-|_)*(?:line|link|route)\b/i, /\bleased(?:\s|-|_)*line\b/i, /\bpremium(?:\s|-|_)*(?:line|route|link)\b/i, /\bexpress(?:\s|-|_)*(?:line|route)\b/i, /\bas(?:9929|4837|4134|4809|9808|58453)\b/i, /(?:^|[^0-9])(?:9929|4837)(?:[^0-9]|$)/ ].map(re => re.source).join("|")), _dedicatedContextCombined = new RegExp([ /(?:优化|高速|低延迟|低延时|直达|直连).{0,6}(?:专线|线路|通道|隧道)/, /(?:专线|线路|通道|隧道).{0,6}(?:优化|高速|低延迟|低延时|直达|直连)/, /(?:iplc|iepl|cn2|gia|bgp).{0,8}(?:专线|线路|直连|直达)/i ].map(re => re.source).join("|"), "i");
  function isDedicatedProxyName(name) {
    const text = String(name || "");
    return !!text && (!!_dedicatedNameCombined.test(text) || _dedicatedContextCombined.test(text));
  }
  const cleanProxies = [], allProxyNames = [], residentialProxyNames = [], dedicatedProxyNames = [], multiplierProxyNames = [], streamingProxyNames = [], proxyHostnames = new Set, seenProxyNames = new Set;
  // 剔除 server/sni/servername 带非法字符（如订阅源脏数据中出现的 "+"）的节点，
  // 避免这类字段被内核校验拒绝导致整份配置导入失败。
  for (let i = 0; i < config.proxies.length; i++) {
    const proxy = config.proxies[i], proxyName = proxy && proxy.name;
    proxyName && isRealProxyName(proxyName) && !seenProxyNames.has(proxyName) && isValidProxyServerField(proxy && proxy.server) && isValidOptionalProxyDomainField(proxy && proxy.sni) && isValidOptionalProxyDomainField(proxy && proxy.servername) && isValidProxyPort(proxy && proxy.port) && (seenProxyNames.add(proxyName), 
    // Cloudflare/Anycast 中转节点：优先 IPv4 解析（CF 双栈入口 v4 通常更稳），并关 TFO 避免 CF 边缘抖动。
    CF_ANYCAST_NAME_RE.test(proxyName) && (void 0 === proxy["ip-version"] && (proxy["ip-version"] = "ipv4-prefer"), 
    void 0 === proxy.tfo && (proxy.tfo = !1)), 
    // IPv6-only 节点：入口只有 AAAA 记录，直接声明走 v6，省掉 dual 模式下白等一轮 A 查询。
    IPV6_ONLY_NAME_RE.test(proxyName) && void 0 === proxy["ip-version"] && (proxy["ip-version"] = "ipv6"), 
    // anytls：补空闲会话保活三参数（检查间隔 30s / 空闲超时 60s / 最小空闲会话 2），避免长连接被中间设备回收后反复重连。
    "anytls" === proxy.type && (
    void 0 === proxy["idle-session-check-interval"] && (proxy["idle-session-check-interval"] = 30), 
    void 0 === proxy["idle-session-timeout"] && (proxy["idle-session-timeout"] = 60), 
    void 0 === proxy["min-idle-session"] && (proxy["min-idle-session"] = 2)), 
    // Hysteria2：基于 QUIC，禁用 GSO/ECN 兼容性问题已在全局 experimental 处理。
    // 这里补两项：1) 允许 0-RTT/连接迁移前的快速重连；2) 若订阅带端口跳跃(ports)则保留 hop-interval
    // 兜底为 30s。不动 up/down —— 那是机场按套餐标定的 Brutal 速率，改高会触发过度发包导致丢包变慢。
    "hysteria2" === proxy.type && (void 0 === proxy["fast-open"] && (proxy["fast-open"] = !0), 
    proxy.ports && void 0 === proxy["hop-interval"] && (proxy["hop-interval"] = 30)), 
    // VLESS：这批是 Cloudflare xhttp 中转（network=xhttp）。补 tfo=false 避免 CF 边缘 TFO 抖动，
    // 并统一 client-fingerprint=chrome 让 TLS 指纹稳定通过 CF 前置校验。不改 network/servername/
    // xhttp-opts 等回源关键字段，避免破坏 CDN 匹配。
    "vless" === proxy.type && (void 0 === proxy.tfo && (proxy.tfo = !1), void 0 === proxy["client-fingerprint"] && (proxy["client-fingerprint"] = "chrome")), 
    // TLS 1.3 强制：对所有 TLS 节点统一声明 tls13-ciphers，排除 TLS 1.2 旧套件，防止降级攻击与协议歧义。
    "vless" !== proxy.type && "trojan" !== proxy.type && "shadowsocks" !== proxy.type || proxy.tls && !proxy.tls["tls13-ciphers"] && (proxy.tls["tls13-ciphers"] = "TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256"), 
    cleanProxies.push(proxy), allProxyNames.push(proxyName), isHostname(proxy.server) && proxyHostnames.add(String(proxy.server).trim().toLowerCase()), 
    isHostname(proxy.servername) && proxyHostnames.add(String(proxy.servername).trim().toLowerCase()), 
    isResidentialProxyName(proxyName) && residentialProxyNames.push(proxyName), isDedicatedProxyName(proxyName) && dedicatedProxyNames.push(proxyName), 
    isMultiplierProxyName(proxyName) && multiplierProxyNames.push(proxyName), isStreamingProxyName(proxyName) && streamingProxyNames.push(proxyName));
  }
  for (const hostname of proxyHostnames) proxyServerNameserverPolicy[hostname] || (proxyServerNameserverPolicy[hostname] = proxyBootstrapDns);
  config.dns["proxy-server-nameserver-policy"] = proxyServerNameserverPolicy;
  for (const directName of directProxyNames) seenProxyNames.has(directName) || 
  // 空节点保护：若过滤后无可用节点，强行插入直连占位以防内核崩溃
  cleanProxies.push({
    name: directName,
    type: "direct",
    "ip-version": directProxyIpVersionMap[directName]
  });
  config.proxies = cleanProxies, config.proxies.length || config.proxies.push({
    name: "DIRECT",
    type: "direct"
  });
  const wholeWordPatternCache = new Map;
  function hasWholeWord(text, word) {
    const key = String(word || "").toLowerCase();
    let pattern = wholeWordPatternCache.get(key);
    if (!pattern) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\/\-]/g, "\\$&");
      pattern = new RegExp("(^|[^a-z])" + escaped + "([^a-z]|$)", "i"), 
      // 地区识别
      wholeWordPatternCache.set(key, pattern);
    }
    return pattern.test(String(text || ""));
  }
  const regionGroups = {
    "香港": [],
    "台湾": [],
    "日本": [],
    "新加坡": [],
    "美国": [],
    "韩国": [],
    "俄罗斯": [],
    "欧盟": [],
    "东南亚": [],
    "加拿大": [],
    // 地区匹配库（中文/英文/ISO/机场码）
    "拉美地区": [],
    "非洲": [],
    "其它地区": []
  }, REGION_MATCH_DB = [ {
    id: "香港",
    keywords: [ "香港", "港", "港区", "港服", "hong kong", "hongkong", "hkbn", "hkt", "kowloon", "tsim sha tsui", "central", "旺角", "油尖旺", "沙田" ],
    iso: [ "HK", "HKG", "HKIX" ]
  }, {
    id: "台湾",
    keywords: [ "台湾", "台灣", "台北", "台中", "高雄", "新北", "桃园", "桃園", "新竹", "台南", "台东", "花莲", "taiwan", "taipei", "taichung", "kaohsiung", "hsinchu", "tainan", "taoyuan", "new taipei", "hualien" ],
    iso: [ "TW", "TWN", "TPE", "KHH", "TSA" ]
  }, {
    id: "日本",
    keywords: [ "日本", "东京", "大阪", "横滨", "名古屋", "福冈", "札幌", "京都", "神户", "千叶", "埼玉", "仙台", "广岛", "冲绳", "那霸", "japan", "tokyo", "osaka", "nagoya", "saitama", "yokohama", "fukuoka", "kawasaki", "chiba", "sapporo", "okinawa", "naha", "kyoto", "kobe", "sendai", "hiroshima" ],
    iso: [ "JP", "JPN", "NRT", "HND", "KIX", "NGO", "FUK", "CTS", "OKA" ]
  }, {
    id: "新加坡",
    keywords: [ "新加坡", "狮城", "星加坡", "singapore", "singtel", "sgp", "jurong", "woodlands", "changi" ],
    iso: [ "SG", "SGP", "SIN" ]
  }, {
    id: "美国",
    keywords: [ "美国", "united states", "america", "usa", "洛杉矶", "los angeles", "圣何塞", "san jose", "旧金山", "三藩市", "san francisco", "西雅图", "seattle", "纽约", "new york", "芝加哥", "chicago", "达拉斯", "dallas", "丹佛", "denver", "凤凰城", "phoenix", "亚特兰大", "atlanta", "迈阿密", "miami", "波士顿", "boston", "华盛顿", "washington", "费城", "philadelphia", "休斯顿", "houston", "圣地亚哥", "san diego", "拉斯维加斯", "las vegas", "波特兰", "portland", "硅谷", "silicon valley", "弗吉尼亚", "virginia", "夏洛特", "charlotte", "奥斯汀", "austin", "ashburn", "圣路易斯", "st louis", "盐湖城", "salt lake city", "俄勒冈", "oregon", "加州", "california" ],
    iso: [ "US", "USA", "LAX", "SJC", "SFO", "SEA", "JFK", "EWR", "ORD", "DFW", "IAD", "ATL", "MIA", "BOS", "DEN", "PHX", "IAH", "PHL", "SAN", "LAS", "PDX", "CLT", "SLC", "STL" ]
  }, {
    id: "韩国",
    keywords: [ "韩国", "南韩", "首尔", "釜山", "仁川", "大田", "大邱", "光州", "济州", "korea", "seoul", "busan", "incheon", "daejeon", "daegu", "gwangju", "jeju" ],
    iso: [ "KR", "KOR", "ICN", "GMP", "PUS", "CJU" ]
  }, {
    id: "俄罗斯",
    keywords: [ "俄罗斯", "俄国", "俄", "russia", "russian federation", "moscow", "moskva", "saint petersburg", "st. petersburg", "novosibirsk" ],
    iso: [ "RU", "RUS", "SVO", "DME" ]
  }, {
    id: "欧盟",
    keywords: [ "英国", "britain", "united kingdom", "england", "london", "manchester", "伯明翰", "birmingham", "爱尔兰", "ireland", "dublin", "德国", "germany", "frankfurt", "berlin", "munich", "hamburg", "cologne", "法国", "france", "paris", "marseille", "lyon", "nice", "荷兰", "netherlands", "holland", "amsterdam", "rotterdam", "土耳其", "turkey", "istanbul", "意大利", "italy", "milan", "rome", "florence", "西班牙", "spain", "madrid", "barcelona", "葡萄牙", "portugal", "lisbon", "瑞典", "sweden", "stockholm", "波兰", "poland", "warsaw", "瑞士", "switzerland", "zurich", "geneva", "奥地利", "austria", "vienna", "比利时", "belgium", "brussels", "丹麦", "denmark", "copenhagen", "芬兰", "finland", "helsinki", "挪威", "norway", "oslo", "希腊", "greece", "athens", "捷克", "czech", "prague", "匈牙利", "hungary", "budapest", "罗马尼亚", "romania", "bucharest", "保加利亚", "bulgaria", "sofia", "乌克兰", "ukraine", "kyiv", "kiev", "卢森堡", "luxembourg", "阿姆斯特丹", "法兰克福", "伦敦", "欧盟", "欧洲", "europe", "european union" ],
    iso: [ "EU", "GB", "UK", "DE", "FR", "NL", "TR", "IT", "ES", "SE", "PL", "CH", "AT", "BE", "DK", "FI", "NO", "IE", "PT", "GR", "CZ", "HU", "RO", "BG", "UA", "LU", "LHR", "LGW", "MAN", "CDG", "ORY", "FRA", "MUC", "BER", "AMS", "MAD", "BCN", "ZRH", "VIE", "LUX" ]
  }, {
    id: "东南亚",
    keywords: [ "东南亚", "southeast asia", "sea", "马来西亚", "malaysia", "kuala lumpur", "吉隆坡", "印度尼西亚", "印尼", "indonesia", "jakarta", "雅加达", "泰国", "thailand", "bangkok", "曼谷", "越南", "vietnam", "hanoi", "河内", "ho chi minh", "胡志明", "saigon", "菲律宾", "philippines", "manila", "马尼拉", "新加坡周边", "柬埔寨", "cambodia", "phnom penh", "金边", "缅甸", "myanmar", "yangon", "老挝", "laos", "vientiane", "文莱", "brunei", "槟城", "penang", "宿务", "cebu" ],
    iso: [ "MY", "MYS", "KUL", "PEN", "ID", "IDN", "CGK", "TH", "THA", "BKK", "VN", "VNM", "SGN", "HAN", "PH", "PHL", "MNL", "CEB", "KH", "KHM", "MM", "MMR", "LA", "LAO", "BN", "BRN", "SEA" ]
  }, {
    id: "加拿大",
    keywords: [ "加拿大", "canada", "toronto", "多伦多", "vancouver", "温哥华", "montreal", "蒙特利尔", "ottawa", "渥太华", "calgary", "卡尔加里" ],
    iso: [ "CA", "CAN", "YYZ", "YVR", "YUL" ]
  }, {
    id: "拉美地区",
    keywords: [ "拉美", "美洲", "americas", "拉丁美洲", "latin america", "南美", "south america", "中美洲", "central america", "加勒比", "caribbean", "墨西哥", "mexico", "mexico city", "墨西哥城", "cancun", "坎昆", "guadalajara", "monterrey", "巴西", "brazil", "saopaulo", "圣保罗", "rio de janeiro", "里约热内卢", "阿根廷", "argentina", "buenos aires", "布宜诺斯艾利斯", "智利", "chile", "santiago", "秘鲁", "peru", "lima", "利马", "哥伦比亚", "colombia", "bogota", "波哥大", "medellin", "委内瑞拉", "venezuela", "厄瓜多尔", "ecuador", "玻利维亚", "bolivia", "巴拉圭", "paraguay", "乌拉圭", "uruguay", "montevideo", "哥斯达黎加", "costa rica", "巴拿马", "panama", "牙买加", "jamaica" ],
    iso: [ "MX", "MEX", "BR", "BRA", "GRU", "GIG", "AR", "ARG", "EZE", "CL", "CHL", "PE", "PER", "CO", "COL", "VE", "VEN", "EC", "ECU", "BO", "BOL", "PY", "PRY", "UY", "URY", "AM" ]
  }, {
    id: "非洲",
    keywords: [ "非洲", "africa", "埃及", "egypt", "cairo", "开罗", "摩洛哥", "morocco", "casablanca", "肯尼亚", "kenya", "nairobi", "南非", "south africa", "johannesburg", "约翰内斯堡", "cape town", "开普敦", "pretoria", "尼日利亚", "nigeria", "lagos", "abuja", "ghana", "加纳", "accra", "埃塞俄比亚", "ethiopia", "坦桑尼亚", "tanzania", "乌干达", "uganda", "卢旺达", "rwanda", "突尼斯", "tunisia", "阿尔及利亚", "algeria", "苏丹", "sudan", "利比亚", "libya", "安哥拉", "angola", "喀麦隆", "cameroon", "塞内加尔", "senegal", "dakar" ],
    iso: [ "EG", "EGY", "CAI", "MA", "MAR", "KE", "KEN", "NBO", "ZA", "ZAF", "JNB", "CPT", "NG", "NGA", "GH", "GHA", "ET", "ETH", "TZ", "TZA", "UG", "UGA", "RW", "RWA", "TN", "TUN", "DZ", "DZA", "AF" ]
  }, {
    id: "其它地区",
    keywords: [ "印度", "india", "mumbai", "孟买", "delhi", "新德里", "bangalore", "班加罗尔", "澳大利亚", "澳洲", "australia", "悉尼", "sydney", "墨尔本", "melbourne", "brisbane", "perth", "adelaide", "新西兰", "new zealand", "奥克兰", "auckland", "wellington", "阿联酋", "uae", "emirates", "dubai", "迪拜", "abu dhabi", "卡塔尔", "qatar", "doha", "沙特", "saudi", "riyadh", "以色列", "israel", "tel aviv", "土耳其亚洲", "turkiye asia", "澳门", "macau", "macao", "蒙古", "mongolia", "关岛", "guam", "斐济", "fiji" ],
    // 旗帜优先
    iso: [ "IN", "IND", "BOM", "DEL", "BLR", "AU", "AUS", "SYD", "MEL", "NZ", "NZL", "AKL", "AE", "ARE", "DXB", "QA", "QAT", "DOH", "SA", "SAU", "IL", "ISR", "MO", "MAC", "MN", "MNG" ]
  } ], REGION_PRIORITY = REGION_MATCH_DB.map(entry => entry.id), REGION_FLAG_SOURCE = {
    "香港": /🇭🇰/,
    "台湾": /🇹🇼/,
    "日本": /🇯🇵/,
    "新加坡": /🇸🇬/,
    "美国": /🇺🇸|🇺🇲/,
    "韩国": /🇰🇷/,
    "俄罗斯": /🇷🇺/,
    "欧盟": /🇪🇺|🇬🇧|🇩🇪|🇫🇷|🇳🇱|🇮🇹|🇪🇸|🇸🇪|🇵🇱|🇨🇭|🇦🇹|🇧🇪|🇩🇰|🇫🇮|🇳🇴|🇹🇷|🇮🇪|🇵🇹|🇬🇷|🇨🇿|🇭🇺|🇺🇦|🇷🇴|🇧🇬/,
    "东南亚": /🇲🇾|🇮🇩|🇹🇭|🇻🇳|🇵🇭|🇰🇭|🇲🇲|🇱🇦|🇧🇳/,
    "加拿大": /🇨🇦/,
    "拉美地区": /🇲🇽|🇧🇷|🇦🇷|🇨🇱|🇵🇪|🇨🇴|🇻🇪|🇪🇨|🇧🇴|🇵🇾|🇺🇾/,
    "非洲": /🇪🇬|🇲🇦|🇰🇪|🇿🇦|🇳🇬|🇬🇭|🇪🇹|🇹🇿|🇺🇬|🇷🇼|🇹🇳|🇩🇿/
  }, REGION_FLAG_MAP = REGION_PRIORITY.map(regionName => [ regionName, REGION_FLAG_SOURCE[regionName] ]).filter(([, pattern]) => pattern instanceof RegExp), compiledRegionMatcherMap = Object.create(null);
  for (let i = 0; i < REGION_MATCH_DB.length; i++) {
    const region = REGION_MATCH_DB[i], terms = [].concat(asArray(region && region.keywords)).concat(asArray(region && region.iso)).filter(Boolean), compiledMatchers = [];
    for (let j = 0; j < terms.length; j++) {
      const lowerKeyword = String(terms[j] || "").toLowerCase().trim();
      lowerKeyword && compiledMatchers.push({
        lowerKeyword: lowerKeyword,
        compactKeyword: lowerKeyword.includes(" ") ? lowerKeyword.replace(/\s+/g, "") : lowerKeyword,
        isChinese: /[\u4e00-\u9fa5]/.test(lowerKeyword),
        isShortAlphaWord: lowerKeyword.length <= 4 && /^[a-z]+$/.test(lowerKeyword)
      });
    }
    // 噪声关键词
        compiledRegionMatcherMap[region.id] = compiledMatchers;
  }
  const normalizeCache = new Map, regionMatchCache = new Map, noisePattern = new RegExp("\\b(" + [ "vip", "svip", "倍率", "xd+", "iepl", "iplc", "bgp", "cn2", "gia", "game", "games", "gaming", "stream", "media", "unlock", "nf", "奈飞", "netflix", "disney", "hbo", "max", "prime", "chatgpt", "gpt", "ai", "home", "residential", "station", "server", "node", "premium", "traffic", 
  // 名称标准化
  "test", "testing", "expire", "plan", "used", "aws", "hy2", "anytls", "relay", "direct", "standard", "basic", "pro", "plus", "专线", "中转", "原生" ].join("|") + ")\\b", "gi");
  function matchRegion(name) {
    const rawName = String(name || "");
    if (regionMatchCache.has(rawName)) return regionMatchCache.get(rawName);
    let result = "其它地区";
    for (let i = 0; i < REGION_FLAG_MAP.length; i++) if (REGION_FLAG_MAP[i][1].test(rawName)) {
      result = REGION_FLAG_MAP[i][0];
      break;
    }
    if ("其它地区" === result) {
      const normalized = function(name) {
        const key = String(name || "");
        if (normalizeCache.has(key)) return normalizeCache.get(key);
        const result = key.toLowerCase().replace(/(?:\uD83C[\uDDE6-\uDDFF]){2}/g, " ").replace(/[\u2600-\u27BF]/g, " ").replace(/[\d]+(?:\.\d+)?\s*(?:x|倍|gb|mb|tb|g|m|t)\b/gi, " ").replace(/[|｜¦•·・,，;；:：/\_+\-–—()\[\]{}<>【】「」『』]/g, " ").replace(noisePattern, " ").replace(/\s+/g, " ").trim();
        return normalizeCache.set(key, result), result;
        // 第一阶段：高置信匹配（中文关键词 + 长英文全称），跨全部地区优先命中，
        // 避免短 ISO 机场码（如葡萄牙 PT）抢先误吞“印度尼西亚-A-PT家宽”这类含机房代号的名称。
            }(rawName);
      normalized && (result = function(rawText, normalizedName) {
        const normalized = String(normalizedName || ""), compact = normalized.includes(" ") ? normalized.replace(/\s+/g, "") : normalized;
        for (let regionIndex = 0; regionIndex < REGION_PRIORITY.length; regionIndex++) {
          const regionName = REGION_PRIORITY[regionIndex], matchers = compiledRegionMatcherMap[regionName] || [];
          for (let i = 0; i < matchers.length; i++) {
            const matcher = matchers[i];
            if (!matcher.isShortAlphaWord) if (matcher.isChinese) {
              if (rawText.includes(matcher.lowerKeyword) || normalized.includes(matcher.lowerKeyword)) return regionName;
            } else {
              // 第二阶段：短 ISO/机场码整词匹配，作为高置信关键词未命中时的补充。
              if (normalized.includes(matcher.lowerKeyword)) return regionName;
              if (matcher.compactKeyword !== matcher.lowerKeyword && compact.includes(matcher.compactKeyword)) return regionName;
            }
          }
        }
        for (let regionIndex = 0; regionIndex < REGION_PRIORITY.length; regionIndex++) {
          const regionName = REGION_PRIORITY[regionIndex], matchers = compiledRegionMatcherMap[regionName] || [];
          for (let i = 0; i < matchers.length; i++) {
            const matcher = matchers[i];
            if (matcher.isShortAlphaWord && (hasWholeWord(rawText, matcher.lowerKeyword) || hasWholeWord(normalized, matcher.lowerKeyword))) return regionName;
          }
        }
        return null;
      }(rawName.toLowerCase(), normalized) || function(normalizedName) {
        const normalized = String(normalizedName || "");
        if (!normalized) return null;
        const compact = normalized.includes(" ") ? normalized.replace(/\s+/g, "") : normalized;
        for (let regionIndex = 0; regionIndex < REGION_PRIORITY.length; regionIndex++) {
          const regionName = REGION_PRIORITY[regionIndex], matchers = compiledRegionMatcherMap[regionName] || [];
          for (let i = 0; i < matchers.length; i++) {
            const matcher = matchers[i];
            if (!matcher.isShortAlphaWord) {
              if (normalized.includes(matcher.lowerKeyword)) return regionName;
              if (matcher.compactKeyword !== matcher.lowerKeyword && compact.includes(matcher.compactKeyword)) return regionName;
              // 地区匹配主流程：旗帜 > 词库 > 宽松恢复
                        }
          }
        }
        return null;
      }(normalized) || "其它地区");
    }
    return regionMatchCache.set(rawName, result), result;
  }
  // 三个直连伪节点专属于国内服务组，不参与地区分类，避免被回收进「其它地区」
    const directProxyNameSet = new Set(directProxyNames);
  for (let i = 0; i < cleanProxies.length; i++) {
    const proxy = cleanProxies[i];
    // 未命中地区统一回收到「其它地区」
        if ("direct" === proxy.type && directProxyNameSet.has(proxy.name)) continue;
    const matchedRegion = matchRegion(proxy.name);
    (regionGroups[matchedRegion] || regionGroups["其它地区"]).push(proxy.name);
  }
  unique(regionGroups["其它地区"]), [ "香港", "台湾", "日本", "新加坡", "美国", "韩国", "俄罗斯", "加拿大", "欧盟", "东南亚", "拉美地区", "非洲" ].some(regionName => regionGroups[regionName].length > 0);
  const testUrl = TEST_URL;
  function preserveGroup(group) {
    const oldGroup = existingGroupMap[group.name];
    if ("select" !== group.type) return group;
    if (!oldGroup || !Array.isArray(oldGroup.proxies) || !Array.isArray(group.proxies)) return group;
    const groupProxySet = new Set(group.proxies), oldProxySeen = new Set, ordered = [];
    for (let i = 0; i < oldGroup.proxies.length; i++) {
      const proxyName = oldGroup.proxies[i];
      groupProxySet.has(proxyName) && !oldProxySeen.has(proxyName) && (oldProxySeen.add(proxyName), 
      ordered.push(proxyName));
    }
    for (let i = 0; i < group.proxies.length; i++) {
      const proxyName = group.proxies[i];
      oldProxySeen.has(proxyName) || (oldProxySeen.add(proxyName), 
      // 代理列表兜底：合并用户列表和默认项，若最终为空则至少返回 DIRECT。
      ordered.push(proxyName));
    }
    return {
      ...group,
      proxies: ordered
    };
  }
  function mergeUniqueChoicesWithFallback(primaryInput, fallbackInput, emptyFallback = null) {
    const merged = [], seen = new Set, primary = asArray(primaryInput), fallback = asArray(fallbackInput);
    for (let i = 0; i < primary.length; i++) {
      const item = primary[i];
      item && !seen.has(item) && (seen.add(item), merged.push(item));
    }
    for (let i = 0; i < fallback.length; i++) {
      const item = fallback[i];
      item && !seen.has(item) && (seen.add(item), 
      // 列表兜底约定：这里只能返回一维字符串数组；若改成对象/嵌套数组，会直接影响 Clash 配置反序列化。
      merged.push(item));
    }
    return merged.length ? merged : emptyFallback || [];
  }
  function ensureGroupList(list, extraDefaults) {
    const merged = mergeUniqueChoicesWithFallback(list, extraDefaults, [ "DIRECT" ]);
    return merged.length ? merged : [ "DIRECT" ];
  }
  function normalizeHealthOptions(options = {}, defaults = {}) {
    return {
      url: options.url || defaults.url || testUrl,
      interval: "number" == typeof options.interval ? options.interval : "number" == typeof defaults.interval ? defaults.interval : 600,
      tolerance: "number" == typeof options.tolerance ? options.tolerance : "number" == typeof defaults.tolerance ? defaults.tolerance : 150,
      timeout: "number" == typeof options.timeout ? options.timeout : "number" == typeof defaults.timeout ? defaults.timeout : 3500,
      maxFailedTimes: "number" == typeof options.maxFailedTimes ? options.maxFailedTimes : "number" == typeof defaults.maxFailedTimes ? defaults.maxFailedTimes : 3,
      lazy: "boolean" == typeof options.lazy ? options.lazy : "boolean" != typeof defaults.lazy || defaults.lazy,
      strategy: options.strategy || defaults.strategy || "consistent-hashing"
    };
  }
  function makeUrlTestGroup(name, icon, nodes, interval, tolerance, options = {}) {
    const proxies = ensureGroupList(nodes, []);
    if (!proxies.length || 1 === proxies.length && "DIRECT" === proxies[0]) return null;
    const health = normalizeHealthOptions(options, {
      interval: interval,
      tolerance: tolerance
    });
    return {
      name: name,
      type: "url-test",
      icon: icon,
      url: health.url,
      interval: health.interval,
      tolerance: health.tolerance,
      // Select 组
      timeout: health.timeout,
      "max-failed-times": health.maxFailedTimes,
      lazy: health.lazy,
      proxies: proxies
    };
  }
  function makeSelectGroup(name, icon, list, extraDefaults = [ "自动选择" ], scope = null) {
    return {
      name: name,
      type: "select",
      // Fallback 组
      icon: icon,
      proxies: buildChoiceList(list, extraDefaults)
    };
  }
  function makeFallbackGroup(name, icon, list, extraDefaults = [ "自动选择" ], options = {}) {
    const proxies = ensureGroupList(list, extraDefaults);
    if (!proxies.length || 1 === proxies.length && "DIRECT" === proxies[0]) return null;
    const health = normalizeHealthOptions(options, {
      interval: 300,
      tolerance: 150,
      timeout: 3e3,
      maxFailedTimes: 3
    });
    return {
      name: name,
      type: "fallback",
      icon: icon,
      url: health.url,
      interval: health.interval,
      tolerance: health.tolerance,
      // 批量 Select 生成
      timeout: health.timeout,
      "max-failed-times": health.maxFailedTimes,
      lazy: health.lazy,
      proxies: proxies
    };
  }
  function makeSelectGroupsFromDefs(defs) {
    const groups = [], list = asArray(defs);
    for (let i = 0; i < list.length; i++) {
      const def = list[i];
      def && def.name && 
      // === 规则装配：集合合并、去重与目标归类 ===
      // 规则集合并（后定义覆盖前定义）
      groups.push(makeSelectGroup(def.name, def.icon, def.choices, def.extraDefaults, def.scope));
    }
    return groups;
  }
  const regionIconMap = {
    "香港": qIcon("Hong_Kong"),
    "台湾": qIcon("Taiwan"),
    "日本": qIcon("Japan"),
    "新加坡": qIcon("Singapore"),
    "美国": qIcon("United_States"),
    "韩国": qIcon("Korea"),
    "俄罗斯": qIcon("Russia"),
    "欧盟": qIcon("European_Union"),
    "东南亚": qIcon("Asia_Map"),
    "加拿大": qIcon("Canada"),
    "拉美地区": qIcon("America_Map"),
    "非洲": qIcon("Africa_Map"),
    "其它地区": qIcon("World_Map")
  }, homeRegionIconMap = {
    "香港": "https://api.iconify.design/circle-flags:hk.svg",
    "台湾": "https://api.iconify.design/circle-flags:tw.svg",
    "日本": "https://api.iconify.design/circle-flags:jp.svg",
    "新加坡": "https://api.iconify.design/circle-flags:sg.svg",
    "美国": "https://api.iconify.design/circle-flags:us.svg",
    "韩国": "https://api.iconify.design/circle-flags:kr.svg",
    "俄罗斯": "https://api.iconify.design/circle-flags:ru.svg",
    "欧盟": "https://api.iconify.design/circle-flags:eu.svg",
    "东南亚": qIcon("Asia_Map"),
    "加拿大": "https://api.iconify.design/circle-flags:ca.svg",
    "拉美地区": qIcon("America_Map"),
    "非洲": qIcon("Africa_Map"),
    "其它地区": qIcon("World_Map")
  }, iconMap = {
    rocket: qIcon("Rocket"),
    auto: qIcon("Auto"),
    select: qIcon("Static"),
    balance: qIcon("Round_Robin"),
    direct: qIcon("Direct"),
    final: "https://api.iconify.design/tabler:fish.svg?color=%2306b6d4",
    global: "https://api.iconify.design/tabler:logout-2.svg?color=%230ea5e9",
    fallback: qIcon("Available"),
    fallbackFinal: "https://api.iconify.design/tabler:parachute.svg?color=%233b82f6",
    flare: "https://api.iconify.design/tabler:flame-filled.svg?color=%2300d1b2",
    lowMultiplier: "https://api.iconify.design/tabler:gauge-filled.svg?color=%23f59e0b",
    highMultiplier: "https://api.iconify.design/tabler:gauge-filled.svg?color=%23ef4444",
    normalMultiplier: "https://api.iconify.design/tabler:gauge-filled.svg?color=%2310b981",
    multiplier: qIcon("Filter"),
    home: "https://api.iconify.design/tabler:home-filled.svg",
    youtube: qIcon("YouTube"),
    youtubeFallback: qIcon("Streaming"),
    tiktok: qIcon("TikTok"),
    meta: "https://api.iconify.design/simple-icons:meta.svg?color=%231877F2",
    twitter: "https://api.iconify.design/logos:twitter.svg?color=%231DA1F2",
    telegram: qIcon("Telegram"),
    translate: "https://api.iconify.design/simple-icons:googletranslate.svg?color=%234285F4",
    google: qIcon("Google_Search"),
    playstore: "https://api.iconify.design/logos:google-play-icon.svg",
    microsoft: qIcon("Microsoft"),
    bing: "https://api.iconify.design/simple-icons:microsoftbing.svg?color=%2300837D",
    apple: qIcon("Apple"),
    cloudflare: qIcon("Cloudflare"),
    github: qIcon("GitHub"),
    ai: qIcon("AI"),
    claude: "https://api.iconify.design/simple-icons:claude.svg?color=%23D97757",
    gemini: "https://api.iconify.design/logos:google-gemini.svg",
    fcm: EXTERNAL_URLS.icons.fcm,
    streaming: qIcon("Netflix"),
    streamingGlobal: qIcon("Media"),
    netflix: qIcon("Netflix"),
    spotify: qIcon("Spotify"),
    twitch: qIcon("Twitch"),
    discord: qIcon("Discord"),
    niconico: qIcon("niconico"),
    taiwanMedia: qIcon("Bahamut"),
    dedicated: "https://api.iconify.design/tabler:train.svg?color=%230ea5e9",
    privacy: qIcon("Lock"),
    payment: "https://api.iconify.design/tabler:credit-card.svg?color=%23f59e0b",
    personalMedia: qIcon("Emby"),
    news: "https://api.iconify.design/simple-icons:bbc.svg?color=%230068BD",
    social: "https://api.iconify.design/simple-icons:reddit.svg?color=%23FF4500",
    reddit: "https://api.iconify.design/simple-icons:reddit.svg",
    china: qIcon("China_Map"),
    russia: qIcon("Russia"),
    jpkr: qIcon("AbemaTV"),
    game: qIcon("Game"),
    download: qIcon("Download"),
    adblock: qIcon("Advertising"),
    decentralized: "https://api.iconify.design/simple-icons:ethereum.svg?color=%23627EEA",
    riskControl: "https://mihomo.echs.top/img/Hand-Painted-icon/Google_Suite/Account.png"
  }, regionAutoOrder = [ "香港", "台湾", "日本", "新加坡", "美国", "韩国", "欧盟", "加拿大", "俄罗斯", "东南亚", "拉美地区", "非洲", "其它地区" ], regionCatalog = regionAutoOrder.reduce((acc, regionName) => {
    // 地区自动组：改为静态节点列表 url-test（而非 include-all + filter 动态匹配），
    // 保证自动组测速的候选节点与地区节点组（脚本精确分类结果）完全一致，避免正则误匹配导致两者节点集合不同、延迟展示对不上。
    const regionNodes = unique(regionGroups[regionName] || []);
    if (!regionNodes.length) return acc;
    const names = {
      auto: (label = regionName) + "自动",
      manual: label + "节点",
      // 地区目录与测速顺序
      homeAuto: label + "家宽自动",
      // 地区目录构建（地区自动组 + 地区家宽自动组 hidden + 地区节点组 visible）
      // 自动组和家宽自动组使用 include-all + filter 动态匹配，订阅更新时新增节点自动归组
      homeManual: "🏠" + label + "家宽手动"
    };
    var label;
    const residentialNodes = unique(regionNodes.filter(name => isResidentialProxyName(name))), autoGroup = makeUrlTestGroup(names.auto, regionIconMap[regionName], regionNodes, 600, 200, {
      // 地区家宽自动组：至少达到最小家宽节点数才生成，避免单节点测速组污染 UI。
      timeout: 4e3,
      maxFailedTimes: 4
    });
    autoGroup && (autoGroup.hidden = !0);
    const homeAutoGroup = residentialNodes.length >= 2 ? makeUrlTestGroup(names.homeAuto, homeRegionIconMap[regionName], residentialNodes, 1200, 300, {
      timeout: 5e3,
      maxFailedTimes: 5,
      // 地区家宽节点 select 组：家宽自动组名 + 家宽真实节点
      lazy: !0
    }) : null;
    homeAutoGroup && (homeAutoGroup.hidden = !0);
    const homeManualChoices = buildChoiceList(homeAutoGroup ? [ names.homeAuto ] : [], residentialNodes), homeManualGroup = homeManualChoices.length ? {
      name: "🏠" + regionName + "家宽节点",
      type: "select",
      icon: homeRegionIconMap[regionName],
      proxies: homeManualChoices
    } : null, manualChoices = buildChoiceList(autoGroup ? [ names.auto ] : [], regionNodes), manualGroup = manualChoices.length ? {
      name: names.manual,
      type: "select",
      icon: regionIconMap[regionName],
      proxies: manualChoices
    } : null;
    return acc[regionName] = {
      name: regionName,
      nodes: regionNodes,
      residentialNodes: residentialNodes,
      icon: regionIconMap[regionName],
      names: names,
      autoGroup: autoGroup,
      homeAutoGroup: homeAutoGroup,
      homeManualGroup: homeManualGroup,
      // 地区映射缓存
      manualGroup: manualGroup
    }, acc;
  }, {}), regionAutoMap = Object.create(null), regionHomeAutoMap = Object.create(null), regionAutoNames = [], regionHomeAutoNames = [], regionManualNames = [], regionHomeManualNames = [], regionCatalogValues = Object.values(regionCatalog), regionCatalogEntries = Object.entries(regionCatalog);
  for (let i = 0; i < regionCatalogEntries.length; i++) {
    const info = regionCatalogEntries[i][1];
    regionAutoMap[info.name] = info.names.auto, regionAutoNames.push(info.names.auto), 
    info.homeAutoGroup && (regionHomeAutoMap[info.name] = info.names.homeAuto, regionHomeAutoNames.push(info.names.homeAuto)), 
    info.manualGroup && regionManualNames.push(info.names.manual), info.homeManualGroup && regionHomeManualNames.push(info.homeManualGroup.name);
  }
  const regionAutoGroups = [], regionHomeAutoGroups = [], regionManualGroups = [], regionHomeManualGroups = [];
  for (let i = 0; i < regionCatalogValues.length; i++) {
    const info = regionCatalogValues[i];
    info.autoGroup && regionAutoGroups.push(info.autoGroup), 
    // 地区查询辅助
    info.homeAutoGroup && regionHomeAutoGroups.push(info.homeAutoGroup), info.manualGroup && regionManualGroups.push(info.manualGroup), 
    info.homeManualGroup && regionHomeManualGroups.push(info.homeManualGroup);
  }
  function getRegionAuto(name) {
    return regionAutoMap[name] || null;
  }
  function buildNodeChain(patterns) {
    const chain = [];
    for (let i = 0; i < allProxyNames.length; i++) {
      const name = allProxyNames[i];
      for (let j = 0; j < patterns.length; j++) if (patterns[j].test(name)) {
        chain.push(name);
        break;
      }
    }
    return chain;
  }
  function buildChoiceList(...parts) {
    const merged = [], seen = new Set;
    for (let i = 0; i < parts.length; i++) {
      const part = asArray(parts[i]);
      for (let j = 0; j < part.length; j++) {
        const item = part[j];
        item && !seen.has(item) && (seen.add(item), merged.push(item));
      }
    }
    return merged;
  }
  function sanitizeUiChoiceList(...parts) {
    return asArray(buildChoiceList(...parts)).filter(name => !(!name || "DIRECT" === name || String(name).includes("直连 |")));
  }
  function buildChoicePoolsFromDefs(defs) {
    const map = Object.create(null), list = asArray(defs);
    for (let i = 0; i < list.length; i++) {
      const def = list[i];
      def && def.key && (map[def.key] = makeOrderedChoices(def.first, sanitizeUiChoiceList(...asArray(def.parts)), def.scope));
    }
    return map;
  }
  function sanitizeChoiceList(list, fallbackChoices) {
    const merged = mergeUniqueChoicesWithFallback(list, fallbackChoices, [ "DIRECT" ]);
    return merged.length ? merged : [ "DIRECT" ];
  }
  const BUILTIN_CHOICE_NAMES = new Set([ "DIRECT", "REJECT", "REJECT-DROP", "PASS" ]);
  function makeNameSet(list) {
    const set = new Set, source = asArray(list);
    for (let i = 0; i < source.length; i++) {
      const item = source[i];
      item && set.add(item);
    }
    return set;
  }
  const globalHomeNodes = residentialProxyNames.slice(), globalDedicatedNodes = dedicatedProxyNames.slice(), fusionVisibleRegions = unique(regionHomeManualNames.concat(regionManualNames)), autoFallbackNodes = unique(function() {
    const regions = asArray([ "香港", "台湾", "日本", "新加坡", "美国", "韩国", "欧盟", "加拿大", "俄罗斯", "东南亚", "拉美地区", "非洲", "其它地区" ]), chain = [];
    for (let i = 0; i < regions.length; i++) {
      const name = getRegionAuto(regions[i]);
      name && chain.push(name);
    }
    return chain;
  }()), REGION_FAILOVER_DEFS = [ {
    name: "港台故障转移",
    regions: [ "香港", "台湾" ],
    icon: qIcon("Star")
  }, 
  // YouTube无广策略：Google 广告投放基于出口 IP 的 GeoIP 归属。
  // Google 认为你在广告区 → 有广告；认为你在非广告区（中国大陆/俄罗斯等）→ 无广告。
  // 脚本层面无法做真实 GeoIP 探测（那是运行时网络请求），只能靠节点名特征推断。
  // 送中信号分为三档：
  //   🅰️ 强信号（节点名明确写了送中/回国/CN落地）
  //   🅱️ 弱信号（节点名含 CN2/GIA/CTG/163/CMI/CT/CU/CM 等中国线路标记）
  //   🅲 推测（延迟异常低的非大陆节点、国内城市名出现在非大陆节点）
  // 强信号优先，弱信号次之，最后才是俄罗斯/澳门等经验无广地区。
  // YouTube 无广候选：优先挑选更可能被 Google 识别为低广告区的出口节点。
  {
    name: "日韩故障转移",
    regions: [ "日本", "韩国" ],
    icon: qIcon("Heart")
  }, {
    name: "欧美故障转移",
    regions: [ "美国", "欧盟" ],
    icon: qIcon("Magic")
  } ], regionFallbackNodeMap = function(defs, builder) {
    const map = Object.create(null);
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      map[def.name] = builder(def);
    }
    return map;
  }(REGION_FAILOVER_DEFS, def => def.regions.map(region => regionCatalog[region] && regionCatalog[region].names ? regionCatalog[region].names.manual : null).filter(Boolean)), cnLandingStrong = [ 
  // 弱信号：中国骨干线路标记 → 走 CN 出口概率高，Google GeoIP → CN
  /送中|回国|落地中|国内中转|CN落地|回国优化|完美回国|极速回国/, /HK.?CN|TW.?CN|SG.?CN|JP.?CN|US.?CN|KR.?CN|AU.?CN|DE.?CN|UK.?CN|FR.?CN/, /\b回国\b|\bCnRoute\b|\bBackCN\b/i ], cnLandingWeak = [ /\bCN2\b|\bGIA\b|\bCTG\b/i, /\b163\b|\bCMI\b|\bCM\b/i, /\bCT\b|\bCU\b/, /\bIPLC\b|\bIEPL\b/i, /\b上海\b|\b北京\b|\b深圳\b|\b广州\b|\b杭州\b|\b成都\b|\b南京\b|\b武汉\b/ ];
  // 区域故障转移定义
    function isCnLanding(name) {
    return cnLandingStrong.some(re => re.test(String(name || "")));
  }
  const youtubeFallbackNodes = sanitizeUiChoiceList(allProxyNames.filter(name => isCnLanding(name)), allProxyNames.filter(name => !isCnLanding(name) && function(name) {
    // YouTube 无广候选池：按“送中强信号 → 弱信号 → 经验低广告地区”顺序组织。
    return cnLandingWeak.some(re => re.test(String(name || "")));
  }(name)), buildNodeChain([ /俄罗斯/i, /俄(罗斯)?/i, /\bRU\b/i, /🇷🇺/ ]), buildNodeChain([ /越南/i, /\bVN\b/i, /🇻🇳/ ]), buildNodeChain([ /澳门/i, /\bMO\b/i, /🇲🇴/ ]), regionGroups["东南亚"], regionGroups["欧盟"], regionGroups["其它地区"], regionGroups["非洲"], regionGroups["加拿大"], regionGroups["拉美地区"], regionGroups["香港"], 
  // AI 候选池：优先放入对海外 AI 服务兼容性通常更稳定的地区节点组。
  regionGroups["新加坡"], regionGroups["日本"], regionGroups["美国"]), cloudflareGroupChoices = sanitizeUiChoiceList(
  // 下载分区定义
  [ "自动选择", "欧美故障转移", "全球手动" ], buildNodeChain([ /cloudflare/i, /\bCF\b/i, /WARP/i, /1\.1\.1\.1/ ]), regionManualNames.filter(name => !String(name).includes("家宽"))), DOWNLOAD_REGION_DEFS = [ {
    key: "香港",
    groupName: "香港下载",
    icon: regionIconMap["香港"] || qIcon("HK")
  }, {
    key: "台湾",
    groupName: "台湾下载",
    icon: regionIconMap["台湾"] || qIcon("TW")
  }, {
    key: "日本",
    groupName: "日本下载",
    icon: regionIconMap["日本"] || qIcon("JP")
  }, {
    key: "韩国",
    groupName: "韩国下载",
    icon: regionIconMap["韩国"] || qIcon("KR")
  }, 
  // Load-balance 健康检查基线：负载均衡类组的探测超时不能压得太低。
  // 本订阅里 Cloudflare anycast 节点（xhttp + TLS）首包 RTT 常在 100~460ms，
  // 叠加 TLS 握手后很容易超过 800ms，导致节点被误判失败、频繁在组内被剔除。
  // 这里放宽到 2500ms 并把探测间隔拉长，减少无谓探测压力与误杀。
  {
    key: "新加坡",
    groupName: "新加坡下载",
    icon: regionIconMap["新加坡"] || qIcon("SG")
  }, 
  // Load-balance 组
  {
    key: "美国",
    groupName: "美国下载",
    icon: regionIconMap["美国"] || qIcon("US")
  }, {
    key: "欧盟",
    groupName: "欧盟下载",
    icon: regionIconMap["欧盟"] || qIcon("EU")
  } ], LOAD_BALANCE_HEALTH = {
    interval: 300,
    timeout: 3e3,
    maxFailedTimes: 3
  };
  function makeLoadBalanceGroup(name, icon, nodes, options = {}) {
    const proxies = ensureGroupList(nodes, []);
    if (!proxies.length || 1 === proxies.length && "DIRECT" === proxies[0]) return null;
    const health = normalizeHealthOptions(options);
    return {
      name: name,
      type: "load-balance",
      icon: icon,
      url: health.url,
      interval: health.interval,
      timeout: health.timeout,
      "max-failed-times": health.maxFailedTimes,
      strategy: health.strategy,
      lazy: health.lazy,
      proxies: proxies
    };
  }
  function collectNamedGroups(groups) {
    const namedGroups = [], names = [], list = asArray(groups);
    for (let i = 0; i < list.length; i++) {
      const group = list[i];
      group && group.name && (namedGroups.push(group), names.push(group.name));
    }
    return {
      groups: namedGroups,
      names: names
    };
  }
  const downloadRegionGroupArtifacts = function(defs, nodeBuilder, optionsBuilder = () => ({})) {
    const groups = [], names = [], list = asArray(defs);
    for (let i = 0; i < list.length; i++) {
      const def = list[i], group = makeLoadBalanceGroup(def.groupName, def.icon, nodeBuilder(def), optionsBuilder(def));
      group && group.name && (groups.push(group), names.push(group.name));
    }
    return {
      groups: groups,
      names: names
    };
  }(DOWNLOAD_REGION_DEFS, 
  // 下载候选池
  def => function(regionName, options = {}) {
    const {includeResidential: includeResidential = !0, residentialOnly: residentialOnly = !1, sortByMultiplier: sortByMultiplier = !1} = options, info = regionCatalog[regionName];
    if (!info) return [];
    let nodes;
    return nodes = residentialOnly ? info.residentialNodes.slice() : includeResidential ? info.nodes.slice() : info.nodes.filter(name => !isResidentialProxyName(name)), 
    sortByMultiplier ? asArray(nodes).slice().sort((a, b) => {
      const ai = getMultiplierSortInfo(a), bi = getMultiplierSortInfo(b);
      return ai.value - bi.value || String(a).localeCompare(String(b), "zh-Hans-CN");
    }) : nodes;
  }(def.key, {
    includeResidential: !1
  }), 
  // 候选池 / 特殊 fallback
  () => ({
    interval: LOAD_BALANCE_HEALTH.interval,
    timeout: LOAD_BALANCE_HEALTH.timeout,
    maxFailedTimes: LOAD_BALANCE_HEALTH.maxFailedTimes,
    strategy: "consistent-hashing"
  })), downloadRegionGroups = downloadRegionGroupArtifacts.groups, downloadGroupChoices = sanitizeUiChoiceList([ "节点选择", "自动选择", "负载均衡", "下载散列组", "下载轮询组" ], downloadRegionGroupArtifacts.names), SPECIAL_FALLBACK_DEFS = [ {
    name: "YouTube无广节点优先组",
    icon: iconMap.youtubeFallback,
    nodes: youtubeFallbackNodes,
    extraDefaults: [ "自动兜底" ],
    options: {
      interval: 300,
      tolerance: 180,
      lazy: !0
    }
  } ], fallbackGroupArtifacts = collectNamedGroups([ makeFallbackGroup("自动兜底", iconMap.fallbackFinal, autoFallbackNodes, [], {
    interval: 300,
    tolerance: 150,
    lazy: !0
  }), ...REGION_FAILOVER_DEFS.map(def => makeFallbackGroup(def.name, def.icon, regionFallbackNodeMap[def.name], regionFallbackNodeMap[def.name] && regionFallbackNodeMap[def.name].length ? [] : [ "自动兜底" ], {
    interval: 300,
    tolerance: 150,
    lazy: !0
  })), 
  // 负载均衡与特征聚合
  ...SPECIAL_FALLBACK_DEFS.map(def => makeFallbackGroup(def.name, def.icon, def.nodes, def.extraDefaults, def.options)) ]), fallbackGroups = fallbackGroupArtifacts.groups, fallbackNames = fallbackGroupArtifacts.names, playStoreBalanceChoices = regionAutoNames.length ? regionAutoNames.slice() : [ "自动选择" ], playStoreBalanceChoiceSet = makeNameSet(playStoreBalanceChoices), missingPlayStoreRegionGroups = regionAutoNames.filter(name => !playStoreBalanceChoiceSet.has(name));
  if (missingPlayStoreRegionGroups.length) throw new Error("play store balance health check failed: missing region group(s): " + missingPlayStoreRegionGroups.join(", "));
  // 商店组原来是 45s/600ms 的激进探测。600ms 对 Cloudflare anycast 类节点（TLS 握手后
  // 常见 100~460ms 起步）几乎必然误判超时，因此放宽到 2000ms，并把间隔拉到 120s。
    const playStoreServiceChoices = [ "谷歌商店专用", "自动选择" ], playStoreLoadBalanceOptions = {
    url: PLAY_STORE_TEST_URL,
    interval: 120,
    timeout: 2e3,
    // 负载均衡组改为真实节点均衡
    maxFailedTimes: 3,
    strategy: "consistent-hashing",
    // 下载散列组：consistent-hashing，同一目标固定映射到同一地区自动组，节点池同下载轮询组。此组不在主列表展示，仅供下载专用组内部引用。
    lazy: !1
  }, loadBalanceGroupArtifacts = collectNamedGroups([ makeLoadBalanceGroup("负载均衡", iconMap.balance, ensureGroupList(allProxyNames, []), Object.assign({}, LOAD_BALANCE_HEALTH, {
    strategy: "consistent-hashing"
  })), makeLoadBalanceGroup("下载散列组", iconMap.balance, ensureGroupList(regionAutoNames, []), Object.assign({}, LOAD_BALANCE_HEALTH, {
    strategy: "consistent-hashing"
  })), makeLoadBalanceGroup("下载轮询组", iconMap.balance, ensureGroupList(regionAutoNames, []), Object.assign({}, LOAD_BALANCE_HEALTH, {
    strategy: "round-robin"
  })), 
  // 特殊聚合组：转为 url-test（隐藏）+ select（可见，包含url-test名+真实节点）模式
  // 倍率聚合：先按识别出的倍率值排序，再派生低倍率节点池。
  makeLoadBalanceGroup("谷歌商店专用", iconMap.playstore, ensureGroupList(playStoreBalanceChoices, []), playStoreLoadBalanceOptions) ]), loadBalanceGroups = loadBalanceGroupArtifacts.groups, loadBalanceNames = loadBalanceGroupArtifacts.names, multiplierProxyEntries = multiplierProxyNames.map(name => ({
    name: name,
    info: getMultiplierSortInfo(name)
  }));
  multiplierProxyEntries.sort((a, b) => {
    const diff = a.info.value - b.info.value;
    return 0 !== diff ? diff : a.info.recognized !== b.info.recognized ? a.info.recognized ? -1 : 1 : String(a.name).localeCompare(String(b.name), "zh-Hans-CN", {
      numeric: !0,
      sensitivity: "base"
    });
  });
  const highMultiplierNodes = multiplierProxyEntries.filter(item => item.info.recognized && item.info.value > 1).map(item => item.name), lowMultiplierNodes = multiplierProxyEntries.filter(item => item.info.recognized && item.info.value <= 1).map(item => item.name), globalStreamingNodes = streamingProxyNames.slice(), globalHomeAuto = globalHomeNodes.length ? makeUrlTestGroup("🏡全球家宽自动", iconMap.home, globalHomeNodes, 1200, 300, {
    timeout: 5e3,
    maxFailedTimes: 5,
    lazy: !0
  }) : null;
  globalHomeAuto && (globalHomeAuto.hidden = !0);
  const globalHomeGroup = globalHomeAuto && globalHomeNodes.length ? {
    name: "🏡全球家宽",
    type: "select",
    icon: iconMap.home,
    proxies: buildChoiceList([ "🏡全球家宽自动" ], globalHomeNodes)
  } : null, globalDedicatedAuto = globalDedicatedNodes.length ? makeUrlTestGroup("全球专线自动", iconMap.dedicated, globalDedicatedNodes, 600, 200) : null;
  globalDedicatedAuto && (globalDedicatedAuto.hidden = !0);
  const globalDedicatedGroup = globalDedicatedAuto && globalDedicatedNodes.length ? {
    name: "全球专线",
    type: "select",
    icon: iconMap.dedicated,
    proxies: buildChoiceList([ "全球专线自动" ], globalDedicatedNodes)
  } : null, highMultiplierAuto = highMultiplierNodes.length ? makeUrlTestGroup("高倍率节点自动", iconMap.highMultiplier, highMultiplierNodes, 600, 200) : null;
  highMultiplierAuto && (highMultiplierAuto.hidden = !0);
  const highMultiplierGroup = highMultiplierAuto && highMultiplierNodes.length ? {
    name: "高倍率节点",
    type: "select",
    icon: iconMap.highMultiplier,
    proxies: buildChoiceList([ "高倍率节点自动" ], highMultiplierNodes)
  } : null, lowMultiplierAuto = lowMultiplierNodes.length ? makeUrlTestGroup("低倍率节点自动", iconMap.lowMultiplier, lowMultiplierNodes, 600, 200) : null;
  lowMultiplierAuto && (lowMultiplierAuto.hidden = !0);
  const lowMultiplierGroup = lowMultiplierAuto ? {
    name: "低倍率节点",
    type: "select",
    icon: iconMap.lowMultiplier,
    proxies: buildChoiceList([ "低倍率节点自动" ], lowMultiplierNodes)
  } : null, globalStreamingAuto = globalStreamingNodes.length ? makeUrlTestGroup("全球流媒体自动", iconMap.streamingGlobal, globalStreamingNodes, 600, 200) : null;
  globalStreamingAuto && (globalStreamingAuto.hidden = !0);
  const globalStreamingGroup = globalStreamingAuto && globalStreamingNodes.length ? {
    name: "全球流媒体",
    type: "select",
    icon: iconMap.streamingGlobal,
    proxies: buildChoiceList([ "全球流媒体自动" ], globalStreamingNodes)
  } : null, carrierMap = CARRIER_CLASSIFIER.classifyAll(allProxyNames), tripleNetNodes = unique(allProxyNames.filter(CARRIER_CLASSIFIER.isTripleNet)), carrierGroups = [], carrierAutoGroups = [], carrierNames = [];
  // ── 运营商优化组（移动/联通/电信/广电）：自动组 hidden + 可见 select ──
  // 识别逻辑见 CARRIER_CLASSIFIER；无匹配节点时整组不生成，不污染 UI。
  // 三网优化组：与四大运营商优化组平行，smart(hidden) + select(visible) 双层
    if (tripleNetNodes.length) {
    const tnAutoName = "💠三网优化自动", tnSelName = "💠三网优化", tnIcon = EXTERNAL_URLS.cdn.iconify + "tabler:world.svg?color=%230EA5E9", tnAuto = makeUrlTestGroup(tnAutoName, tnIcon, tripleNetNodes, 600, 200);
    tnAuto && (tnAuto.hidden = !0, carrierAutoGroups.push(tnAuto), carrierGroups.push({
      name: tnSelName,
      type: "select",
      icon: tnIcon,
      proxies: buildChoiceList([ tnAutoName ], tripleNetNodes)
    }), carrierNames.push(tnSelName));
  }
  for (const carDef of CARRIER_CLASSIFIER.carriers) {
    const carNodes = unique(carrierMap[carDef.label] || []);
    if (!carNodes.length) continue;
    const carIcon = CARRIER_CLASSIFIER.carrierIcons[carDef.label], carAutoName = CARRIER_CLASSIFIER.carrierEmoji[carDef.label] + carDef.label + "优化自动", carSelName = CARRIER_CLASSIFIER.carrierEmoji[carDef.label] + carDef.label + "优化", carAuto = makeUrlTestGroup(carAutoName, carIcon, carNodes, 600, 200);
    carAuto && (carAuto.hidden = !0, carrierAutoGroups.push(carAuto), carrierGroups.push({
      name: carSelName,
      type: "select",
      icon: carIcon,
      proxies: buildChoiceList([ carAutoName ], carNodes)
    }), carrierNames.push(carSelName));
  }
  const globalFeatureChoices = buildChoiceList(globalHomeGroup ? [ "🏡全球家宽" ] : [], globalDedicatedGroup ? [ "全球专线" ] : [], lowMultiplierGroup ? [ "低倍率节点" ] : [], 
  // 候选菜单总索引：把 fallback、负载均衡、特征组、地区组与原始节点拼成通用候选池。
  // 排除谷歌商店专属组
  // 下载散列组 / 下载轮询组也一并排除：它们是「下载专用组」的内部编排单元（隐藏组），
  // 不应作为通用候选出现在其它业务组的选项里，否则每个业务组都会冒出这两个下载组。
  highMultiplierGroup ? [ "高倍率节点" ] : [], globalStreamingGroup ? [ "全球流媒体" ] : [], carrierNames), globalFeatureAutoGroups = [ globalHomeAuto, globalDedicatedAuto, highMultiplierAuto, lowMultiplierAuto, globalStreamingAuto, ...carrierAutoGroups ].filter(Boolean), playStoreExclusiveSet = new Set([ "谷歌商店专用", "下载散列组", "下载轮询组" ]), commonLoadBalanceNames = loadBalanceNames.filter(name => !playStoreExclusiveSet.has(name)), regionFallbackNames = [ "港台故障转移", "日韩故障转移", "欧美故障转移" ], fallbackNameSet = makeNameSet(fallbackNames), excludedFallbackChoiceSet = makeNameSet([ "YouTube无广节点优先组" ]), orderedFallbackNames = unique([ ...regionFallbackNames.filter(name => fallbackNameSet.has(name)), "家宽故障转移", "自动兜底", ...fallbackNames.filter(name => !regionFallbackNames.includes(name) && "家宽故障转移" !== name && "自动兜底" !== name && !excludedFallbackChoiceSet.has(name)) ]), usableChoiceNameSet = makeNameSet(unique([ "节点选择", "自动选择", "全球手动", "负载均衡", "谷歌商店专用", "家宽故障转移", "自动兜底", ...regionFallbackNames, ...fallbackNames, ...loadBalanceNames, ...downloadRegionGroupArtifacts.names, ...globalFeatureChoices, ...regionManualNames, ...regionHomeManualNames, ...regionAutoNames, ...regionHomeAutoNames, "🔗链式出口", 
  // 候选作用域
  "🪜链式中转" ]).concat(allProxyNames));
  for (const name of BUILTIN_CHOICE_NAMES) usableChoiceNameSet.add(name);
  function createChoiceScope(scopeKeyOrChoices = null) {
    if (scopeKeyOrChoices && "object" == typeof scopeKeyOrChoices && scopeKeyOrChoices.allowedNameSet) return scopeKeyOrChoices;
    const scopedChoiceNames = (scopeKeyOrList = scopeKeyOrChoices, Array.isArray(scopeKeyOrList) ? scopeKeyOrList.filter(Boolean) : []);
    var scopeKeyOrList;
    return {
      scopedChoiceNames: scopedChoiceNames,
      allowedNameSet: makeNameSet(Array.from(usableChoiceNameSet).concat(scopedChoiceNames))
    };
  }
  const GLOBAL_CHOICE_SCOPE = createChoiceScope();
  function filterUsableChoiceNames(list, scope = GLOBAL_CHOICE_SCOPE) {
    const filtered = [], seen = new Set, source = asArray(list), scoped = scope && scope.allowedNameSet ? scope : GLOBAL_CHOICE_SCOPE;
    for (let i = 0; i < source.length; i++) {
      const item = source[i];
      item && !seen.has(item) && (BUILTIN_CHOICE_NAMES.has(item) || scoped.allowedNameSet.has(item)) && (seen.add(item), 
      filtered.push(item));
    }
    return filtered;
  }
  function usableChoices(...parts) {
    return filterUsableChoiceNames(buildChoiceList(...parts), GLOBAL_CHOICE_SCOPE);
  }
  function usableChoicesForScope(scope, ...parts) {
    return filterUsableChoiceNames(buildChoiceList(...parts), scope);
  }
  function usableChoiceDef(key, first, ...parts) {
    return function(key, scope, first, ...parts) {
      return {
        key: key,
        scope: scope || GLOBAL_CHOICE_SCOPE,
        first: usableChoicesForScope(scope || GLOBAL_CHOICE_SCOPE, first),
        parts: parts.map(part => usableChoicesForScope(scope || GLOBAL_CHOICE_SCOPE, part))
      };
      // 带作用域候选定义
        }(key, GLOBAL_CHOICE_SCOPE, first, ...parts);
  }
  function makeSelectGroupDef(name, icon, choices, extraDefaults, scopeKeyOrChoices = null) {
    const scope = createChoiceScope(scopeKeyOrChoices);
    return {
      name: name,
      icon: icon,
      scope: scope,
      choices: filterUsableChoiceNames(choices, scope),
      extraDefaults: filterUsableChoiceNames(extraDefaults, scope)
    };
  }
  function makeSelectGroupDefList(entries) {
    const defs = [], list = asArray(entries);
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      entry && entry.name && defs.push(makeSelectGroupDef(entry.name, entry.icon, entry.choices, entry.extraDefaults, entry.scope || entry.extraAllowedChoices));
    }
    return defs;
  }
  // 候选构造器（first 强优先）
    const baseChoices = usableChoices([ "节点选择", "自动选择", "负载均衡", "全球手动" ], orderedFallbackNames, commonLoadBalanceNames, globalFeatureChoices, fusionVisibleRegions, allProxyNames), commonBaseChoices = baseChoices.filter(name => !excludedFallbackChoiceSet.has(name)), youtubeOnlyBaseChoices = baseChoices, aiOnlyBaseChoices = baseChoices.filter(name => "YouTube无广节点优先组" !== name);
  function makeOrderedChoices(first, pool, scope = GLOBAL_CHOICE_SCOPE) {
    const merged = [], seen = new Set, primary = asArray(first), source = asArray(pool || baseChoices);
    for (let i = 0; i < primary.length; i++) {
      const item = primary[i];
      item && !seen.has(item) && (seen.add(item), merged.push(item));
    }
    for (let i = 0; i < source.length; i++) {
      const item = source[i];
      item && !seen.has(item) && (seen.add(item), 
      // 业务候选项
      merged.push(item));
      // 分流候选池
        }
    return filterUsableChoiceNames(merged, scope);
  }
  const domesticChoices = directChoices.concat(fusionVisibleRegions), CHOICE_POOLS = buildChoicePoolsFromDefs([ usableChoiceDef("common", [ "节点选择" ], commonBaseChoices), usableChoiceDef("youtubeOnly", [ "节点选择", "YouTube无广节点优先组" ], youtubeOnlyBaseChoices), usableChoiceDef("aiOnly", [ "节点选择" ], aiOnlyBaseChoices), usableChoiceDef("playStore", playStoreServiceChoices, commonBaseChoices), usableChoiceDef("streaming", globalStreamingGroup ? [ "全球流媒体", "节点选择", "自动选择" ] : [ "节点选择", "自动选择" ], commonBaseChoices), usableChoiceDef("taiwanMedia", unique([ "港台故障转移", "台湾节点", "节点选择", "自动选择" ].filter(Boolean)), commonBaseChoices), 
  // 地区家宽节点组紧跟全球家宽
  usableChoiceDef("riskControl", [ "家宽故障转移", globalHomeGroup ? "🏡全球家宽" : null, highMultiplierGroup ? "高倍率节点" : null, globalDedicatedGroup ? "全球专线" : null, lowMultiplierGroup ? "低倍率节点" : null, ...regionHomeManualNames.filter(name => name && "🏡全球家宽" !== name), "自动选择", "节点选择", "全球手动" ].filter(Boolean), [ "港台故障转移", "日韩故障转移", "欧美故障转移", ...regionManualNames.filter(name => name && !String(name).includes("家宽")), "自动兜底" ].filter(Boolean)) ]), commonFirst = [ "节点选择", "自动选择" ], BALANCED_CHAIN_FIRST_KEYS = new Set([ "Meta", "Telegram", "Twitter", "Discord", "社交信息流", "GitHub" ]), BUSINESS_CHOICE_DEFS = [ ...[ "Meta", "Telegram", "Twitch", "国外游戏", "Twitter", "Discord", "社交信息流", "GitHub", "翻译服务" ].map(key => ({
    key: key,
    first: BALANCED_CHAIN_FIRST_KEYS.has(key) ? [ "节点选择", "🔗链式出口", "自动选择" ] : commonFirst,
    poolKey: "common"
  })), {
    key: "YouTube",
    first: [ "YouTube无广节点优先组", "节点选择" ],
    poolKey: "youtubeOnly"
  }, {
    key: "Spotify",
    first: [ "港台故障转移" ],
    poolKey: "common"
  }, {
    key: "Google",
    first: [ "节点选择", "港台故障转移", "🔗链式出口", "自动选择" ],
    poolKey: "common"
  }, {
    key: "TikTok",
    first: [ "港台故障转移", "🔗链式出口" ],
    poolKey: "common"
  }, ...[ "日韩生态区", "Niconico" ].map(key => ({
    key: key,
    first: [ "日韩故障转移" ],
    poolKey: "common"
  })), {
    key: "去中心化平台",
    first: [ "节点选择" ],
    poolKey: "common"
  }, {
    key: "微软服务",
    first: [ "节点选择", "自动选择" ],
    poolKey: "common"
  }, {
    key: "微软Bing",
    first: [ "DIRECT", "节点选择", "自动选择" ],
    poolKey: "common"
  }, {
    key: "谷歌商店",
    first: playStoreServiceChoices,
    poolKey: "playStore"
  }, {
    key: "国外AI",
    first: [ "节点选择", "🔗链式出口" ],
    poolKey: "aiOnly"
  }, {
    key: "支付服务",
    first: [ "🔗链式出口", "港台故障转移", "节点选择", "自动选择" ],
    poolKey: "common"
  }, {
    key: "个人媒体",
    first: [ globalStreamingGroup ? "全球流媒体" : null, "港台故障转移", "节点选择", "自动选择" ].filter(Boolean),
    poolKey: "streaming"
  }, {
    key: "新闻资讯",
    first: [ "欧美故障转移", "节点选择", "自动选择" ],
    poolKey: "common"
  } ], BUSINESS_SERVICE_HEAD = [ [ "YouTube", iconMap.youtube ], [ "TikTok", iconMap.tiktok ], [ "Meta", iconMap.meta ], [ "Twitter", iconMap.twitter ], [ "Niconico", iconMap.niconico ], [ "日韩生态区", iconMap.jpkr ], [ "Spotify", iconMap.spotify ], [ "Telegram", iconMap.telegram ], [ "Google", iconMap.google ], [ "谷歌商店", iconMap.playstore ], [ "微软服务", iconMap.microsoft ], [ "微软Bing", iconMap.bing ] ], BUSINESS_SERVICE_TAIL = [ [ "翻译服务", iconMap.translate ], [ "支付服务", iconMap.payment ], [ "Twitch", iconMap.twitch ], [ "GitHub", iconMap.github ], [ "国外游戏", iconMap.game ], [ "社交信息流", iconMap.social ], [ "去中心化平台", iconMap.decentralized ], [ "Discord", iconMap.discord ], [ "个人媒体", iconMap.personalMedia ], [ "新闻资讯", iconMap.news ] ], BUSINESS_SERVICE_ICON_DEFS = BUSINESS_SERVICE_HEAD.concat(BUSINESS_SERVICE_TAIL), businessChoiceMap = function(defs, templateMap = null) {
    return function(defs, keyField, builder) {
      const map = Object.create(null);
      for (let i = 0; i < defs.length; i++) {
        const def = defs[i];
        map[def.key] = builder(def);
      }
      return map;
    }(defs, 0, def => {
      const pool = def.poolKey && templateMap ? templateMap[def.poolKey] : def.pool;
      return makeOrderedChoices(def.first, pool, def.scope);
    });
    // 候选池构建：不仅要合并 first + parts，还必须透传组级额外白名单。
    // 否则像“国内服务”这种允许额外候选的组，会在二次重组时又被按全局白名单刷掉。
    }(BUSINESS_CHOICE_DEFS, CHOICE_POOLS), businessServiceGroupDefs = makeSelectGroupDefList(BUSINESS_SERVICE_ICON_DEFS.map(entry => ({
    name: entry[0],
    icon: entry[1],
    choices: businessChoiceMap[entry[0]]
  }))), AI_SERVICE_GROUP = makeSelectGroupDef("国外AI", iconMap.ai, businessChoiceMap["国外AI"] || []), CHOICE_GROUPS = {
    streaming: usableChoices(CHOICE_POOLS.streaming),
    taiwanMedia: usableChoices(CHOICE_POOLS.taiwanMedia),
    riskControl: usableChoices(CHOICE_POOLS.riskControl)
  }, preferredHomeFailover = [ "🏠香港家宽节点", "🏠台湾家宽节点", "🏠日本家宽节点", "🏠韩国家宽节点", "🏠美国家宽节点", "🏠欧盟家宽节点" ], availableHomeManualNames = new Set(regionHomeManualNames), homeFailoverChoices = unique([ ...preferredHomeFailover.filter(name => availableHomeManualNames.has(name)), ...regionHomeManualNames.filter(name => !preferredHomeFailover.includes(name)) ].filter(Boolean)), MAIN_CHOICE_POOLS = buildChoicePoolsFromDefs([ usableChoiceDef("nodeSelection", [ "节点选择", "自动选择", "🔗链式出口", "负载均衡", "全球手动" ], fallbackNames.filter(name => !excludedFallbackChoiceSet.has(name)), globalFeatureChoices, fusionVisibleRegions), usableChoiceDef(
  // 国内服务放行内置直连
  "systemService", [ "节点选择", "自动选择", "全球手动", "DIRECT" ], fusionVisibleRegions), usableChoiceDef("domesticService", 
  // 最终兜底候选
  domesticServiceChoices, domesticChoices.filter(x => "DIRECT" !== x && !directChoices.includes(x)), regionManualNames), usableChoiceDef("finalFallback", [ "节点选择", "自动选择", "自动兜底", "全球手动", globalHomeGroup ? "🏡全球家宽" : null ].filter(Boolean), fallbackNames.filter(name => !excludedFallbackChoiceSet.has(name) && !regionFallbackNames.includes(name) && "家宽故障转移" !== name), 
  // 附加显示组
  fusionVisibleRegions) ]), regionAutoGroupMap = Object.create(null);
  for (let i = 0; i < regionAutoGroups.length; i++) {
    const group = regionAutoGroups[i];
    group && group.name && (regionAutoGroupMap[group.name] = group);
  }
  const visibleRegionAutoGroups = [];
  for (let i = 0; i < regionAutoOrder.length; i++) {
    const group = regionAutoGroupMap[regionAutoMap[regionAutoOrder[i]] || ""];
    group && visibleRegionAutoGroups.push(group);
  }
  const specialFeatureGroups = [];
  globalHomeGroup && specialFeatureGroups.push(globalHomeGroup), 
  // 服务分流组
  globalDedicatedGroup && specialFeatureGroups.push(globalDedicatedGroup), highMultiplierGroup && specialFeatureGroups.push(highMultiplierGroup), 
  // standardMultiplierGroup removed
  lowMultiplierGroup && specialFeatureGroups.push(lowMultiplierGroup), globalStreamingGroup && specialFeatureGroups.push(globalStreamingGroup);
  for (const carrierGroup of carrierGroups) specialFeatureGroups.push(carrierGroup);
  const RISK_CONTROL_SERVICE_GROUP = makeSelectGroupDef("风控安全", iconMap.riskControl, [ "🔗链式出口" ].concat(CHOICE_GROUPS.riskControl), []), domesticServiceDisplayChoices = buildChoiceList([ "DIRECT" ], [ "全球手动" ], domesticServiceChoices, fusionVisibleRegions.length ? fusionVisibleRegions : regionManualNames), DOMESTIC_SERVICE_GROUP = makeSelectGroupDef("IP属地", iconMap.china, domesticServiceDisplayChoices, [], domesticServiceDisplayChoices), SERVICE_GROUP_BASE_DEFS = makeSelectGroupDefList([ RISK_CONTROL_SERVICE_GROUP, DOMESTIC_SERVICE_GROUP, {
    name: "流媒体",
    icon: iconMap.streaming,
    choices: CHOICE_GROUPS.streaming
  }, {
    name: "台湾媒体",
    icon: iconMap.taiwanMedia,
    choices: CHOICE_GROUPS.taiwanMedia
  }, {
    name: "FCM",
    icon: iconMap.fcm,
    choices: MAIN_CHOICE_POOLS.systemService
  }, {
    name: "Apple",
    icon: iconMap.apple,
    choices: MAIN_CHOICE_POOLS.systemService
  }, {
    name: "Cloudflare",
    icon: iconMap.cloudflare || iconMap.global,
    choices: cloudflareGroupChoices
  } ]), serviceGroupDefs = makeSelectGroupDefList([ RISK_CONTROL_SERVICE_GROUP, AI_SERVICE_GROUP, ...businessServiceGroupDefs.slice(0, BUSINESS_SERVICE_HEAD.length), 
  // 工具组
  DOMESTIC_SERVICE_GROUP, ...businessServiceGroupDefs.slice(BUSINESS_SERVICE_HEAD.length), ...SERVICE_GROUP_BASE_DEFS.slice(2) ]), UTILITY_GROUP_PRESET_DEFS = makeSelectGroupDefList([ {
    name: "广告拦截",
    icon: iconMap.adblock,
    choices: [ "REJECT", "REJECT-DROP", "PASS" ],
    extraDefaults: [ "REJECT-DROP" ]
  }, {
    name: "跟踪分析",
    icon: qIcon("Reject"),
    choices: [ "REJECT", "自动选择" ],
    extraDefaults: [ "REJECT" ]
  }, {
    name: "隐私保护",
    icon: iconMap.privacy,
    choices: [ "REJECT", "自动选择" ],
    extraDefaults: [ "REJECT" ]
  }, {
    name: "受限网站",
    icon: "https://api.iconify.design/mdi:shield-lock-outline.svg?color=%23e67e22",
    choices: MAIN_CHOICE_POOLS.finalFallback
  }, {
    name: "漏网之鱼",
    icon: iconMap.final,
    choices: MAIN_CHOICE_POOLS.finalFallback
  } ]), utilityGroupDefs = makeSelectGroupDefList([ {
    name: "下载专用组",
    icon: iconMap.download || iconMap.fallback,
    choices: downloadGroupChoices
  }, ...UTILITY_GROUP_PRESET_DEFS ]), autoGroup = makeUrlTestGroup("自动选择", iconMap.auto, allProxyNames, 300, 50) || {
    name: "自动选择",
    type: "select",
    icon: iconMap.auto,
    proxies: sanitizeChoiceList(usableChoices(allProxyNames), usableChoices([ "全球手动" ]))
  }, homeFailoverGroup = makeFallbackGroup("家宽故障转移", iconMap.flare, usableChoices(homeFailoverChoices), homeFailoverChoices.length ? [] : [ "自动兜底" ], {
    interval: 1200,
    tolerance: 300,
    timeout: 5e3,
    // 链式双组：中转(隐藏 fallback，自动选跳板) + 出口(可见 select，手动选落地)
    // 风控只看「出口」的落地 IP（dialer-proxy 使路径为 客户端→中转→出口→目标，出口 IP 才是目标可见的最终出口）。
    // 因此：出口优先干净的家宽/住宅 IP；中转对目标不可见，只需快、稳、低成本。
    // 中转候选顺序：专线(骨干最稳) → 低倍率(链式流量翻倍，省成本) → 自动选择 → 自动兜底 → 地区自动组/地区节点组
    // 中转刻意排除家宽：家宽带宽有限且珍贵，应全部留给出口落地，不消耗在中转跳板上。
    maxFailedTimes: 5,
    lazy: !0
  }), chainTransitChoices = sanitizeUiChoiceList([ globalDedicatedGroup ? "全球专线" : null, lowMultiplierGroup ? "低倍率节点" : null ].filter(Boolean), 
  // 出口候选顺序：全球家宽 → 地区家宽节点 → 家宽故障转移 → 自动兜底 → 地区节点组 → 特征组 → 真实节点
  // 出口 IP 直接决定风控判定，家宽/住宅 IP 排最前以最大化落地清白度。
  [ "自动选择", "自动兜底" ], regionAutoNames, regionManualNames.filter(name => !String(name).includes("家宽"))), chainExitChoices = sanitizeUiChoiceList([ "家宽故障转移", globalHomeGroup ? "🏡全球家宽" : null, globalHomeAuto ? "🏡全球家宽自动" : null ].filter(Boolean), regionHomeManualNames, [ "家宽故障转移", "自动兜底" ], regionManualNames.filter(name => !regionHomeManualNames.includes(name)), [ globalStreamingGroup ? "全球流媒体" : null, globalDedicatedGroup ? "全球专线" : null, highMultiplierGroup ? "高倍率节点" : null, lowMultiplierGroup ? "低倍率节点" : null ].filter(Boolean), allProxyNames), chainGroups = [ chainTransitChoices.length ? {
    name: "🪜链式中转",
    type: "fallback",
    icon: "https://api.iconify.design/tabler:git-branch.svg?color=%23f59e0b",
    proxies: chainTransitChoices,
    url: TEST_URL,
    interval: 300,
    tolerance: 100,
    lazy: !0,
    hidden: !1
  } : null, chainExitChoices.length ? {
    name: "🔗链式出口",
    type: "select",
    icon: "https://api.iconify.design/tabler:logout-2.svg?color=%230ea5e9",
    override: {
      "dialer-proxy": "🪜链式中转"
    },
    proxies: chainExitChoices
  } : null ].filter(Boolean), CORE_ENTRY_GROUPS = [ makeSelectGroup("节点选择", iconMap.rocket, MAIN_CHOICE_POOLS.nodeSelection) ], CORE_AUTO_GROUPS = [];
  CORE_AUTO_GROUPS.push(autoGroup);
  for (let i = 0; i < loadBalanceGroups.length; i++) CORE_AUTO_GROUPS.push(loadBalanceGroups[i]);
  // QUIC(UDP:443) 独立控制组：紧跟负载均衡。
  // 成员是两个隐藏别名组，目的是在面板上把内置动作渲染成中文“通过/拒绝”。
  // 通过 = 境外 QUIC 正常走代理；拒绝 = 阻 QUIC，客户端自动降级 TCP/TLS，随后命中正常域名规则。
    CORE_AUTO_GROUPS.push({
    name: "通过",
    type: "select",
    icon: "https://api.iconify.design/tabler:world-download.svg?color=%2322c55e",
    hidden: !0,
    proxies: ensureGroupList([ "节点选择" ], [ "DIRECT" ])
  }, {
    name: "拒绝",
    type: "select",
    icon: "https://api.iconify.design/tabler:world-off.svg?color=%23ef4444",
    hidden: !0,
    proxies: [ "REJECT", "REJECT-DROP" ]
  }, {
    name: "QUIC控制",
    type: "select",
    icon: "https://api.iconify.design/tabler:world-www.svg?color=%2306b6d4",
    proxies: [ "通过", "拒绝" ]
  }), CORE_AUTO_GROUPS.push(makeSelectGroup("全球手动", iconMap.select, allProxyNames, []));
  const CORE_FAILOVER_GROUPS = [];
  for (let i = 0; i < fallbackGroups.length; i++) CORE_FAILOVER_GROUPS.push(fallbackGroups[i]);
  homeFailoverGroup && CORE_FAILOVER_GROUPS.push(homeFailoverGroup);
  const coreProxyGroupSections = {
    entry: CORE_ENTRY_GROUPS,
    auto: CORE_AUTO_GROUPS,
    failover: CORE_FAILOVER_GROUPS,
    service: makeSelectGroupsFromDefs(serviceGroupDefs),
    utility: [ ...makeSelectGroupsFromDefs(utilityGroupDefs), ...downloadRegionGroups ],
    visibleExtra: [ ...regionManualGroups, 
    // 最终分组装配：拍平、隐藏辅助组并保留旧分组选项顺序。
    // 最终分组装配警示：这里的 flat/filter/map 顺序不要随意调整。
    // - flat: 先展开分区，确保后续处理面对的是线性组列表；
    // - filter(Boolean): 提前剔除空组，避免 hidden/preserve 处理空值；
    // - hidden 标记: 只隐藏辅助组，不改变其被其他组引用的能力；
    // - preserveGroup: 必须放在末尾，保证最终候选顺序基于已清洗后的组数据。
    ...regionHomeManualGroups, ...visibleRegionAutoGroups, ...regionHomeAutoGroups, ...globalFeatureAutoGroups, ...chainGroups, ...specialFeatureGroups ]
  }, proxyGroupBuckets = Object.values(coreProxyGroupSections), proxyGroups = [];
  for (let i = 0; i < proxyGroupBuckets.length; i++) {
    const bucket = asArray(proxyGroupBuckets[i]);
    for (let j = 0; j < bucket.length; j++) {
      let group = bucket[j];
      group && (
      // 全球手动组尽量保留真实节点，不给默认兜底项。
      (/^(香港|台湾|日本|韩国|新加坡|美国|欧盟)下载$/.test(group.name) || "谷歌商店专用" === group.name || "下载轮询组" === group.name || "下载散列组" === group.name || "负载均衡" === group.name) && (
      // 自动选择组允许极端情况下回退到“全球手动 / DIRECT”。
      group = Object.assign({}, group, {
        hidden: !0
      })), 
      // 跟踪分析组用于阻断/直连观测，不需要真实代理。
      proxyGroups.push(preserveGroup(group)));
    }
    // 其余分组不在这里乱补默认项，避免把“自动选择”偷偷塞进别的组。
    }
  const finalizedProxyGroups = function(groups) {
    const finalized = [], seen = new Set, list = asArray(groups);
    for (let i = 0; i < list.length; i++) {
      const group = list[i], groupName = group && group.name;
      group && groupName && !seen.has(groupName) && (seen.add(groupName), 
      // 图标映射
      finalized.push(group));
    }
    return finalized;
  }(proxyGroups), realChoiceCandidateSet = (buildAvailableChoiceNameSetFromGroups(finalizedProxyGroups), 
  function() {
    const set = new Set(allProxyNames), scoped = function() {
      const set = new Set;
      for (let i = 0; i < finalizedProxyGroups.length; i++) {
        const group = finalizedProxyGroups[i];
        group && group.name && set.add(group.name);
        const proxies = group && group.proxies;
        if (Array.isArray(proxies)) for (let j = 0; j < proxies.length; j++) proxies[j] && set.add(proxies[j]);
        const extra = group && group.extra;
        if (Array.isArray(extra)) for (let j = 0; j < extra.length; j++) extra[j] && set.add(extra[j]);
      }
      return set;
    }();
    if (scoped instanceof Set) for (const name of scoped) set.add(name); else {
      const arr = asArray(scoped);
      for (let i = 0; i < arr.length; i++) arr[i] && set.add(arr[i]);
    }
    return set.add("谷歌商店专用"), set;
  }());
  // 全球手动组若被清空，则回填全部真实节点；极端情况下至少保留 DIRECT，避免 select 组缺失 proxies。
    function hasRealChoiceCandidates(list) {
    // fallback 组只保留构建阶段明确给它的候选；这里不额外补“自动选择”。
    // 如果清洗后彻底为空，ensureGroupList(..., []) 会退到 DIRECT，至少保证配置仍可导入。
    return asArray(list).some(name => realChoiceCandidateSet.has(name));
    // 只有主自动选择组允许在没有真实节点时走语义兜底。
    }
  function finalizeGroupChoices(group, candidates) {
    const proxies = asArray(candidates), fallbackChoices = "DIRECT" === (groupName = group.name) ? [ "DIRECT" ] : 
    // availableChoiceNames：最终允许出现在 proxies 列表里的名字全集。
    // 包含真实节点名、已生成的组名、组级额外放行项，以及 DIRECT / REJECT 等内建动作。
    "全球手动" === groupName ? [] : 
    // realChoiceCandidateSet：只包含真实节点名与脚本显式注册为“真实候选”的额外名字，用来判断当前组是否仍有可保留候选。
    "自动选择" === groupName ? [ "全球手动", "DIRECT" ] : "广告拦截" === groupName ? [ "REJECT-DROP", "REJECT", "PASS" ] : 
    // 只要候选中还存在一个真实节点，就说明这个组不需要走语义兜底。
    "跟踪分析" === groupName ? [ "REJECT", "DIRECT" ] : "受限网站" === groupName || "漏网之鱼" === groupName ? [ "自动选择", "全球手动", "DIRECT" ] : [];
    // 其他 url-test / load-balance 组如果没有真实节点，应直接视为空组，后续删除。
    // 谷歌商店专用组按设计承载地区节点组，只要仍有有效成员就保留。负载均衡组同理。
        var groupName;
    const hasRealChoices = hasRealChoiceCandidates(proxies);
    return "DIRECT" === group.name ? [ "DIRECT" ] : "全球手动" === group.name ? ensureGroupList(proxies.length ? proxies : allProxyNames, [ "DIRECT" ]) : "fallback" === group.type ? ensureGroupList(proxies, []) : 
    // 其余 select / 行为组：有真实节点就直接保留；没真实节点才走语义兜底。
    "自动选择" === group.name ? hasRealChoices ? proxies : ensureGroupList(proxies, fallbackChoices) : "url-test" === group.type || "load-balance" === group.type ? PLAY_STORE_SPECIAL_GROUP_NAMES.includes(group.name) || "负载均衡" === group.name || "下载轮询组" === group.name || "下载散列组" === group.name ? proxies.length ? proxies : [] : hasRealChoices ? proxies : [] : hasRealChoices ? proxies : sanitizeChoiceList(proxies, fallbackChoices);
  }
  function shouldDropEmptyGroup(group) {
    return !group || !group.name || !!Array.isArray(group.proxies) && !([ "自动选择", "全球手动" ].includes(group.name) || "url-test" !== group.type && "load-balance" !== group.type || (PLAY_STORE_SPECIAL_GROUP_NAMES.includes(group.name) || "负载均衡" === group.name || "下载轮询组" === group.name || "下载散列组" === group.name ? asArray(group.proxies).length : hasRealChoiceCandidates(group.proxies)));
  }
  function buildAvailableChoiceNameSetFromGroups(groups) {
    // 优化：直接从当前 groups 构建，不再间接调用 buildRealChoiceCandidateSet
    // buildRealChoiceCandidateSet 底层遍历 finalizedProxyGroups（稳定化前快照），这里需要当前轮的快照
    const names = new Set(allProxyNames), list = asArray(groups);
    for (let i = 0; i < list.length; i++) {
      const group = list[i];
      group && group.name && names.add(group.name);
      const px = group && group.proxies;
      if (Array.isArray(px)) for (let j = 0; j < px.length; j++) px[j] && names.add(px[j]);
    }
    names.add("谷歌商店专用");
    for (const name of BUILTIN_CHOICE_NAMES) names.add(name);
    return names;
  }
  // 构建组映射表
    function runProxyGroupCleanupPass(groups, availableChoiceNameSet) {
    const cleanedGroups = asArray(groups).map(group => {
      if (!group || !Array.isArray(group.proxies) || !group.name) return group;
      const filteredProxies = function(list, availableChoiceNameSet, selfName) {
        const source = asArray(list);
        let dropped = !1;
        const filtered = [];
        for (let i = 0; i < source.length; i++) {
          const item = source[i];
          item && item !== selfName && (BUILTIN_CHOICE_NAMES.has(item) || availableChoiceNameSet.has(item)) ? filtered.push(item) : dropped = !0;
        }
        // 可见地区链：地区家宽节点组 + 地区节点组（不含自动组）
        // 优化：无过滤时返回原引用，让调用方跳过 finalizeGroupChoices
                return dropped ? filtered : source;
        // 全局兜底地区顺序：用于自动兜底组，优先尝试更常用出口地区。
            }(group.proxies, availableChoiceNameSet, group.name);
      // 第二步：切除自引用和互环引用
      // 优化：filteredProxies 与原 proxies 引用相同时跳过 finalizeGroupChoices
            return filteredProxies === group.proxies ? group : Object.assign({}, group, {
        proxies: finalizeGroupChoices(group, filteredProxies)
      });
    }).filter(group => !shouldDropEmptyGroup(group)), groupMap = Object.create(null), groupProxySets = Object.create(null);
    for (let i = 0; i < cleanedGroups.length; i++) {
      const group = cleanedGroups[i];
      group && group.name && (groupMap[group.name] = group, Array.isArray(group.proxies) && (groupProxySets[group.name] = new Set(group.proxies)));
    }
    return cleanedGroups.map(group => {
      if (!group || !Array.isArray(group.proxies) || !group.name) return group;
      // 自引用 A -> A：丢弃
            const nextProxies = [];
      // 互环引用 A -> B && B -> A：丢弃
            groupProxySets[group.name];
      for (let i = 0; i < group.proxies.length; i++) {
        const proxyName = group.proxies[i], targetGroup = groupMap[proxyName];
        if (!targetGroup || !Array.isArray(targetGroup.proxies)) {
          nextProxies.push(proxyName);
          continue;
        }
        if (targetGroup.name === group.name) continue;
        const targetSet = groupProxySets[targetGroup.name];
        targetSet && targetSet.has(group.name) || nextProxies.push(proxyName);
      }
      return Object.assign({}, group, {
        proxies: finalizeGroupChoices(group, nextProxies)
      });
    }).filter(group => !shouldDropEmptyGroup(group));
  }
  function getProxyGroupSignature(groups) {
    // 稳定化清洗：反复执行"删失效引用 -> 切环 -> 删空自动组"，直到分组关系不再变化。
    // 这样即使存在 A 引用 B、B 删除后又影响 C 的级联场景，也不会残留 not found。
    // 优化：用轻量字符串拼接替代 JSON.stringify，避免大量临时对象创建与序列化开销
    const list = asArray(groups);
    let sig = "";
    for (let i = 0; i < list.length; i++) {
      const group = list[i];
      if (!group || !group.name) continue;
      sig += group.name + "|" + (group.type || "") + "|";
      const px = group.proxies;
      if (Array.isArray(px)) for (let j = 0; j < px.length; j++) sig += px[j] + ",";
      sig += ";";
    }
    return sig;
  }
  let stabilizedProxyGroups = finalizedProxyGroups.slice(), previousSignature = "", _cachedChoiceSet = null;
  for (let round = 0; round < 8; round++) {
    // === 最终落盘与一致性校验 ===
    // 组名 Emoji 前缀：在最终落盘前统一添加，避免散落在各处的字符串引用需要逐一修改。
    // 同时把规则目标中的旧组名同步替换为带 emoji 的新组名。
    stabilizedProxyGroups = runProxyGroupCleanupPass(stabilizedProxyGroups, _cachedChoiceSet || buildAvailableChoiceNameSetFromGroups(stabilizedProxyGroups));
    const nextAvailableChoiceNameSet = buildAvailableChoiceNameSetFromGroups(stabilizedProxyGroups);
    stabilizedProxyGroups = runProxyGroupCleanupPass(stabilizedProxyGroups, nextAvailableChoiceNameSet);
    const signature = getProxyGroupSignature(stabilizedProxyGroups);
    if (signature === previousSignature) break;
    previousSignature = signature, _cachedChoiceSet = nextAvailableChoiceNameSet;
  }
  config["proxy-groups"] = stabilizedProxyGroups;
  const GROUP_EMOJI_MAP = {
    "节点选择": "🚀节点选择",
    "自动选择": "⚡自动选择",
    "全球手动": "🔧全球手动",
    DIRECT: "DIRECT",
    "负载均衡": "⚖️负载均衡",
    "QUIC控制": "⚙️QUIC控制",
    "下载散列组": "🔀下载散列组",
    "下载轮询组": "🔁下载轮询组",
    "谷歌商店专用": "🛒谷歌商店专用",
    "自动兜底": "🪂自动兜底",
    "家宽故障转移": "🔥家宽故障转移",
    "港台故障转移": "⭐港台故障转移",
    "日韩故障转移": "❤️日韩故障转移",
    "欧美故障转移": "✨欧美故障转移",
    "YouTube无广节点优先组": "🎯YouTube无广节点优先组",
    "风控安全": "🔐风控安全",
    "IP属地": "📍IP属地",
    "流媒体": "🎬流媒体",
    "台湾媒体": "🛰台湾媒体",
    FCM: "📨FCM",
    Apple: "🍎Apple",
    Cloudflare: "☁️Cloudflare",
    "下载专用组": "📥下载专用组",
    "广告拦截": "🚫广告拦截",
    "跟踪分析": "🕵️跟踪分析",
    "隐私保护": "🔒隐私保护",
    "受限网站": "🚧受限网站",
    "漏网之鱼": "🐟漏网之鱼",
    "🏡全球家宽": "🏡全球家宽",
    "全球专线": "🚄全球专线",
    "低倍率节点": "🐢低倍率节点",
    "高倍率节点": "🐎高倍率节点",
    "全球流媒体": "🎞️全球流媒体",
    YouTube: "▶️YouTube",
    TikTok: "🎵TikTok",
    Meta: "💬Meta",
    Twitter: "🐦Twitter",
    Niconico: "🍿Niconico",
    "日韩生态区": "🎏日韩生态区",
    Spotify: "🎧Spotify",
    Telegram: "✈️Telegram",
    Google: "🔍Google",
    "谷歌商店": "🛒谷歌商店",
    "微软服务": "🪟微软服务",
    "微软Bing": "🆎微软Bing",
    "翻译服务": "📚翻译服务",
    "支付服务": "💳支付服务",
    Twitch: "🕹️Twitch",
    GitHub: "🐙GitHub",
    // 地区自动组 / 节点组 / 下载组：按地区名加 emoji 前缀
    "国外AI": "🧠国外AI",
    "国外游戏": "🎮国外游戏",
    "社交信息流": "📰社交信息流",
    "去中心化平台": "⛓️去中心化平台",
    Discord: "🎙️Discord",
    // 全球特征组自动名映射
    "个人媒体": "🎥个人媒体",
    "新闻资讯": "📡新闻资讯"
  }, REGION_EMOJI = {
    "香港": "🇭🇰",
    "台湾": "🇹🇼",
    "美国": "🇺🇸",
    "日本": "🇯🇵",
    "新加坡": "🇸🇬",
    // 链式双组
    "韩国": "🇰🇷",
    "俄罗斯": "🇷🇺",
    "加拿大": "🇨🇦",
    "欧盟": "🇪🇺",
    "东南亚": "🌏",
    "拉美地区": "🌎",
    "非洲": "🌍",
    "其它地区": "🌐"
  };
  GROUP_EMOJI_MAP["🏡全球家宽自动"] = "🏡全球家宽自动", GROUP_EMOJI_MAP["全球专线自动"] = "🚄全球专线自动", 
  GROUP_EMOJI_MAP["高倍率节点自动"] = "🐎高倍率节点自动", GROUP_EMOJI_MAP["低倍率节点自动"] = "🐢低倍率节点自动", 
  GROUP_EMOJI_MAP["🎞️全球流媒体自动"] = "🎞️全球流媒体自动", 
  // 地区家宽自动组：地区家宽自动 → 🇭🇰香港家宽自动
  GROUP_EMOJI_MAP["🔗链式出口"] = "🔗链式出口", 
  // 地区家宽节点组：🏠地区家宽节点 → 🏠🇭🇰香港家宽节点
  GROUP_EMOJI_MAP["🪜链式中转"] = "🪜链式中转", 
  // 构建反向映射（新名 -> 旧名），用于规则目标替换
  new Set(Object.keys(REGION_EMOJI)).forEach(regionName => {
    const emoji = REGION_EMOJI[regionName];
    GROUP_EMOJI_MAP[regionName + "自动"] = emoji + regionName + "自动", GROUP_EMOJI_MAP[regionName + "节点"] = emoji + regionName + "节点", 
    GROUP_EMOJI_MAP[regionName + "下载"] = emoji + regionName + "下载", GROUP_EMOJI_MAP[regionName + "家宽自动"] = emoji + regionName + "家宽自动", 
    GROUP_EMOJI_MAP["🏠" + regionName + "家宽节点"] = "🏠" + emoji + regionName + "家宽节点";
  });
  // 替换 proxy-groups 中的组名和引用
  const reverseEmojiMap = Object.create(null);
  for (const oldName in GROUP_EMOJI_MAP) reverseEmojiMap[GROUP_EMOJI_MAP[oldName]] = oldName;
  function applyEmojiRename(name) {
    return name && GROUP_EMOJI_MAP[name] || name;
  }
  config["proxy-groups"] = config["proxy-groups"].map(group => {
    // 规则目标校验：规则里引用的策略名必须真的存在。
    // 这是规则区最常见的维护事故之一：改了组名，却忘了同步规则目标。
    if (!group) return group;
    const newName = applyEmojiRename(group.name), newProxies = Array.isArray(group.proxies) ? group.proxies.map(p => applyEmojiRename(p)) : group.proxies;
    return Object.assign({}, group, {
      name: newName,
      proxies: newProxies
    });
  });
  const availableRuleTargets = makeNameSet(config["proxy-groups"].map(group => group && group.name));
  for (const name of BUILTIN_CHOICE_NAMES) availableRuleTargets.add(name);
  const RULE_TRAILING_FLAGS = new Set([ "NO-RESOLVE", "SRC", "DST", "UDP", "TCP" ]);
  // 从后往前找第一个非标志位的值作为目标
    function parseRuleParts(rule) {
    if ("string" != typeof rule) return null;
    // 优化：split 不做 map+trim，延迟到使用时再 trim
        const parts = rule.split(",");
    return parts.length ? parts : null;
  }
  function extractRulePolicyTarget(ruleOrParts) {
    const parts = Array.isArray(ruleOrParts) ? ruleOrParts : parseRuleParts(ruleOrParts);
    if (!parts || parts.length < 3) return null;
    for (let i = parts.length - 1; i >= 2; i--) {
      const value = parts[i];
      if (value && !RULE_TRAILING_FLAGS.has(value.toUpperCase())) return value;
    }
    return null;
  }
  function getRuleIdentityKey(rule) {
    const parts = parseRuleParts(rule);
    if (!parts) return null;
    const meta = function(ruleOrParts) {
      const parts = Array.isArray(ruleOrParts) ? ruleOrParts : parseRuleParts(ruleOrParts);
      return !parts || parts.length < 2 ? null : {
        type: parts[0].toUpperCase(),
        value: parts[1],
        target: extractRulePolicyTarget(parts)
      };
    }(parts);
    if (!meta || !meta.type || !meta.value) return `RAW@@${rule}`;
    const extraParts = parts.length > 3 ? parts.slice(3).join(",") : "";
    return `${meta.type}@@${meta.value}@@${extraParts}`;
  }
  const RULES_YOUTUBE = [ ...ruleProcess([ "com.google.android.youtube", "app.rvx.android.youtube", "app.rvx.android.apps.youtube", "app.revanced.android.youtube", "app.morphe.android.youtube", "com.google.android.apps.youtube.music" ], "YouTube"), ...ruleDomain([ "www.youtube.com", "m.youtube.com", "youtubeembeddedplayer.googleapis.com", "jnn-pa.googleapis.com", "video.google.com" ], "YouTube"), ...ruleSuffix([ "youtube.com", "youtubei.googleapis.com", "youtube.googleapis.com", "googlevideo.com", "ytimg.com", "ggpht.com", "youtu.be" ], "YouTube") ], RULES_APP_PROCESS = [ ...ruleProcess([ "com.anthropic.claude", "com.google.android.apps.bard", "com.google.android.apps.gemini" ], "国外AI"), ...ruleProcess([ "ai.perplexity.app.android", "com.openai.chatgpt", "com.openai.chat", "ai.x.grok", "ai.cici.android", "com.ciciai.app", "com.coze.android", "ai.coze.app", "com.microsoft.copilot" ], "国外AI"), 
  // DeepSeek / Kimi 服务器在境内，进国外AI组会被代理拖慢且换 IP 后易风控，改走直连
  ...ruleProcess([ "com.deepseek.chat", "com.moonshot.kimichat" ], "DIRECT"), ...ruleProcess([ "com.spotify.music", "com.spotify.lite", "com.aspiro.tidal" ], "Spotify"), ...ruleProcess([ "com.netflix.mediaclient", "com.disney.disneyplus", "com.amazon.avod.thirdpartyclient", "com.hulu.plus", "com.hbo.hbonow", "com.hbo.max", "com.wbd.stream", "com.paramount.android.pplus", "com.peacocktv.peacockandroid", "com.crunchyroll.crunchyroid", "com.plexapp.android", "org.jellyfin.mobile", "com.mb.android" ], "流媒体"), ...ruleProcess([ "com.discord" ], "Discord"), ...ruleProcess([ "com.twitter.android", "com.twitter.android.lite" ], "Twitter"), ...ruleProcess([ "com.reddit.frontpage", "com.linkedin.android", "com.pinterest", "com.snapchat.android", "com.medium.reader" ], "社交信息流"), ...ruleProcess([ "com.facebook.katana", "com.facebook.lite", "com.facebook.orca", "com.facebook.mlite", "com.instagram.android", "com.instagram.barcelona", "com.whatsapp", "com.whatsapp.w4b" ], "Meta"), ...ruleProcess([ "com.zhiliaoapp.musically", "com.ss.android.ugc.trill", "com.ss.android.ugc.aweme.mobile", "com.ss.android.ugc.trill.go", "com.rezvorck.tiktokplugin" ], "TikTok"), ...ruleProcess([ "org.telegram.messenger", "org.telegram.messenger.web", "org.telegram.plus", "com.exteragram.messenger", "nekox.messenger", "tw.nekomimi.nekogram", "me.nekogram.app", 
  // 协作 / 云办公：暂挂 GitHub 组（开发与生产力同池，避免再拆一组）
  "xyz.nextalone.nagram", "ellipi.messenger", "org.thunderdog.challegram", "org.aka.messenger", "org.telegram.BifToGram", 
  // 第三方补充：AyuGram / Turrit / SoundGram / Graph / Catogram / MDGram / OctoGram / Lapogram
  "com.radolyn.ayugram", "com.turrit.tg", "org.soundgram.messenger", "org.telegram.group", "com.creativetrends.apps.tg", "com.catogram.android", "com.mdgram.android", "org.octogram.android", "me.lapogram.app" ], "Telegram"), ...ruleProcess([ "org.thoughtcrime.securesms", "org.thoughtcrime.securesms.donations" ], "隐私保护"), ...ruleProcess([ 
  // 游戏
  "jp.naver.line.android", "com.linecorp.linelite", "com.kakao.talk", "com.nhn.android.search", "com.nhn.android.band", "jp.gocro.smartnews.android" ], "日韩生态区"), ...ruleProcess([ "us.zoom.videomeetings", "com.Slack", "notion.id", "com.notion.android", "com.dropbox.android", "com.box.android", "com.figma.mirror", "com.canva.editor", "com.atlassian.android.jira.core", "com.trello", "com.asana.app", "com.monday.monday" ], "GitHub"), ...ruleProcess([ 
  // 翻译 / Google 基础服务
  "com.valvesoftware.android.steam.community", "com.epicgames.portal", "com.roblox.client", "com.mojang.minecraftpe", "com.activision.callofduty.shooter", "com.riotgames.league.wildrift", "com.riotgames.league.teamfighttactics", "com.supercell.clashofclans", "com.supercell.clashroyale", "com.supercell.brawlstars", "com.nintendo.znca", "com.playstation.remoteplay", "com.microsoft.xboxone.smartglass", "com.ea.gp.fifamobile", "com.miHoYo.GenshinImpact", "com.HoYoverse.hkrpgoversea", "com.garena.game.codm", "com.pubg.imobile", "com.tencent.ig" ], "国外游戏"), ...ruleProcess([ "com.google.android.apps.translate", "com.deepl.mobiletranslator", "com.google.android.apps.googlevoice" ], "翻译服务"), ...ruleProcess([ 
  // 微软 / Apple / GitHub / 支付 / 下载 / 新闻
  "com.google.android.gms", "com.google.android.gsf", "com.google.android.apps.maps", "com.google.android.googlequicksearchbox", "com.google.android.apps.photos", "com.google.android.apps.docs", "com.google.android.apps.docs.editors.docs", "com.google.android.apps.docs.editors.sheets", "com.google.android.apps.docs.editors.slides", "com.google.android.gm", "com.google.android.calendar", "com.google.android.contacts", "com.google.android.keep", "com.google.android.apps.tachyon", "com.google.android.apps.nbu.files", "com.google.android.apps.chromecast.app", "com.google.android.apps.youtube.creator" ], "Google"), ...ruleProcess([ "com.microsoft.office.outlook", "com.microsoft.teams", "com.microsoft.skydrive", "com.microsoft.office.officehubrow", "com.microsoft.office.excel", "com.microsoft.office.word", "com.microsoft.office.powerpoint", "com.xbox.gamepass", "com.azure.authenticator", "com.microsoft.windowsintune.companyportal" ], "微软服务"), ...ruleProcess([ "com.apple.android.music", "com.apple.movetoios", "com.icloud.mobile", "com.apple.atve.androidtv.appletv", "com.apple.android.tv", "com.apple.iCloudDriveApp" ], "Apple"), ...ruleProcess([ "com.github.android", "com.github.mobile", "com.jetradarmobile.stackoverflow" ], "GitHub"), ...ruleProcess([ "com.paypal.android.p2pmobile", "com.stripe.android.dashboard", "com.wise.android", "com.revolut.revolut", "com.coinbase.android", "com.binance.dev", "io.metamask", "com.wallet.crypto.trustapp", "exodusmovement.exodus", "piuk.blockchain.android", "com.okinc.okex.gp", "com.bybit.app", "com.kraken.trade", "com.kubi.kucoin" ], "风控安全"), ...ruleProcess([ "com.deniscerri.ytdl", "com.deniscerri.ytdlnis", "io.github.deniscerri.ytdlnis", 
  // 翻译服务规则（DOMAIN-SUFFIX 已覆盖域本身，无需重复 DOMAIN）
  "com.dv.adm", "com.dv.adm.pay", "idm.internet.download.manager", "idm.internet.download.manager.plus", "com.xunlei.downloadprovider", "com.aria2.downloader", "com.molink.john.hummingbird" ], "下载专用组"), ...ruleProcess([ 
  // 广告拦截规则
  "bbc.mobile.news.ww", "com.nytimes.android", "com.reuters", "com.bloomberg.android.plus", "com.cnn.mobile.android.phone", "com.guardian", "flipboard.app", "com.google.android.apps.magazines" ], "新闻资讯") ], RULES_TRANSLATION = [ ...ruleDomain([ "www.deepl.com", "api.deepl.com", "www2.deepl.com", "dict.deepl.com", "static.deepl.com" ], "翻译服务"), 
  // 关键词拦截只保留高置信度广告词
  ...ruleSuffix([ "translate.googleapis.com", "translation.googleapis.com", "translate-pa.googleapis.com", "translate.google.com", "translate.google.cn", "deepl.com", "deeplpro.com", "deeplusercontent.com", "linguee.com" ], "翻译服务") ], RULES_ADBLOCK = [ 
  // 风控安全规则
  "DOMAIN,incoming.telemetry.mozilla.org,REJECT-DROP", 
  // 跟踪分析规则：覆盖 Tracker、遥测、统计与分析域名。
  "DOMAIN-REGEX,^(log|mon)[0-9A-Za-z.-]*.tiktokv.com$,REJECT", "PROCESS-NAME,TikTok.Mod.Jaggu,TikTok", "PROCESS-NAME-REGEX,(?i)^TikTok.Mod.Jaggu(?::.*)?$,TikTok", "GEOSITE,category-ads-all,广告拦截", "RULE-SET,adrules,广告拦截", ...ruleKeyword([ "adserver", "adnetwork", "adtech", "adsdk", "adapi", "adtrack", "adclick", "adcount", "adstat", "adload", "adsystem", "impression", "conversion", "atdmt", "adform", "taboola", "popunder", "clickhubs", "adriver" ], "广告拦截"), 
  // 风控与系统规则：覆盖 FCM、Play Store、Google AI、下载与高敏感登录链路。
  ...ruleSuffix(adguardDomains(), "广告拦截") ], RULES_RISK_SECURITY = ruleSuffix([ "accounts.google.com", "myaccount.google.com", "ogs.google.com", "androidauth.googleapis.com", "oauthaccountmanager.googleapis.com", "oauth2.googleapis.com", "securetoken.googleapis.com", "identitytoolkit.googleapis.com", "firebaseauth.googleapis.com", "accounts.youtube.com", "families.google.com", "accounts.google.cn", "workspace.google.com", "admin.google.com", "passwords.google.com", "notifications.google.com", "recaptcha.net", "recaptcha-enterprise.google.com", "hcaptcha.com", "newassets.hcaptcha.com", "account.amazon.com", "payments.amazon.com", "paypal.com", "paypal.com.hk", "paypal.com.sg", "paypal.me", "paypal.hk", "paypal.jp", "paypal.us", "paypalservice.com", "paypalcredit.com", "braintreegateway.com", "braintreepayments.com", "card.io", "paypalhere.com", "venmo.com", "xoom.com", "stripe.com", "stripe.network", "stripe-terminal-local-reader.net", "checkout.com", "checkoutcdn.com", "checkoutshopper.com", "payoneer.com", "airwallex.com", "worldpay.com", "skrill.com", "neteller.com", "wise.com", "transferwise.com", "hsbc.com", "interactivebrokers.com", "adyen.com", "visa.com", "mastercard.com", "amex.com", "revolut.com", "ibkr.com", "schwab.com", "binance.com", "binance.us", "bnbstatic.com", "binanceapi.com", "coinbase.com", "okx.com", "oklink.com", "okx-dns.com", "okx-dns1.com", "okx-dns2.com", "bybit.com", "bytick.com", "byapis.com", "bycsi.com", "bybit-global.com", "bybitglobal.com", "gate.io", "gateimg.com", "gatedata.org", "kucoin.com", "kucoin.plus", "kraken.com", "bitget.com", "mexc.com", "huobi.com", "htx.com", "trustwallet.com", "walletconnect.com", "walletconnect.org", "ethereum.org", "etherscan.io", "opensea.io", "uniswap.org", "safepal.com", "isafepal.com", "trezor.io", "ledger.com", "hyperliquid.xyz", "polymarket.com", "dydx.exchange", "bitfinex.com", "bitstamp.net", "deribit.com", "bitflyer.com", "onekey.so", "onekeycn.com", "redotpay.com", "login.live.com", "login.microsoftonline.com", "account.live.com", "account.microsoft.com", "signup.live.com", "appleid.apple.com", "appleaccount.apple.com", "idmsa.apple.com", "idms-apple.com", "iforgot.apple.com", "signin.aws.amazon.com", "dash.cloudflare.com", "challenges.cloudflare.com", "turnstile.cloudflare.com", "assets.cloudflare.com", "authy.com" ], "风控安全"), RULES_TRACKER = [ "GEOSITE,tracker,跟踪分析", ...ruleKeyword([ "tracker", "analytics", "telemetry", "metrics", "logging", "heatmap", "segment", "amplitude", "mixpanel", "sentry", "datadog", "newrelic" ], "跟踪分析"), ...ruleSuffix([ "google-analytics.com", "googletagmanager.com" ], "跟踪分析") ], RULES_RISK_CONTROL = [ ...ruleSuffix([ "fcm.googleapis.com", "fcm-xmpp.googleapis.com", "mtalk.google.com", "mtalk4.google.com", "mtalk-staging.google.com", "fcmtoken.googleapis.com" ], "FCM"), "DST-PORT,5228,FCM", "DST-PORT,5229,FCM", "DST-PORT,5230,FCM", ...ruleProcess([ "com.android.vending", "com.android.providers.downloads", "com.android.providers.downloads.ui" ], "谷歌商店"), ...ruleSuffix([ "play.google.com", "play.googleapis.com", "play-fe.googleapis.com", "play-pa.googleapis.com", "playatoms-pa.googleapis.com", "play-apps-fe-pa.googleapis.com", "play-apps-download-frontend.googleapis.com", "play-lh.googleusercontent.com", "play-games.googleusercontent.com", "market.android.com", "dl.google.com", "dl.l.google.com", "gvt1.com", "gvt2.com", "gvt3.com", "xn--ngstr-lra8j.com", "xn--ngstr-cn-8za9o.com" ], "谷歌商店"), ...ruleSuffix([ "youtube-nocookie.com", "yt.be", "yt3.ggpht.com", "youtubekids.com", "sponsor.ajay.app", "returnyoutubedislikeapi.com" ], "YouTube"), ...ruleSuffix([ "dl.googleusercontent.com", "redirector.gvt1.com", "update.googleapis.com" ], "下载专用组") ], RULES_AI_TIKTOK_EXTRA = [ ...ruleSuffix([ "anthropic.com" ], "国外AI"), ...ruleSuffix([ "gemini.google.com", "generativeai.google", "generativelanguage.googleapis.com", "proactivebackend-pa.googleapis.com", "notebooklm.google.com" ], "国外AI"), ...ruleProcess([ "com.openai.chatgpt", "com.openai.chat" ], "国外AI"), ...ruleSuffix([ "api.openai.com", "auth0.openai.com", "cdn.openai.com", "chat.openai.com", "chatgpt.com", "files.oaiusercontent.com", "livekit.cloud", "openai.com", "statsigapi.net" ], "国外AI"), ...ruleProcess([ "ai.x.grok", "ai.cici.android", "com.ciciai.app", "com.coze.android", "ai.coze.app" ], "国外AI"), "PROCESS-NAME-REGEX,(?i).*(ciciai|cici|coze).*,国外AI", "PROCESS-NAME-REGEX,(?i).*(openai|chatgpt).*,国外AI", ...ruleDomain([ "frontier.tiktokv.com", "p16-tiktokcdn-com.akamaized.net", "rezvorck.github.io", "update.9mod.com", "vcs.zijieapi.com" ], "TikTok"), ...ruleKeyword([ "mssdk", "tiktokcdn", "webcast-frontier" ], "TikTok"), ...ruleSuffix([ "bytegecko-i18n.com", "byteintlapi.com", "ipstatp.com", "isnssdk.com", "sgpstatp.com", "tik-tokapi.com", "tiktok-row.org", "tiktokd.net", "tiktokmusic.app", "ttwebview.com", "ttwstatic.com" ], "TikTok"), ...ruleProcess([ "money.boku.android", "com.ifast.gb", "com.okinc.okex.gp", "team.noones.mobilemessenger" ], "风控安全"), ...ruleDomain([ "communication-app.ifastgb.com", "fpjs.checkout.com", "fpjscache.checkout.com", "auth.noones.com", "api.noones.com", "static.noones.com", "sentry.noones.com", "noonessupport.zendesk.com", "risk.checkout.com", "secure.fundsupermart.com", "sentry.ifastgb.com", "static.ifastgb.com", "stest.zimperium.com", "www.ifastgb.com", "www.noones.com" ], "风控安全"), ...ruleSuffix([ "fundsupermart.com", "ifastgb.com", "neverless.com", "noones.com", "okex.com", "ouyich.biz", "ouyich.show", "cnouyi.pizza" ], "风控安全"), "PROCESS-NAME-REGEX,(?i)^io.metamask(?::.*)?$,风控安全", "PROCESS-NAME-REGEX,(?i)^com.okinc.okex.gp(?::.*)?$,风控安全", ...ruleProcess([ "com.oumi.utility.media.hub" ], "流媒体"), ...ruleDomain([ "api.7littlemen.com", "bps8m.onyra.cc", "image.tmdb.org", "stream.onyra.uk", "vh.api.okaapps.com", "vh.image.okaapps.com", "vh.image1.okaapps.com" ], "流媒体"), ...ruleSuffix([ "okaapps.com", "onyra.cc", "onyra.uk", "premiumize.me" ], "流媒体"), 
  // === 业务规则清单：按业务语义归类，保持与 DNS / 分组联动 ===
  // 国内服务域名分流：主站/AI 走国内服务组，CDN 走 DIRECT（避免代理拖慢）
  "IP-CIDR,121.43.145.95/32,流媒体,no-resolve" ], RULES_APPLE_MEDIA = ruleSuffix([ "tv.apple.com", "video.apple.com" ], "流媒体"), RULES_APPLE = [ ...ruleSuffix([ "apple.com", "icloud.com", "icloud-content.com", "itunes.apple.com", "apps.apple.com", "mzstatic.com", "apple-dns.net", "apple-mapkit.com", "cdn-apple.com", "apple.news", "applemusic.com", "appstore.com" ], "Apple") ], RULES_AI_GLOBAL = [ ...ruleSuffix([ "claude.ai", "claudeusercontent.com", "anthropiccdn.com" ], "国外AI"), ...ruleSuffix([ "ai.com" ], "国外AI"), // ai.com 目前指向 Claude
  ...ruleSuffix([ "perplexity.ai", "perplexity.com", "pplx.ai", "groq.com", "grok.com", "x.ai", "api.x.ai", "mistral.ai", "lechat.ai", "poe.com", "poecdn.net", "stability.ai", "character.ai", "c.ai", "midjourney.com", "cursor.sh", "cursor.com", "huggingface.co", "replicate.com", "cohere.com" ], "国外AI"), ...ruleSuffix([ "oaistatic.com", "oaiusercontent.com", "openaiusercontent.com", "chatgpt.livekit.cloud", "openaiapi-site.azureedge.net" ], "国外AI"), ...ruleSuffix([ "sora.com", "elevenlabs.io", "suno.com", "suno.ai", "lmsys.org", "pomona.ai", "optimizerai.app", "qwen.ai", "deepmind.google", "glean.com", "you.com", "phind.com", "kagihub.com" ], "国外AI") ], RULES_DECENTRALIZED_AND_CLOUDFLARE = [ ...ruleProcess([ "io.metamask", "io.metamask:bridge", "io.metamask:fileprovider" ], "去中心化平台"), ...ruleDomain([ "api2.branch.io", "cdn.branch.io" ], "去中心化平台"), ...ruleSuffix([ "metamask.io" ], "去中心化平台"), ...ruleDomain([ "1.1.1.1" ], "Cloudflare"), ...ruleSuffix([ "cloudflare.com", "cloudflareclient.com", "workers.dev", "pages.dev", "trycloudflare.com", "cdnjs.cloudflare.com" ], "Cloudflare") ], RULES_DOWNLOAD = ruleSuffix([ "download.windowsupdate.com", "windowsupdate.com", "update.microsoft.com", "delivery.mp.microsoft.com", "download.jetbrains.com", "download.docker.com", "packages.microsoft.com", "download.visualstudio.microsoft.com", "speed.hetzner.de", "github-releases.githubusercontent.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com", "cdn.mysql.com", "nodejs.org", "static.rust-lang.org", "golang.org", "proxy.golang.org", "repo.huaweicloud.com", "mirrors.edge.kernel.org", "cdn.kernel.org" ], "下载专用组"), RULES_GLOBAL_GAMING = [ ...ruleSuffix([ "steamcommunity.com", "steampowered.com", "steamstatic.com", "steamcdn-a.akamaihd.net", "steamserver.net", "steamcontent.com", "steampipe.akamaized.net", "epicgames.com", "unrealengine.com", "epicgames-download1.akamaized.net", "download.epicgames.com", "riotgames.com", "leagueoflegends.com", "playvalorant.com", "riotcdn.net", "lol.secure.dyn.riotcdn.net", 
  // GitHub 规则
  "battle.net", "blizzard.com", "blzddist1-a.akamaihd.net", "ea.com", "origin.com", "origin-a.akamaihd.net", "uplay.com", "ubisoft.com", "cdn.ubisoft.com", "rockstargames.com", "gog.com", "roblox.com", "rbxcdn.com", "minecraft.net", "mojang.com", "launcher.mojang.com", "piston-meta.mojang.com", 
  // 微软规则（不含 Bing 相关域名，已拆分到 RULES_MICROSOFT_BING）
  "nintendo.com", "nintendo.net", "nintendo.co.jp", "cdn.nintendo.net", "sonyentertainmentnetwork.com", "playstation.com", "playstation.net", "psnprofiles.com", "xboxservices.com", "supercell.com", "supercell.net" ], "国外游戏") ], RULES_GITHUB = [ ...ruleSuffix([ "github.com", "github.io", "githubusercontent.com", "githubassets.com", "githubstatus.com", "ghcr.io", "npmjs.com", "npmjs.org", "yarnpkg.com", "github.dev", "raw.githubusercontent.com" ], "GitHub") ], RULES_MICROSOFT = [ ...ruleSuffix([ "microsoft.com", "microsoftonline.com", "live.com", "live.net", "outlook.com", "officeapps.live.com", "onedrive.com", "copilot.microsoft.com", "msn.com", "office.com", "office.net", "office365.com", "microsoft365.com", "sharepoint.com", "skype.com", "teams.microsoft.com", "xbox.com", "xboxlive.com", "azure.com", "windows.net", "msftauth.net", "msauth.net" ], "微软服务") ], RULES_MICROSOFT_BING = [ ...ruleProcess([ "com.microsoft.bing" ], "微软Bing"), ...ruleSuffix([ "bing.com", "cn.bing.com", "global.bing.com", "bing.com.cn", "bingapis.com", "bingstatic.com", "bing.net", "msn.cn" ], "微软Bing") ], RULES_STREAMING = [ ...ruleSuffix([ "netflix.com", "nflxvideo.net", "nflximg.net", "nflxext.com", "nflxso.net", "netflix.net", "disneyplus.com", "disney-plus.net", "dssott.com", "bamgrid.com", "primevideo.com", "amazonvideo.com", "media-amazon.com", 
  // Twitch 规则
  "max.com", "hbomax.com", "hbo.com", "hulu.com", "huluim.com", "appletvplus.com", "paramountplus.com", "cbsi.com", "peacocktv.com", "crunchyroll.com", "crunchyrollsvc.com" ], "流媒体") ], RULES_TAIWAN_MEDIA = [ ...ruleProcess([ "tw.com.gamer.android.animad", "com.kkbox.tv.kkbox", "com.kkbox.kkboxandroid", "com.kktv.kktv", "tw.litv.tv.androidmobile", "com.fetnet.friday" ], "台湾媒体"), ...ruleSuffix([ "hamivideo.hinet.net", "hami.video", "litv.tv", "4gtv.tv", "myvideo.net.tw", "ofiii.com", "catchplay.com", "catchplay.com.tw", "garageplay.tw", "friday.tw", "video.friday.tw", "kktv.com.tw", "linetv.tw", "bahamut.com.tw", "gamer.com.tw", "ani.gamer.com.tw", "ptsplus.tv", "pts.org.tw", "cts.com.tw", "ftvnews.com.tw", "news.tvbs.com.tw", "tvbs.com.tw", "setn.com", "ettoday.net", "mirrormedia.mg", "bcc.com.tw", "dcard.tw", "dcard.video", "udn.com", "udngroup.com", "ltn.com.tw", "thenewslens.com", "businessweekly.com.tw", "cmmedia.com.tw", "storm.mg", "nownews.com", "cna.com.tw", "books.com.tw", "readmoo.com", "mojim.com", "kkbox.com" ], "台湾媒体") ], RULES_TWITCH = [ ...ruleProcess([ "tv.twitch.android.app", "tv.twitch.android.viewer" ], "Twitch"), ...ruleSuffix([ "twitch.tv", "twitchcdn.net", "ttvnw.net", "jtvnw.net", "live-video.net" ], "Twitch") ], RULES_META = [ ...ruleSuffix([ "facebook.com", "facebook.net", "fb.com", "fbcdn.net", "fbsbx.com", "tfbnw.net", 
  // Telegram 规则
  "messenger.com", "m.me", "instagram.com", "cdninstagram.com", "ig.me", "threads.net", "threadsdotnet.com", "whatsapp.com", "whatsapp.net" ], "Meta") ], RULES_SPOTIFY = [ ...ruleProcess([ "com.spotify.music", "com.spotify.lite", "com.spotify.tv.android" ], "Spotify"), ...ruleSuffix([ "spotify.com", "scdn.co", "spoti.fi", "pscdn.co", "spotifycdn.com" ], "Spotify") ], RULES_TELEGRAM = [ ...ruleProcess([ 
  // 官方 + 主流第三方
  "org.telegram.messenger", "org.telegram.messenger.web", "com.exteragram.messenger", "nekox.messenger", "tw.nekomimi.nekogram", "me.nekogram.app", "xyz.nextalone.nagram", "org.telegram.plus", "ellipi.messenger", "org.thunderdog.challegram", 
  // 补充：AyuGram / Turrit / SoundGram / Graph / Catogram / MDGram / OctoGram / Lapogram
  "com.radolyn.ayugram", "com.turrit.tg", "org.soundgram.messenger", "org.telegram.group", "com.creativetrends.apps.tg", "com.catogram.android", "com.mdgram.android", "org.octogram.android", "me.lapogram.app" ], "Telegram"), ...ruleKeyword([ "telegram" ], "Telegram"), ...ruleSuffix([ "telegra.ph", "telegram.org", "t.me", "telesco.pe", "telegram.me", "telegram.dog", 
  // Google 通用规则
  "telegram-cdn.org", "telegram.space", "tg.dev", "tdesktop.com", "usercontent.dev", "graph.org" ], "Telegram"), 
  // GMS 共享端点：android.googleapis.com / android.clients.google.com 是 Google Play Services
  // 的通用 API 网关（设备 checkin、配置拉取、Play Integrity 认证、FCM token 注册等多服务共用），
  // 不专属于谷歌商店下载，也不是 FCM 推送通道，统一归 Google 走稳定境外线路。
  ...ruleIpCidr([ "91.108.4.0/22", "91.108.8.0/21", "91.108.12.0/22", "91.108.16.0/22", "91.108.20.0/22", "91.108.56.0/22", "91.105.192.0/23", "91.108.128.0/17", "149.154.160.0/20", "149.154.192.0/18", "46.17.44.0/22", "46.17.47.0/24", "2001:b28:f23d::/48", "2001:b28:f23f::/48", "2001:67c:4e8::/48" ], "Telegram") ], RULES_GOOGLE = [ ...ruleDomain([ "dns.google", "dns.google.com", "mail.google.com" ], "Google"), ...ruleDomain([ "android.googleapis.com", "android.clients.google.com", "android.clients.google.com.cn", "clientservices.googleapis.com" ], "Google"), ...ruleSuffix([ "google.com", "googleapis.com", "gstatic.com", "gmail.com", "googlemail.com", "ggpht.cn", "googleusercontent.com", "googleusercontent.cn", "withgoogle.com", "g.co", "goo.gl", "googleearth.com", "clients1.google.com", "clients2.google.com", "clients3.google.com", "clients4.google.com", 
  // Twitter / X 规则
  "clients5.google.com", "clients6.google.com", "clients.googleapis.com", "one.google.com", "lens.google.com", "photos.google.com", "maps.google.com", "maps.gstatic.com", "news.google.com", "meet.google.com", "chat.google.com", "drive.google.com", "docs.google.com", "sheets.google.com", 
  // Discord 规则：主站、邀请、资源与客户端
  "slides.google.com", "classroom.google.com", "calendar.google.com", "contacts.google.com", "keep.google.com", "earth.google.com" ], "Google"), ...ruleSuffix([ "gvt1.com", "gvt2.com", "gvt3.com", "xn--ngstr-lra8j.com", "xn--ngstr-cn-8za9o.com" ], "谷歌商店") ], RULES_TWITTER = [ ...ruleSuffix([ "x.com", "twitter.com", "twimg.com", "t.co", "pscp.tv", "periscope.tv" ], "Twitter") ], RULES_DISCORD = [ ...ruleProcess([ "com.discord" ], "Discord"), ...ruleSuffix([ "discord.com", "discord.gg", "discord.gift", "discord.new", "discordapp.com", "discordapp.net", "discordcdn.com", "discord.media", "discordsays.com", "dis.gd" ], "Discord") ], RULES_SOCIAL_FEED = [ 
  // 日韩生态规则
  ...ruleSuffix([ "reddit.com", "redditinc.com", "redditmedia.com", "redditstatic.com", "redditspace.com", "redd.it", "flr.app" ], "社交信息流"), ...ruleDomain([ "reddit.map.fastly.net" ], "社交信息流") ], RULES_DECENTRALIZED_SUPPLEMENT = ruleSuffix([ "bluesky.app", "bsky.app", "bsky.social", "bsky.network", "bsky.chat", "skyfeed.app", "skyfeed.me", "clearsky.app", "staging.bsky.dev", "atproto.com", "atproto.blue", "atproto.plus", "brid.gy", "mastodon.social", "mastodon.online", "mastodon.cloud", "mastodon.green", "mastodon.world", "mastodon.jp", "mstdn.jp", "mstdn.social", "mastodon.uno", "mas.to", "pawoo.net", "fedibird.com", "otadon.com", "friends.nico", "joinmastodon.org", "activitypub.rocks", "activitypub.academy", "joinfediverse.wiki", "hachyderm.io", "techhub.social", "infosec.exchange", "journa.host", "mathstodon.xyz", "universeodon.com", "fosstodon.org", "bsd.network", "hostux.social", "dice.camp", "misskey.io", "misskey.id", "misskey.design", "misskey.art", "misskey.cloud", "misskey.dev", "misskey.gg", "misskey.niri.la", "misskey.pm", "misskey.systems", "misskey-square.net", "nijimiss.moe", "sushi.ski", "yufan.me", "firefish.social", "firefish.city", "firefish.nz", "calckey.jp", "calckey.world", "lemmy.world", "lemmy.ml", "lemmy.zip", "beehaw.org", "sh.itjust.works", "programming.dev", "kbin.social", "mbin.social", "fedia.io", "pleroma.social", "pleroma.envs.net", "akkoma.dev", "social.seattle.wa.us", "mk.absturztau.be", "joinpeertube.org", "peertube.tv", "tilvids.com", "diode.zone", "pixelfed.social", "pixelfed.de", "pixelfed.uno", "writefreely.org", "write.as", "mobilizon.org", "friendi.ca", "hubzilla.org", "primal.net", "damus.io", "snort.social", "nostr.band", "iris.to", "nostr.com" ], "去中心化平台"), RULES_TIKTOK = [ ...ruleKeyword([ "tiktok", "musical" ], "TikTok"), ...ruleSuffix([ "tiktok.com", "tiktokcdn.com", "tiktokv.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "tiktokrow-cdn.com", "tiktokv.us", "ibyteimg.com", "ibytedtos.com", "byteoversea.com", "muscdn.com", "musical.ly", "tiktokd.org" ], "TikTok") ], RULES_JP_KR_ECOSYSTEM = [ ...ruleSuffix([ "line.me", "line-apps.com", "line-scdn.net", "naver.com", "naver.net", "naver.jp", "linecorp.com", "band.us", "weverse.io", "weverseapi.io", "weverseassets.io", "ameba.jp", "note.com", "tapple.me", "pixiv.net", "pximg.net", "fc2.com", "fc2blog.net", "livedoor.com", "hatena.ne.jp", "goo.ne.jp", "abema.tv", "tver.jp", "ntv.co.jp", 
  // 社交补充规则
  "tbs.co.jp", "nhk.or.jp", "dmm.com", "fanbox.cc", "kakao.com", "kakao.co.kr", "kakaocdn.net", "daum.net", "dcinside.com", "afreecatv.com", "sooplive.co.kr", "coupang.com", "coupangcdn.com", "nexon.com", "nexon.co.jp" ], "日韩生态区") ], RULES_NICONICO = [ ...ruleProcess([ "jp.nicovideo.android", "jp.nicovideo.nicobox", "jp.co.dwango.nicocas" ], "Niconico"), ...ruleSuffix([ "nicovideo.jp", "nimg.jp", "nicofarre.com", "smilevideo.jp", "dmc.nico" ], "Niconico") ], RULES_SOCIAL_FEED_SUPPLEMENT = [ ...ruleDomain([ "connect.facebook.net", "graph.facebook.com" ], "Meta") ], RULES_PRIVACY = [ ...ruleDomain([ "api.ipify.org", "icanhazip.com", "ipleak.net", "browserleaks.com", "whoer.net" ], "隐私保护"), 
  // 个人媒体规则：Emby / Jellyfin / Plex 等私有媒体服
  ...ruleSuffix([ "ipleak.net", "browserleaks.com", "whoer.net", "ipinfo.io", "ipapi.co", "ipify.org", "dnsleaktest.com", "hotjar.com", "fullstory.com", "clarity.ms", "mouseflow.com", "heapanalytics.com", "crazyegg.com", "inspectlet.com", "logrocket.com", "smartlook.com", "luckyorange.com", "contentsquare.net", 
  // 新闻资讯规则
  "signal.org", "signal.art", "signal.tube" ], "隐私保护"), ...ruleKeyword([ "fingerprint", "browserleaks", "ipleak", "dnsleak", "hotjar", "fullstory", "clarity", "mouseflow", "heapanalytics", "crazyegg", "inspectlet", "logrocket", "smartlook", "luckyorange", "contentsquare", "fingerprintjs", "fpjs.io", "cdn.fpjs.io", "metrics.hotjar.io", "rs.fullstory.com", "edge.fullstory.com" ], "隐私保护") ], RULES_PERSONAL_MEDIA = [ ...ruleSuffix([ "emby.media", "jellyfin.org", "plex.tv", "plex.direct" ], "个人媒体"), "PROCESS-NAME-REGEX,(?i).*(emby|jellyfin|plex).*,个人媒体" ], RULES_NEWS = [ ...ruleSuffix([ "bbc.com", "bbc.co.uk", "bbci.co.uk", "nytimes.com", "nyt.com", "reuters.com", "bloomberg.com", "cnn.com", "wsj.com", "ft.com", "theguardian.com", "apnews.com", "npr.org", "economist.com", 
  // 不要写入 198.18.0.0/15，那是 fake-ip 保留段，强行直连会破坏 DNS 接管。
  "nhk.or.jp", "voachinese.com", "rfi.fr", "dw.com", "aljazeera.com", "scmp.com", "time.com", "washingtonpost.com", "latimes.com", "abcnews.go.com", "nbcnews.com", "cbsnews.com", "foxnews.com" ], "新闻资讯") ], RULES_LAN_PRIVATE = [ "GEOSITE,private,DIRECT", 
  // 协作办公 / 云生产力
  "GEOIP,private,DIRECT,no-resolve", ...ruleIpCidr([ "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.168.0.0/16", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4", "::1/128", "fc00::/7", "fe80::/10", "ff00::/8" ], "DIRECT") ], RULES_COLLABORATION = [ 
  // 开发者生态 / 包管理 / 容器镜像
  ...ruleSuffix([ "zoom.us", "zoom.com", "zoomgov.com", "slack.com", "slack-edge.com", "slack-msgs.com", "notion.so", "notion.site", "notion.com", "dropbox.com", "dropboxapi.com", "dropboxusercontent.com", "box.com", "boxcloud.com", "figma.com", "figma-gov.com", "canva.com", "atlassian.com", "atlassian.net", "jira.com", "trello.com", "asana.com", "monday.com", "miro.com", "airtable.com", "linear.app", "clickup.com" ], "GitHub") ], RULES_DEVELOPER = [ ...ruleSuffix([ 
  // 扩展社交 / 知识社区
  "stackoverflow.com", "stackexchange.com", "serverfault.com", "superuser.com", "askubuntu.com", "docker.com", "docker.io", "dockerstatic.com", "pypi.org", "pythonhosted.org", "files.pythonhosted.org", "crates.io", "static.crates.io", "static.rust-lang.org", "golang.org", "proxy.golang.org", "pkg.go.dev", "sum.golang.org", "maven.org", "repo1.maven.org", "repo.maven.apache.org", "gradle.org", "services.gradle.org", "registry.npmjs.org", "rubygems.org", "packagist.org", "nuget.org", "cdn.nuget.org", "gcr.io", "quay.io", "k8s.io", "kubernetes.io", "hashicorp.com", "terraform.io", "vagrantup.com" ], "GitHub") ], RULES_SOCIAL_EXTRA = [ ...ruleSuffix([ "linkedin.com", "licdn.com", "pinterest.com", "pinimg.com", "snapchat.com", "sc-cdn.net", "medium.com", "v2ex.com", "quora.com", "quoracdn.net" ], "社交信息流"), ...ruleSuffix([ "wikipedia.org", "wikimedia.org", "wikidata.org", "wiktionary.org", "wikiquote.org" ], "新闻资讯") ], RULES_PAYMENT = [ ...ruleSuffix([ "paypal.com", "stripe.com", "wise.com", "revolut.com", "payoneer.com", "worldpay.com", "skrill.com", "neteller.com", "authy.com", "adyen.com", "transferwise.com", "checkout.com", "braintreegateway.com", "braintreepayments.com", "venmo.com", "xoom.com", "airwallex.com" ], "支付服务") ], RULES_INTERACTIVE_API = ruleSuffix(d(
  // 抖音 / 今日头条
  "douyin.com", "iesdouyin.com", "iesdouyin.net", "snssdk.com", "amemv.com", "amemv.cn", "amemv.net", "open-douyin.com", "toutiao.com", "toutiao.cn", 
  // 快手
  "kuaishou.com", "kuaishou.cn", "gifshow.com", "kwaipro.com", "ksapisrv.com", 
  // 小红书
  "xiaohongshu.com", "rednote.com", "xhslink.com", 
  // 微博
  "weibo.com", "weibo.cn", "weibo.com.cn", "api.weibo.cn", 
  // B站
  "bilibili.com", "bilibili.cn", "biliapi.com", "biliapi.net", "b23.tv", 
  // 知乎 / 豆瓣 / NGA / 虎扑
  "zhihu.com", "zhihu.org", "douban.com", "nga.cn", "ngabbs.com", "nga.178.com", "hupu.com", "hupu.hk", 
  // 百度贴吧
  "tieba.baidu.com", "tieba.com", "jump.bdimg.com", 
  // QQ空间（精准后缀，不影响微信/邮箱）
  "qzone.qq.com", 
  // 音乐评论（网易云/QQ音乐/酷狗/酷我）
  "music.163.com", "y.qq.com", "kugou.com", "kuwo.cn", 
  // 电商评价（淘宝/天猫/京东/拼多多/得物/什么值得买/汽车之家/懂车帝）
  "taobao.com", "tmall.com", "jd.com", "pinduoduo.com", "yangkeduo.com", "dewu.com", "smzdm.com", "autohome.com.cn", "dongchedi.com", "dongchedi.com.cn", 
  // 直播弹幕（虎牙/斗鱼/YY）
  "huya.com", "douyu.com", "yy.com", 
  // 社交/职场（脉脉/陌陌/探探）
  "maimai.cn", "immomo.com", "tantanapp.com", 
  // 小说/创作（晋江/起点/阅文/红袖/番茄）
  "jjwxc.net", "qidian.com", "yuewen.com", "hongxiu.com", "fanqienovel.com"), "IP属地"), RULE_SET_MAP = {
    LAN_PRIVATE: RULES_LAN_PRIVATE,
    QUIC_CONTROL: [ 
    // 国内域名的 QUIC 必须先于 geolocation-!cn 判定。
    // geolocation-!cn 的语义是“不在 cn 分类里的全部域名”，含 geosite 未收录的未知域名，
    // 抖音 CDN（douyinvod/zjcdn/pstatp 等）一旦落入其中就会被截去代理，导致卡顿。
    "AND,((NETWORK,UDP),(DST-PORT,443),(GEOSITE,cn)),DIRECT", "AND,((NETWORK,UDP),(DST-PORT,443),(GEOSITE,geolocation-!cn)),QUIC控制" ],
    YOUTUBE: RULES_YOUTUBE,
    TRANSLATION: RULES_TRANSLATION,
    RISK_SECURITY: RULES_RISK_SECURITY,
    RISK_CONTROL: RULES_RISK_CONTROL,
    APP_PROCESS: RULES_APP_PROCESS,
    CDN_DIRECT: [ 
    // B++ 国内CDN白名单：全量恢复自 v61 清单（防被 geolocation-!cn 截去代理 / 防被去广告误杀）
    ...ruleSuffix([ 
    // ── 腾讯系 CDN ──
    "gtimg.com", "gtimg.cn", "qpic.cn", "qqvideo.tc.qq.com", "qlogo.cn", "idqqimg.com", "myqcloud.com", "weiyun.com", "cdn-go.cn", "wetranstv.com", 
    // ── 阿里系 CDN ──
    "alicdn.com", "aliyuncs.com", "alipayobjects.com", "aliimg.com", "alikunlun.com", "alikunlun.net", "cdngslb.com", "alibabausercontent.com", "aliyundrive.com", 
    // ── 优酷 / 京东 / 淘宝 CDN ──
    "youkuimg.com", "jdstatic.com", "360buyimg.com", "taobaocdn.com", 
    // ── 抖音 / 字节 CDN ──
    "douyincdn.com", "douyinpic.com", "douyinstatic.com", "douyinvod.com", "idouyinvod.com", "idouyinpic.com", "idouyinstatic.com", "douyinliving.com", "idouyinliving.com", "bytecdn.cn", "byteimg.com", "zjcdn.com", "bytegoofy.com", "bytednsdoc.com", "pstatp.com", "ixiguavideo.com", "ixiguaav.com", "bytetos.com", "volccdn.com", "jinritemai.com", 
    // ── 快手 CDN ──
    "yximgs.com", "kwimgs.com", "kwaicdn.com", "kastatic.com", "ks-cdn.com", "ksyuncdn.com", "kwai-video.com", "kwai-live.com", "kwai-player.com", 
    // ── B站 CDN ──
    "biliimg.com", "bilibili.co", "bilivideo.com", "bilivideo.cn", "bilivideo.net", "bilicdn1.com", "bilicdn2.com", "bilicdn3.com", "bilicdn4.com", "bilicdn5.com", "hdslb.com", "maoercdn.com", "mincdn.com", "acgvideo.com", 
    // ── 小红书 CDN ──
    "xhscdn.com", "xhscdn.net", "xhsglobal.com", "xhsrcdn.com", "rednotecdn.com", 
    // ── 微博 CDN ──
    "weibocdn.com", "sinaimg.cn", "sinajs.cn", "sinacdn.com", "sinaedge.com", 
    // ── 知乎 CDN ──
    "zhimg.com", 
    // ── 火山 CDN ──
    "huoshancdn.com", "huoshanimg.com", "huoshanlive.com", "huoshanstatic.com", "huoshanvideo.cn", "huoshanvideo.net", "huoshanvod.com", "huoshanzhibo.cn", "huoshanzhibo.com", "ihuoshanimg.com", "ihuoshanlive.com", "ihuoshanstatic.com", "ihuoshanvod.com", 
    // ── 爱奇艺 / 芒果 CDN ──
    "iqiyipic.com", "ppsvod.com", "cmvideo.cn", 
    // ── 百度 CDN ──
    "bdimg.com", "bdstatic.com", "bcebos.com", "baidubce.com", "bdydstatic.com", "baidutv.com", 
    // ── 网易 CDN ──
    "nos.netease.com", "ydstatic.com", "music.126.net", 
    // ── 360 / 小米 / 美团 / 搜狐 CDN ──
    "qhimg.com", "qhres.com", "qhres2.com", "qhmsg.com", "360.cn", "360safe.com", "mi-img.com", "mifile.cn", "xiaomicdn.com", "meituan.net", "dpfile.com", "sohucs.com", "itc.cn", "ctcdn.cn", "v-56.com", 
    // ── 通用 CDN 运营商 ──
    "wangsu.com", "chinanetcenter.com", "qiniu.com", "qiniucdn.com", "upaiyun.com", "upyun.com", "bsclink.cn", "bootcdn.cn", "bootcdn.net", "bootcss.com", 
    // ── v61补充 ──
    "zijieapi.com", "bdxiguaimg.com", "ibytedtos.com", "ibyteimg.com", "toutiaoimg.com", "toutiaocdn.com", "xiguavideo.com", 
    // ── 微信/QQ/支付 防风控（改IP时也保持直连）──
    "qq.com", "qpic.cn", "qlogo.cn", "tenpay.com", "wechat.com", "servicewechat.com", "weixinbridge.com" ], "DIRECT") ],
    INTERACTIVE_API: RULES_INTERACTIVE_API,
    ADBLOCK: RULES_ADBLOCK,
    TRACKER: RULES_TRACKER,
    PRIVACY: RULES_PRIVACY,
    PAYMENT: RULES_PAYMENT,
    PERSONAL_MEDIA: RULES_PERSONAL_MEDIA,
    NEWS: RULES_NEWS,
    AI_TIKTOK_EXTRA: RULES_AI_TIKTOK_EXTRA,
    APPLE_MEDIA: RULES_APPLE_MEDIA,
    APPLE: RULES_APPLE,
    AI_GLOBAL: RULES_AI_GLOBAL,
    DECENTRALIZED_AND_CLOUDFLARE: RULES_DECENTRALIZED_AND_CLOUDFLARE,
    DOWNLOAD: RULES_DOWNLOAD,
    GLOBAL_GAMING: RULES_GLOBAL_GAMING,
    COLLABORATION: RULES_COLLABORATION,
    DEVELOPER: RULES_DEVELOPER,
    GITHUB: RULES_GITHUB,
    MICROSOFT: RULES_MICROSOFT,
    MICROSOFT_BING: RULES_MICROSOFT_BING,
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
    SOCIAL_EXTRA: RULES_SOCIAL_EXTRA,
    // 局域网 / 私有地址永远最先，避免内网被后续业务或 GEOIP 误伤。
    DECENTRALIZED_SUPPLEMENT: RULES_DECENTRALIZED_SUPPLEMENT,
    // 登录/支付风控必须先于其父域业务规则，避免 accounts.youtube.com 等子域被提前吞掉。
    TIKTOK: RULES_TIKTOK,
    // 专项业务优先：视频、翻译与 Google Play 精确链路。
    JP_KR_ECOSYSTEM: RULES_JP_KR_ECOSYSTEM,
    NICONICO: RULES_NICONICO,
    SOCIAL_FEED_SUPPLEMENT: RULES_SOCIAL_FEED_SUPPLEMENT,
    // 外部风控规则集兜底（echs-top safe）：放在所有手写业务规则之后，
    // 只补手写未覆盖的金融/支付/加密域名，避免抢走 Twitter、Reddit、支付等专项组。
    RISK_CONTROL_RULESET: [ "RULE-SET,safe,风控安全" ],
    // 进程兜底必须位于精确域名之后，避免 GMS/下载器吞掉专项流量。
    DIRECT_AND_FALLBACK: [ "RULE-SET,cn-direct,DIRECT", // 外部国内域名兜底（geosite cn，~11万域名）
    "RULE-SET,cn-cidr,DIRECT,no-resolve", // 外部国内IP段兜底（geoip cn）
    "GEOSITE,CN,DIRECT", // 内置兜底（mrs下载失败时降级）
    "GEOIP,CN,DIRECT,no-resolve", // 内置兜底
    "RULE-SET,gfw,受限网站", // 被GFW封锁域名优先走受限网站组(须在 geolocation-!cn 之前,否则被它吞)
    "GEOSITE,geolocation-!cn,节点选择,no-resolve", // 非中国域名走节点选择
    "GEOIP,!CN,漏网之鱼,no-resolve", // 非中国IP走漏网之鱼
    "MATCH,漏网之鱼" ]
  }, RULE_ASSEMBLY_ORDER = [ "LAN_PRIVATE", "INTERACTIVE_API", "QUIC_CONTROL", "RISK_SECURITY", "YOUTUBE", "TRANSLATION", 
  // 补丁型专项规则
  "RISK_CONTROL", "APP_PROCESS", "CDN_DIRECT", "ADBLOCK", "TRACKER", "PRIVACY", "PAYMENT", "PERSONAL_MEDIA", "NEWS", "AI_TIKTOK_EXTRA", "APPLE_MEDIA", "APPLE", "AI_GLOBAL", "DECENTRALIZED_AND_CLOUDFLARE", "DOWNLOAD", "GLOBAL_GAMING", "COLLABORATION", "DEVELOPER", "GITHUB", "MICROSOFT", "MICROSOFT_BING", "STREAMING", "TAIWAN_MEDIA", "TWITCH", "META", "SPOTIFY", "TELEGRAM", "GOOGLE", "TWITTER", "DISCORD", "SOCIAL_FEED", 
  // 规则装配
  "SOCIAL_EXTRA", "DECENTRALIZED_SUPPLEMENT", "TIKTOK", "JP_KR_ECOSYSTEM", "NICONICO", "SOCIAL_FEED_SUPPLEMENT", "RISK_CONTROL_RULESET", "DIRECT_AND_FALLBACK" ], assembledRules = function(defs, order) {
    const ruleSetMap = function(defs) {
      const map = Object.create(null);
      for (let i = 0; i < defs.length; i++) {
        const def = defs[i];
        def && def.name && (
        // 按顺序收集规则
        map[def.name] = def.rules);
      }
      return map;
    }(defs), collected = [];
    for (let i = 0; i < order.length; i++) {
      const rules = asArray(ruleSetMap[order[i]]);
      // 最终分组去重：过滤空项，并以组名为键去重，同名组保留首次定义。
            for (let j = 0; j < rules.length; j++) collected.push(rules[j]);
    }
    return collected;
  }(RULE_ASSEMBLY_ORDER.map(name => ({
    name: name,
    rules: RULE_SET_MAP[name]
  })), RULE_ASSEMBLY_ORDER);
  if (config.rules = function(...ruleSets) {
    const merged = [], seenRuleIndexes = new Map;
    let hasNullHole = !1;
    // 优化：内联 identity key 计算，避免 parseRuleParts/extractRuleMatchValue/extractRulePolicyTarget 三重调用
        for (let i = 0; i < ruleSets.length; i++) {
      const ruleSet = asArray(ruleSets[i]);
      for (let j = 0; j < ruleSet.length; j++) {
        const rule = ruleSet[j];
        if (!rule) continue;
        let identityKey;
        if ("string" == typeof rule) {
          const parts = rule.split(",");
          if (parts.length >= 2) {
            const ruleType = parts[0].trim().toUpperCase(), ruleValue = parts[1].trim();
            identityKey = ruleType && ruleValue ? ruleType + "@@" + ruleValue + "@@" + (parts.length > 3 ? parts.slice(3).join(",") : "") : "RAW@@" + rule;
          } else identityKey = "RAW@@" + rule;
        } else identityKey = getRuleIdentityKey(rule) || "RAW@@" + rule;
        if (seenRuleIndexes.has(identityKey)) {
          const prevIndex = seenRuleIndexes.get(identityKey);
          "number" == typeof prevIndex && prevIndex >= 0 && prevIndex < merged.length && (merged[prevIndex] = null, 
          hasNullHole = !0);
        }
        seenRuleIndexes.set(identityKey, merged.length), merged.push(rule);
      }
    }
    if (!hasNullHole) return merged;
    const finalized = [];
    for (let i = 0; i < merged.length; i++) 
    // 规则映射表
    merged[i] && finalized.push(merged[i]);
    return finalized;
  }(assembledRules), !config.rules.length || !config.rules.some(rule => "string" == typeof rule && /^MATCH\s*,/i.test(rule))) throw new Error("rules health check failed: missing fallback MATCH rule");
  const _emojiRenameCache = new Map;
  function cachedEmojiRename(name) {
    if (!name) return name;
    let cached = _emojiRenameCache.get(name);
    return void 0 === cached && (cached = applyEmojiRename(name), _emojiRenameCache.set(name, cached)), 
    cached;
  }
  config.rules = config.rules.map(rule => {
    if ("string" != typeof rule) return rule;
    const parts = rule.split(",");
    if (parts.length < 2) return rule;
    if (2 === parts.length) return parts[1] = cachedEmojiRename(parts[1].trim()), parts.join(",");
    for (let i = parts.length - 1; i >= 2; i--) {
      // 规则目标校验：确保所有目标都指向有效策略组
      const value = parts[i].trim();
      if (value && !RULE_TRAILING_FLAGS.has(value.toUpperCase())) {
        parts[i] = cachedEmojiRename(value);
        break;
      }
      // 跳过有效目标和已记录的缺失目标
        }
    return parts.join(",");
  });
  const missingRuleTargets = [], seenMissingRuleTargets = new Set;
  for (let i = 0; i < config.rules.length; i++) {
    const target = extractRulePolicyTarget(config.rules[i]);
    // DNS / 分组 / 规则联动校验：只校验声明表中的业务，不猜测未注册策略组。
        target && !availableRuleTargets.has(target) && (seenMissingRuleTargets.has(target) || (seenMissingRuleTargets.add(target), 
    missingRuleTargets.push(target)));
  }
  if (missingRuleTargets.length) throw new Error("rules health check failed: missing policy target(s): " + missingRuleTargets.join(", "));
  const dnsBindingErrors = [], fallbackDomainSet = new Set(asArray(config.dns["fallback-filter"] && config.dns["fallback-filter"].domain));
  for (let i = 0; i < DNS_SERVICE_BINDINGS.length; i++) {
    const binding = DNS_SERVICE_BINDINGS[i];
    if (!binding || !binding.key) continue;
    binding.auxiliary || availableRuleTargets.has(applyEmojiRename(binding.key)) || dnsBindingErrors.push(binding.key + ": missing policy group");
    const policyDomains = asArray(binding.policyDomains);
    policyDomains.length || dnsBindingErrors.push(binding.key + ": empty DNS policy domains");
    for (let j = 0; j < policyDomains.length; j++) {
      const domain = policyDomains[j], policy = nameserverPolicy[domain];
      if (!Array.isArray(policy) || !policy.length) {
        dnsBindingErrors.push(binding.key + ": DNS policy not applied for " + domain);
        break;
      }
    }
    const fallbackDomains = asArray(binding.fallbackDomains);
    for (let j = 0; j < fallbackDomains.length; j++) if (!fallbackDomainSet.has(fallbackDomains[j])) {
      // 规则诊断：可选的深度分析（开发调试用）
      dnsBindingErrors.push(binding.key + ": fallback domain not applied for " + fallbackDomains[j]);
      break;
      // 风险关键词规则
        }
  }
  // 注：同 match value 多 target 现在按"后定义覆盖前定义"处理，只记录诊断，不再阻断
    if (dnsBindingErrors.length) throw new Error("DNS service binding check failed: " + dnsBindingErrors.join(" | "));
  // ---- V系列启动优化：rule-provider interval 错峰 + CDN 混合 ----
  // 随机抖动 0~59s 打破整齐步长的周期性并发浪峰，避免启动 EOF 风暴
    let _rpIdx = 0;
  const _nextRpInterval = () => 85500 + 15 * _rpIdx++ + Math.floor(60 * Math.random());
  config["rule-providers"] && "object" == typeof config["rule-providers"] || (config["rule-providers"] = {}), 
  // 统一注入外部规则集（从 EXTERNAL_PROVIDERS + DOMESTIC_SERVICE_MODULE）
  Object.assign(config["rule-providers"], EXTERNAL_PROVIDERS_all(_nextRpInterval, applyEmojiRename("节点选择"))), 
  Object.assign(config["rule-providers"], DOMESTIC_SERVICE_MODULE_providers(_nextRpInterval)), 
  Array.isArray(config.rules) || (config.rules = []);
  const preventDnsLeakMatchIndex = config.rules.findIndex(rule => "string" == typeof rule && /^MATCH\s*,/i.test(rule)), preventDnsLeakMatchRule = preventDnsLeakMatchIndex >= 0 ? config.rules[preventDnsLeakMatchIndex] : "", preventDnsLeakMatchOutbound = preventDnsLeakMatchRule ? preventDnsLeakMatchRule.split(",").slice(1).join(",").trim() : "", hasDnsLeakGuardRule = config.rules.some(rule => "string" == typeof rule && /^RULE-SET\s*,dns-leak-guard\s*,/i.test(rule));
  if (preventDnsLeakMatchOutbound && !hasDnsLeakGuardRule) {
    const insertIndex = preventDnsLeakMatchIndex >= 0 ? preventDnsLeakMatchIndex : config.rules.length;
    config.rules.splice(insertIndex, 0, "RULE-SET,dns-leak-guard," + preventDnsLeakMatchOutbound);
  }
  // Telegram IP 段规则插入
    if (!config.rules.some(rule => "string" == typeof rule && /^RULE-SET\s*,telegramcidr\s*,/i.test(rule))) {
    const insertIdx = config.rules.findIndex(rule => "string" == typeof rule && /^RULE-SET\s*,dns-leak-guard\s*,/i.test(rule));
    insertIdx >= 0 ? config.rules.splice(insertIdx + 1, 0, "RULE-SET,telegramcidr," + preventDnsLeakMatchOutbound) : config.rules.push("RULE-SET,telegramcidr," + preventDnsLeakMatchOutbound);
  }
  return config.dns && "object" == typeof config.dns || (config.dns = {}), config.dns.enable = !0, 
  config.dns["enhanced-mode"] = "fake-ip", config.dns["respect-rules"] = !0, 
  // 完成：性能统计与配置返回
  config.dns["use-system-hosts"] = !1, config.dns["use-hosts"] = !0, config.tun && "object" == typeof config.tun && config.tun.enable && (
  // 辅助工具
  config.tun["dns-hijack"] = buildChoiceList(config.tun["dns-hijack"], [ "any:53", "tcp://any:53" ]), 
  void 0 === config.tun["auto-detect-interface"] && (config.tun["auto-detect-interface"] = !0)), 
  Array.isArray(config["proxy-groups"]), 
  // ── DNS 与分流规则的最终一致性同步（通用，不依赖域名清单）──
  // 规则表此刻已装配完成，反向从中提取「判定为直连」的域名，补齐 nameserver-policy。
  // 根治点：解析路径不再依赖域名清单是否齐全、geosite 是否及时收录某域名。
  // 只要分流规则判定某域名走直连，它必然用国内解析器，不会被境外 DoH 引到异地/海外节点。
  // 顺序敏感：按规则表顺序扫描并取每个域名的首次命中，与内核匹配语义一致；
  // 已有显式绑定的域名不覆盖，避免影响广告拦截/风控等专用解析策略。
  function() {
    if (!config.dns || "object" != typeof config.dns || !Array.isArray(config.rules)) return;
    const domesticDns = (Array.isArray(config.dns["direct-nameserver"]) ? config.dns["direct-nameserver"] : []).filter(function(x) {
      return "string" == typeof x && x;
    });
    if (!domesticDns.length) return;
    const groups = Array.isArray(config["proxy-groups"]) ? config["proxy-groups"] : [], byName = {};
    for (const g of groups) g && g.name && (byName[g.name] = g);
    // 规则目标是否等价于直连：递归展开 select 组的首个成员（即面板默认选中项）
        function isDirect(target, guard) {
      if (!target || (guard || 0) > 6) return !1;
      if (/^DIRECT$/i.test(target)) return !0;
      const g = byName[target];
      return !!(g && "select" === g.type && Array.isArray(g.proxies) && g.proxies.length) && isDirect(String(g.proxies[0]).trim(), (guard || 0) + 1);
    }
    // 规则尾部可带 ,no-resolve 等修饰参数，取目标前先剔除，避免误判为非直连
        function ruleTarget(rest) {
      return String(rest).split(",").map(function(s) {
        return s.trim();
      }).filter(function(s) {
        return s && !/^no-resolve$/i.test(s);
      }).join(",");
    }
    const policy = config.dns["nameserver-policy"] || {}, seen = new Set;
    for (const rule of config.rules) {
      if ("string" != typeof rule) continue;
      // 注意保留捕获组区分：DOMAIN 为精确匹配，DOMAIN-SUFFIX 含全部子域
            const m = rule.match(/^(DOMAIN-SUFFIX|DOMAIN)\s*,\s*([^,]+)\s*,(.+)$/i);
      if (!m) continue;
      const raw = String(m[2]).trim().toLowerCase();
      if (!raw || seen.has(raw)) continue;
      if (seen.add(raw), !/^[a-z0-9._-]+$/.test(raw)) continue;
      if (!isDirect(ruleTarget(m[3]), 0)) continue;
      const key = "DOMAIN" === m[1].toUpperCase() ? raw : "*." + raw;
      // 已存在同键或更宽/更窄绑定时保持原样，不覆盖广告拦截、风控等专用解析策略
            policy[key] || policy[raw] || policy["*." + raw] || (policy[key] = domesticDns.slice());
    }
    config.dns["nameserver-policy"] = policy;
  }(), breakProxyGroupCycles(config["proxy-groups"] || []), config;
}

function breakProxyGroupCycles(groups) {
  const gnames = new Set(groups.map(g => g.name)), adj = {};
  for (const g of groups) adj[g.name] = (g.proxies || []).filter(p => gnames.has(p) && p !== g.name);
  const vis = {}, stk = {};
  function dfs(name) {
    if (stk[name]) return !0;
    if (vis[name]) return !1;
    stk[name] = !0;
    const neighbors = adj[name] || [];
    for (let i = neighbors.length - 1; i >= 0; i--) if (dfs(neighbors[i])) {
      // Remove this edge from the actual group
      const grp = groups.find(g => g.name === name);
      grp && (grp.proxies = grp.proxies.filter(p => p !== neighbors[i])), neighbors.splice(i, 1);
    }
    return delete stk[name], vis[name] = !0, !1;
  }
  for (const g of groups) vis[g.name] || dfs(g.name);
}

function clonePlainConfig(value) {
  if (!value || "object" != typeof value) return {};
  const config = Object.assign({}, value);
  return config.proxies = Array.isArray(value.proxies) ? value.proxies.map(proxy => proxy && "object" == typeof proxy ? Object.assign({}, proxy) : proxy) : [], 
  config["proxy-groups"] = Array.isArray(value["proxy-groups"]) ? value["proxy-groups"].map(group => group && "object" == typeof group ? Object.assign({}, group) : group) : [], 
  config.rules = Array.isArray(value.rules) ? value.rules.slice() : [], config.dns = value.dns && "object" == typeof value.dns ? Object.assign({}, value.dns) : {}, 
  config.profile = value.profile && "object" == typeof value.profile ? Object.assign({}, value.profile) : {}, 
  config.sniffer = value.sniffer && "object" == typeof value.sniffer ? Object.assign({}, value.sniffer) : {}, 
  config.hosts = value.hosts && "object" == typeof value.hosts ? Object.assign({}, value.hosts) : {}, 
  config.experimental = value.experimental && "object" == typeof value.experimental ? Object.assign({}, value.experimental) : {}, 
  config;
}

function normalizeInputConfig(input) {
  const config = input && "object" == typeof input ? input : {};
  return Array.isArray(config.proxies) || (config.proxies = []), Array.isArray(config["proxy-groups"]) || (config["proxy-groups"] = []), 
  Array.isArray(config.rules) || (config.rules = []), config.dns && "object" == typeof config.dns || (config.dns = {}), 
  config.profile && "object" == typeof config.profile || (config.profile = {}), config.sniffer && "object" == typeof config.sniffer || (config.sniffer = {}), 
  config.hosts && "object" == typeof config.hosts || (config.hosts = {}), config.experimental && "object" == typeof config.experimental || (config.experimental = {}), 
  config;
}

function validateOutputConfig(config) {
  if (!config || "object" != typeof config) throw new Error("output config is not an object");
  if (!Array.isArray(config.proxies)) throw new Error("output proxies is not an array");
  if (!Array.isArray(config["proxy-groups"])) throw new Error("output proxy-groups is not an array");
  if (!Array.isArray(config.rules)) throw new Error("output rules is not an array");
  if (!config.dns || "object" != typeof config.dns) throw new Error("output dns is not an object");
  if (!config.rules.some(rule => "string" == typeof rule && /^MATCH\s*,/i.test(rule))) throw new Error("output rules missing MATCH fallback");
  if (!0 !== config.ipv6) throw new Error("output ipv6 must be true");
  if (!0 !== config.dns.ipv6) throw new Error("output dns ipv6 must be true");
  if ("fake-ip" !== config.dns["enhanced-mode"]) throw new Error("output dns enhanced-mode must be fake-ip");
  if (!0 !== config.dns["respect-rules"]) throw new Error("output dns respect-rules must be true");
  if (!1 !== config.dns["use-system-hosts"]) throw new Error("output dns use-system-hosts must be false");
  if (!Array.isArray(config.dns.nameserver) || !config.dns.nameserver.length) throw new Error("output dns nameserver is empty");
  if (!config["rule-providers"] || !config["rule-providers"]["dns-leak-guard"]) throw new Error("output missing dns-leak-guard rule-provider");
  if (!config.rules.some(rule => "string" == typeof rule && /^RULE-SET\s*,dns-leak-guard\s*,/i.test(rule))) throw new Error("output rules missing dns-leak-guard guard");
  return config;
}

function main(config) {
  const workingConfig = normalizeInputConfig(clonePlainConfig(config && "object" == typeof config ? config : {}));
  return validateOutputConfig(normalizeInputConfig(buildConfig(workingConfig)));
}