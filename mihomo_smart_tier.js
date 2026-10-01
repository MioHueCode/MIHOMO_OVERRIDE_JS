// mihomo_smart_tier.js
// 节点不走 proxy-providers，全部写入 proxies，组用显式节点列表引用
// 结构: main() 增强逻辑 + originalMain() 原版

function main(config) {
  var result = originalMain(config);
  var groups = result["proxy-groups"];

  // ── 1. 移除原版 provider「节点」，避免与显式列表混用 ──
  delete result["proxy-providers"]["节点"];

  // ── 2. 移除原版带 filter 的智能/轮询组 ──
  var LEGACY = [
    "智能选择","香港|智能选择","台湾|智能选择","新加坡|智能选择","日本|智能选择",
    "美国|智能选择","德国|智能选择","英国|智能选择","荷兰|智能选择",
    "香港|轮询下载","新加坡|轮询下载","日本|轮询下载","美国|轮询下载","最低延迟"
  ];
  groups = groups.filter(function(g){ return LEGACY.indexOf(g.name) < 0; });

  // ── 3/4. 过滤排除词，节点写入 result.proxies（同名只保留第一个）──
  var EXCLUDE = /套餐|剩余|流量|到期|重置|频道|订阅|官网|禁止|客户端|有效|联系|测试|节点|日期|群组|加入|通知|维护|网址|地址|下载|更新|APP|登录|严禁|恢复|处理|谢谢/i;
  var raw = Array.isArray(config.proxies) ? config.proxies : [];
  var nodes = [], existing = {};
  for (var e = 0; e < result["proxies"].length; e++) existing[result["proxies"][e].name] = true;
  for (var i = 0; i < raw.length; i++) {
    var p = raw[i];
    if (!p || !p.name || EXCLUDE.test(p.name) || existing[p.name]) continue;
    existing[p.name] = true;
    nodes.push(p.name);
    result["proxies"].push(p);
  }

  // ── 5. 常量与分类函数 ──
  var ICON = "https://mihomo.echs.top/img/Hand-Painted-icon/";
  function anchor(hidden) {
    return {
      type: "smart", strategy: "sticky-sessions", uselightgbm: true,
      collectdata: false, "sample-rate": "1", "prefer-asn": false,
      "policy-priority": "", "type-priority": "",
      "include-all-providers": false, "empty-fallback": "REJECT", hidden: hidden
    };
  }

  var TIERS = [
    { prefix: "[高级]", label: "高级", emoji: "⭐" },
    { prefix: "[实验]", label: "实验", emoji: "🧪" },
    { prefix: "[基础]", label: "基础", emoji: "📦" }
  ];

  var REGIONS = [
    { name: "香港", flag: "🇭🇰", icon: ICON + "Rounded_Rectangle/Hong_Kong.png", kw: ["香港","hongkong","hk","sakura"] },
    { name: "台湾", flag: "🇹🇼", icon: ICON + "Rounded_Rectangle/Taiwan.png", kw: ["台湾","台北","台中","高雄","taiwan","tw","hinet"] },
    { name: "日本", flag: "🇯🇵", icon: ICON + "Rounded_Rectangle/Japan.png", kw: ["日本","东京","大阪","japan","jp","zouter","bbtec"] },
    { name: "新加坡", flag: "🇸🇬", icon: ICON + "Rounded_Rectangle/Singapore.png", kw: ["新加坡","狮城","singapore","sg"] },
    { name: "美国", flag: "🇺🇸", icon: ICON + "Rounded_Rectangle/United_States.png", kw: ["美国","usa","unitedstates","洛杉矶","纽约","硅谷"] },
    { name: "欧洲", flag: "🇪🇺", icon: ICON + "Rounded_Rectangle/European_Union.png", kw: ["德国","英国","荷兰","法国","意大利","西班牙","葡萄牙","瑞士","瑞典","芬兰","挪威","丹麦","比利时","奥地利","爱尔兰","波兰","捷克","俄罗斯","乌克兰","土耳其","germany","frankfurt","法兰克福","unitedkingdom","netherlands","france","italy","spain","london","伦敦","paris","巴黎","berlin","柏林","russia","莫斯科","moscow","de","uk","gb","nl","fr"] },
    { name: "其它", flag: "🌍", icon: ICON + "Universal/StreamingSE.png", kw: [] }
  ];
  var REGION_ORDER = ["香港","台湾","日本","新加坡","美国","欧洲","其它"];

   var ENTRIES = [
     { label: "Sakura HK", key: ["sakura"] },
     { label: "GCP SG", key: ["gcp sg","gcpsingapore"] },
     { label: "AWS SG", key: ["aws sg","awssingapore"] },
     { label: "HiNet TW", key: ["hinet"] },
     { label: "Stealth (Special)", key: ["stealth"] },
     { label: "(IPv6) Zouter JP", key: ["ipv6","zouter"] },
     { label: "GCP JP 01", key: ["gcp jp 01","gcp jp01"] },
     { label: "GCP JP 02", key: ["gcp jp 02","gcp jp02"] },
     { label: "Zouter JP", key: ["zouter"] },
     { label: "AWS JP", key: ["aws jp","awsjapan"] },
     { label: "BBTEC JP", key: ["bbtec"] },
     { label: "Frankfurt", key: ["frankfurt","法兰克福"] }
   ];

var SUF = ENTRIES.map(function(e){ return " - " + e.label; }).sort(function(a,b){ return b.length - a.length; });
   function strip(name) {
     var s = String(name || "");
     // 先去掉所有 emoji（Unicode 范围）
     s = s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2000-\u3300]|[\uE000-\uF900]/g, '').replace(/\s+/g, ' ').trim();
     var changed = true;
     while (changed) {
       changed = false;
       for (var k = 0; k < SUF.length; k++) {
         if (s.slice(-SUF[k].length) === SUF[k]) { s = s.slice(0, -SUF[k].length).trim(); changed = true; }
       }
     }
     return s;
   }
   function lc(s) { return String(s || "").toLowerCase(); }
   function has(sub, keys) { var t = lc(sub); for (var k = 0; k < keys.length; k++) { if (t.indexOf(keys[k]) >= 0) return true; } return false; }
   function matchTier(name) { for (var t = 0; t < TIERS.length; t++) { if (name.indexOf(TIERS[t].prefix) >= 0) return TIERS[t]; } return null; }
   function matchRegion(name) { var c = strip(name); for (var r = 0; r < REGIONS.length; r++) { if (REGIONS[r].name === "其它") continue; if (has(c, REGIONS[r].kw)) return REGIONS[r].name; } return "其它"; }
   function matchEntry(name) { 
     var t = lc(name); 
     // 优先查找最长/最精确的match
     var best = null, bestLen = 0;
     for (var e2 = 0; e2 < ENTRIES.length; e2++) { 
       var entry = ENTRIES[e2];
       // 特殊处理：(IPv6) Zouter JP 需要同时包含 ipv6 和 zouter
       if (entry.label === "(IPv6) Zouter JP") {
         if (t.indexOf("ipv6") >= 0 && t.indexOf("zouter") >= 0) {
           best = entry;
           bestLen = 999; // 最高优先级
         }
       } else {
         for (var k2 = 0; k2 < entry.key.length; k2++) {
           if (t.indexOf(entry.key[k2]) >= 0 && entry.key[k2].length > bestLen) {
             best = entry;
             bestLen = entry.key[k2].length;
           }
         }
       }
     }
     return best;
   }

  // ── 6. 分类统计 ──
  var tierProxies = {}, tierCount = {}, regionProxies = {}, regionCount = {},
      tierRegionProxies = {}, entryProxies = {}, entryCount = {}, known = {};
  for (var v = 0; v < nodes.length; v++) {
    var nm = nodes[v];
    known[nm] = true;
    var tier = matchTier(nm), reg = matchRegion(nm), ent = matchEntry(nm);
    regionCount[reg] = (regionCount[reg] || 0) + 1;
    (regionProxies[reg] = regionProxies[reg] || []).push(nm);
    if (tier) {
      tierCount[tier.label] = (tierCount[tier.label] || 0) + 1;
      (tierProxies[tier.label] = tierProxies[tier.label] || []).push(nm);
      if (!tierRegionProxies[tier.label]) tierRegionProxies[tier.label] = {};
      (tierRegionProxies[tier.label][reg] = tierRegionProxies[tier.label][reg] || []).push(nm);
    }
    if (ent) {
      entryCount[ent.label] = (entryCount[ent.label] || 0) + 1;
      (entryProxies[ent.label] = entryProxies[ent.label] || []).push(nm);
    }
  }
  var REGION_MAP = {};
  for (var rm = 0; rm < REGIONS.length; rm++) REGION_MAP[REGIONS[rm].name] = REGIONS[rm];

  // ── 7. 构建新增分组 ──
  var newGroups = [], visible = [];

  // 7A 地区组（smart 可见）
  for (var r1 = 0; r1 < REGION_ORDER.length; r1++) {
    var rn = REGION_ORDER[r1];
    if (!regionCount[rn]) continue;
    var rd = REGION_MAP[rn], gn = rd.flag + rn + "智能";
    newGroups.push(Object.assign(anchor(false), { name: gn, proxies: regionProxies[rn], icon: rd.icon }));
    visible.push(gn);
  }

  // 7B 分级组（总 smart 隐藏 + 地区小 smart 隐藏 + select 可见）
  for (var t1 = 0; t1 < TIERS.length; t1++) {
    var t = TIERS[t1], tl = t.label;
    if (!tierCount[tl]) continue;
    var sn = t.emoji + tl + "智能", ch = [sn];
    newGroups.push(Object.assign(anchor(true), { name: sn, proxies: tierProxies[tl], icon: ICON + "Universal/Auto_Speed.png" }));
    var trp = tierRegionProxies[tl];
    for (var r3 = 0; r3 < REGION_ORDER.length; r3++) {
      var rr = REGION_ORDER[r3];
      if (!trp[rr]) continue;
      var rdx = REGION_MAP[rr], sub = t.emoji + rdx.flag + rr + tl;
      newGroups.push(Object.assign(anchor(true), { name: sub, proxies: trp[rr], icon: rdx.icon }));
      ch.push(sub);
    }
    newGroups.push({ name: t.emoji + tl, type: "select", proxies: ch, icon: ICON + "Universal/StreamingSE.png" });
    visible.push(t.emoji + tl);
  }

  // 7C 入口组（总 smart 隐藏 + 分级小 smart 隐藏 + select 可见，含具体节点）
  for (var e1 = 0; e1 < ENTRIES.length; e1++) {
    var es = ENTRIES[e1].label;
    if (!entryCount[es]) continue;
    var epAll = entryProxies[es], esn = "🚀" + es + "智能", ch2 = [esn];
    newGroups.push(Object.assign(anchor(true), { name: esn, proxies: epAll, icon: ICON + "Universal/StreamingSE.png" }));
    for (var t2 = 0; t2 < TIERS.length; t2++) {
      var t3 = TIERS[t2];
      var subAll = epAll.filter(function(x){ return x.indexOf(t3.prefix) >= 0; });
      if (!subAll.length) continue;
      var subn = "🔹" + t3.label + es;
      newGroups.push(Object.assign(anchor(true), { name: subn, proxies: subAll, icon: ICON + "Universal/StreamingSE.png" }));
      ch2.push(subn);
    }
    newGroups.push({ name: "🚀" + es, type: "select", proxies: ch2.concat(epAll), icon: ICON + "Universal/StreamingSE.png" });
    visible.push("🚀" + es);
  }

  // 7D 全局智能选择和最低延迟
  newGroups.push(Object.assign(anchor(false), { name: "智能选择", proxies: nodes.slice(), icon: ICON + "Universal/Final.png" }));
  newGroups.push({ name: "最低延迟", type: "url-test", tolerance: 30, proxies: nodes.slice(), "empty-fallback": "REJECT", icon: ICON + "Universal/Auto_Speed.png" });
  visible.push("智能选择", "最低延迟");

  groups = groups.concat(newGroups);

  // ── 8. 新组挂到业务组和 GLOBAL（客户端按 GLOBAL 列表决定组页面显示哪些组）──
  var TARGET = ["代理连接","代理DNS","TELEGRAM","国外AI","下载相关","风控安全","GOOGLE","YOUTUBE","TIKTOK","海外媒体","GLOBAL"];
  for (var g1 = 0; g1 < groups.length; g1++) {
    var gx = groups[g1];
    if (TARGET.indexOf(gx.name) < 0) continue;
    for (var v1 = 0; v1 < visible.length; v1++) {
      if (gx.proxies.indexOf(visible[v1]) < 0) gx.proxies.push(visible[v1]);
    }
  }

  // ── 9. 剔除对已删除 LEGACY 组的悬空引用 ──
  var builtin = ["DIRECT","REJECT","REJECT-DROP","PASS","PASS-RULE","COMPATIBLE","IPV4优先","IPV6优先","仅IPV4","仅IPV6"];
  var gnames = {};
  for (var b1 = 0; b1 < groups.length; b1++) gnames[groups[b1].name] = true;
  for (var c1 = 0; c1 < groups.length; c1++) {
    groups[c1].proxies = groups[c1].proxies.filter(function(ref){
      return known[ref] || gnames[ref] || builtin.indexOf(ref) >= 0;
    });
  }

  // ── 10. CN 直连：GEOSITE 跟在域名直连规则后，GEOIP 跟在 IP 直连规则后 ──
  var rules = result["rules"];
  rules.splice(rules.indexOf("RULE-SET,direct-lite,直接连接") + 1, 0, "GEOSITE,CN,直接连接");
  rules.splice(rules.indexOf("RULE-SET,direct_ip,直接连接") + 1, 0, "GEOIP,CN,直接连接");

  result["proxy-groups"] = groups;
  return result;
}

// ═══ 原版 originalMain ═══
function originalMain(config) {
  const subscriptionProxies = config.proxies || [];
  const ipAnchor = { "type": "http", "interval": 86400, "proxy": "代理连接", "behavior": "ipcidr", "format": "mrs" };
  const domainAnchor = { "type": "http", "interval": 86400, "proxy": "代理连接", "behavior": "domain", "format": "mrs" };
  const directDns = ["https://dns.alidns.com/dns-query#直接连接", "https://doh.pub/dns-query#直接连接&h3=false"];
  const proxyDns = ["https://dns.google/dns-query#代理DNS&ecs=8.8.8.8/24&ecs-override=true", "https://dns.quad9.net/dns-query#代理DNS&ecs=9.9.9.9/24&ecs-override=true"];
  const balAnchor = { "type": "load-balance", "strategy": "round-robin", "include-all-providers": true, "empty-fallback": "REJECT", "hidden": true };
  // smart参数："policy-priority": "JP:1.2;SG:1.2;US:1.2", "type-priority": "ss:1.5;vless:1.2;vmess:0.8"
  // type-priority还在提交pull中，现在还是无效参数
  const smartAnchor = { "type": "smart", "strategy": "sticky-sessions", "uselightgbm": true, "collectdata": false, "sample-rate": "1", "prefer-asn": false, "policy-priority": "", "type-priority": "", "include-all-providers": true, "empty-fallback": "REJECT", "hidden": true };
  const dlAnchor = { "type": "select", "proxies": ["代理连接", "直接连接", "最低延迟", "智能选择", "香港|智能选择", "台湾|智能选择", "新加坡|智能选择", "日本|智能选择", "美国|智能选择", "德国|智能选择", "英国|智能选择", "荷兰|智能选择", "香港|轮询下载", "新加坡|轮询下载", "日本|轮询下载", "美国|轮询下载"], "include-all-providers": true, "empty-fallback": "REJECT" };
  const originDns = config.dns || {};
  const appendDirectTag = (val) => { if (typeof val === 'string') { return val.split('#')[0] + '#直接连接'; } return val; };
  const formatDnsValues = (dnsValue) => { if (Array.isArray(dnsValue)) return dnsValue.map(appendDirectTag); return appendDirectTag(dnsValue); };
  let finalProxyServerNameserver = directDns;
  const originPsn = originDns['proxy-server-nameserver'];
  if (originPsn != null && originPsn !== '' && (!Array.isArray(originPsn) || originPsn.length > 0)) { finalProxyServerNameserver = formatDnsValues(originPsn); }
  let finalProxyServerNameserverPolicy = undefined;
  const originPolicy = originDns['proxy-server-nameserver-policy'];
  if (originPolicy && typeof originPolicy === 'object' && !Array.isArray(originPolicy) && Object.keys(originPolicy).length > 0) { finalProxyServerNameserverPolicy = {}; for (const [domain, servers] of Object.entries(originPolicy)) { finalProxyServerNameserverPolicy[domain] = formatDnsValues(servers); } }
  const originHosts = config.hosts || {};
  const defaultHosts = {
    "dns.alidns.com": ["223.5.5.5", "223.6.6.6", "2400:3200::1", "2400:3200:baba::1"],
    "doh.pub": ["120.53.53.53", "1.12.12.12"],
    "dns.google": ["8.8.8.8", "8.8.4.4", "2001:4860:4860::8888", "2001:4860:4860::8844"],
    "dns.quad9.net": ["9.9.9.9", "149.112.112.112", "2620:fe::fe", "2620:fe::9"],
    "services.googleapis.cn": "services.googleapis.com",
    "google.cn": "google.com",
    "cn.bing.com": "global.bing.com"
  };
  const finalHosts = { ...originHosts, ...defaultHosts };
  const quic = "AND,((NETWORK,udp),(DST-PORT,443)),代理QUIC";
  return { 
    // 节点IP优先级：ip-version: ipv6-prefer
    "proxy-providers": { "节点": { "type": "inline", "health-check": { "enable": true, "url": "https://dns.google/generate_204", "expected-status": 204, "interval": 600, "timeout": 3000, "max-failed-times": 2, "lazy": false }, "override": { "ip-version": "dual" }, "exclude-filter": "(?i)套餐|剩余|流量|到期|重置|频道|订阅|官网|禁止|客户端|有效|联系|测试|节点|日期|群组|加入|通知|维护|网址|地址|下载|更新|APP|登录|严禁|恢复|处理|谢谢", "payload": subscriptionProxies } },
    "ipv6": true,
    "allow-lan": false,
    "bind-address": "*",
    "mode": "rule",
    "log-level": "error",
    "unified-delay": true,
    "tcp-concurrent": true,
    "find-process-mode": "off",
    "disable-keep-alive": false,
    "keep-alive-interval": 15,
    "keep-alive-idle": 600,
    "etag-support": true,
    // "global-ua": "Mozilla/5.0 (Linux; Android 16; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7778.217 Mobile Safari/537.36",
    // "global-ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7778.257 Safari/537.36",
    // "external-controller": "[::]:9090",
    // "secret": "密码",
    // "external-doh-server": "/dns-query",
    // "external-ui": "./zashboard",
    // 霞鹜文楷：https://github.com/echs-top/proxy/releases/download/zashboard/dist.zip
    // "external-ui-url": "https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip",
    "lgbm-auto-update": true,
    "lgbm-update-interval": 72,
    "lgbm-url": "https://github.com/vernesong/mihomo/releases/download/LightGBM-Model/Model-large.bin",
    "profile": { "store-selected": true, "store-fake-ip": true, "smart-collector-size": 100 },
    "experimental": { "quic-go-disable-gso": false, "quic-go-disable-ecn": true, "dialer-ip4p-convert": false },
    "port": 0,
    "socks-port": 0,
    "mixed-port": 0,
    "redir-port": 0,
    "tproxy-port": 0,
    "tun": {
      "enable": true,
      // Android dummy9 / Windows "以太网 9" / MacOS utun9
      // "device": "dummy9",
      "stack": "mixed",
      "auto-route": true,
      "auto-redirect": true,
      "auto-detect-interface": true,
      "strict-route": true,
      "disable-icmp-forwarding": true,
      // "endpoint-independent-nat": true,
      "dns-hijack": ["any:53", "tcp://any:53"],
      "udp-timeout": 600
    },
    "hosts": finalHosts,
    "dns": {
      "enable": true,
      "ipv6": true,
      "ipv6-timeout": 300,
      "cache-algorithm": "arc",
      "use-hosts": true,
      "use-system-hosts": false,
      "prefer-h3": true,
      "respect-rules": false,
      // "listen": "[::]:1053",
      "enhanced-mode": "fake-ip",
      "fake-ip-range": "198.18.0.0/15",
      "fake-ip-range6": "fd00:a4c5:9b12:d3f8:e760:00df::/96",
      "fake-ip-ttl": 1,
      "fake-ip-filter-mode": "rule",
      "fake-ip-filter": [
        "RULE-SET,ads,fake-ip",
        "RULE-SET,proxy@direct,real-ip",
        "RULE-SET,ai,fake-ip",
        "RULE-SET,download,fake-ip",
        "RULE-SET,safe,fake-ip",
        "RULE-SET,youtube,fake-ip",
        "RULE-SET,tiktok,fake-ip",
        "RULE-SET,google,fake-ip",
        "RULE-SET,media,fake-ip",
        "RULE-SET,proxy-lite,fake-ip",
        "RULE-SET,direct-lite,real-ip",
        "MATCH,fake-ip"
      ],
      "default-nameserver": ["223.6.6.6", "119.29.29.29"],
      "proxy-server-nameserver": finalProxyServerNameserver,
      ...(finalProxyServerNameserverPolicy !== undefined && { "proxy-server-nameserver-policy": finalProxyServerNameserverPolicy }),
      "nameserver": proxyDns,
       "nameserver-policy": {
         "rule-set:ads": ["rcode://name_error"],
         "rule-set:proxy@direct": proxyDns,
         "rule-set:ai,download,safe,youtube,tiktok,google,media,proxy-lite": proxyDns,
         "rule-set:direct-lite,dnsmasq-china-lite": proxyDns
       },
       "direct-nameserver": ["rcode://success"],
       "direct-nameserver-follow-policy": true
    },
    "sniffer": {
      "enable": true,
      "force-dns-mapping": true,
      "parse-pure-ip": true,
      "override-destination": false,
      "sniff": { "HTTP": { "ports": [80, "8080-8880"], "override-destination": true }, "TLS": { "ports": [443, 8443] }, "QUIC": { "ports": [443, 8443] } },
      "skip-domain": ["rule-set:ads,proxy@direct,ai,download,safe,youtube,tiktok,google,media,proxy-lite,direct-lite,dnsmasq-china-lite"],
      "skip-src-address": ["rule-set:telegram_ip,safe_ip,google_ip,media_ip,direct_ip"]
    },
    "rule-providers": {
      "ads": { ...domainAnchor, "url": "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/ads.mrs", "path": "./rules/ads.mrs" },
      "proxy@direct": { ...domainAnchor, "url": "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/proxy@direct.mrs", "path": "./rules/proxy@direct.mrs" },
      "ai": { ...domainAnchor, "url": "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/ai.mrs", "path": "./rules/ai.mrs" },
      "download": { ...domainAnchor, "url": "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/download.mrs", "path": "./rules/download.mrs" },
      "safe": { ...domainAnchor, "url": "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/safe.mrs", "path": "./rules/safe.mrs" },
      // YouTube / TikTok 独立分流：echs 无对应规则集，用 MetaCubeX geosite
      "youtube": { ...domainAnchor, "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/youtube.mrs", "path": "./rules/youtube.mrs" },
      "tiktok": { ...domainAnchor, "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/tiktok.mrs", "path": "./rules/tiktok.mrs" },
      "google": { ...domainAnchor, "url": "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/google.mrs", "path": "./rules/google.mrs" },
      "media": { ...domainAnchor, "url": "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/media.mrs", "path": "./rules/media.mrs" },
      "proxy-lite": { ...domainAnchor, "url": "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/proxy-lite.mrs", "path": "./rules/proxy-lite.mrs" },
      "direct-lite": { ...domainAnchor, "url": "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/direct-lite.mrs", "path": "./rules/direct-lite.mrs" },
      "dnsmasq-china-lite": { ...domainAnchor, "url": "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/dnsmasq-china-lite.mrs", "path": "./rules/dnsmasq-china-lite.mrs" },
      "telegram_ip": { ...ipAnchor, "url": "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/ip/telegram.mrs", "path": "./rules/telegram_ip.mrs" },
      "safe_ip": { ...ipAnchor, "url": "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/ip/safe.mrs", "path": "./rules/safe_ip.mrs" },
      "google_ip": { ...ipAnchor, "url": "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/ip/google.mrs", "path": "./rules/google_ip.mrs" },
      "media_ip": { ...ipAnchor, "url": "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/ip/media.mrs", "path": "./rules/media_ip.mrs" },
      "direct_ip": { ...ipAnchor, "url": "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/ip/direct.mrs", "path": "./rules/direct_ip.mrs" }
    },
    "rules": [
      "DST-PORT,5228-5230,直接连接",
      "SUB-RULE,(RULE-SET,telegram_ip,no-resolve),sub-telegram",
      "RULE-SET,ads,REJECT",
      "RULE-SET,proxy@direct,直接连接",
      "SUB-RULE,(RULE-SET,ai),sub-ai",
      "SUB-RULE,(RULE-SET,download),sub-download",
      "SUB-RULE,(RULE-SET,safe),sub-safe",
      // 先于 google/media/proxy-lite：youtubei.googleapis.com 等不被 GOOGLE 吞，TikTok 不落进代理连接
      "SUB-RULE,(RULE-SET,youtube),sub-youtube",
      "SUB-RULE,(RULE-SET,tiktok),sub-tiktok",
      "SUB-RULE,(RULE-SET,google),sub-google",
      "SUB-RULE,(RULE-SET,media),sub-media",
      "SUB-RULE,(RULE-SET,proxy-lite),sub-proxy",
      "RULE-SET,direct-lite,直接连接",
      "SUB-RULE,(RULE-SET,safe_ip),sub-safe",
      "SUB-RULE,(RULE-SET,google_ip),sub-google",
      "SUB-RULE,(RULE-SET,media_ip),sub-media",
      "RULE-SET,direct_ip,直接连接",
      quic,
      "MATCH,代理连接"
    ],
    "sub-rules": {
      "sub-telegram": [quic, "MATCH,TELEGRAM"],
      "sub-ai": [quic, "MATCH,国外AI"],
      "sub-download": [quic, "MATCH,下载相关"],
      "sub-safe": [quic, "MATCH,风控安全"],
      "sub-google": [quic, "MATCH,GOOGLE"],
      "sub-youtube": [quic, "MATCH,YOUTUBE"],
      "sub-tiktok": [quic, "MATCH,TIKTOK"],
      "sub-media": [quic, "MATCH,海外媒体"],
      "sub-proxy": [quic, "MATCH,代理连接"]
    },
    "proxies": [{ "name": "IPV4优先", "type": "direct", "udp": true, "ip-version": "ipv4-prefer" },{ "name": "IPV6优先", "type": "direct", "udp": true, "ip-version": "ipv6-prefer" },{ "name": "仅IPV4", "type": "direct", "udp": true, "ip-version": "ipv4" },{ "name": "仅IPV6", "type": "direct", "udp": true, "ip-version": "ipv6" }],
    "proxy-groups": [
      { "name": "代理连接", "type": "select", "proxies": ["最低延迟", "智能选择", "香港|智能选择", "台湾|智能选择", "新加坡|智能选择", "日本|智能选择", "美国|智能选择", "德国|智能选择", "英国|智能选择", "荷兰|智能选择", "香港|轮询下载", "新加坡|轮询下载", "日本|轮询下载", "美国|轮询下载"], "include-all-providers": true, "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Universal/StreamingSE.png" },
      { "name": "直接连接", "type": "select", "proxies": ["DIRECT", "IPV4优先", "IPV6优先", "仅IPV4", "仅IPV6"], "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Accommodation/Online_Booking.png" },
      { "name": "代理DNS", ...dlAnchor, "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Universal/Streaming.png" },
      { "name": "代理QUIC", "type": "select", "proxies": ["PASS-RULE", "REJECT"], "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Google_Suite/Admin.png" },
      { "name": "TELEGRAM", ...dlAnchor, "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Social_Media/Telegram.png" },
      { "name": "国外AI", ...dlAnchor, "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Fitness/Chat.png" },
      { "name": "下载相关", ...dlAnchor, "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Google_Suite/Drive.png" },
      { "name": "风控安全", ...dlAnchor, "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Google_Suite/Account.png" },
      { "name": "GOOGLE", ...dlAnchor, "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Google_Suite/Google.png" },
      { "name": "YOUTUBE", ...dlAnchor, "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Social_Media/YouTube.png" },
      { "name": "TIKTOK", ...dlAnchor, "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Social_Media/TikTok.png" },
      { "name": "海外媒体", ...dlAnchor, "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Universal/Video.png" },
      { "name": "最低延迟", "type": "url-test", "tolerance": 30, "include-all-providers": true, "empty-fallback": "REJECT", "hidden": true, "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Universal/Auto_Speed.png" },
      { "name": "智能选择", ...smartAnchor, "filter": "(?i)🇭🇰|香港|\\bHK\\b|\\bhongkong\\b|\\bhong\s?kong\\b|🇸🇬|新加坡|狮城|\\bSG\\b|\\bsingapore\\b|🇯🇵|日本|\\bJP\\b|\\bjapan\\b|🇺🇸|美国|\\bUS\\b|\\bunitedstates\\b|\\bunited\s?states\\b", "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Universal/Final.png" },
      { "name": "香港|智能选择", ...smartAnchor, "filter": "(?i)🇭🇰|香港|\\bHK\\b|\\bhongkong\\b|\\bhong\\s?kong\\b", "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Rounded_Rectangle/Hong_Kong.png" },
      { "name": "台湾|智能选择", ...smartAnchor, "filter": "(?i)🇹🇼|台湾|\\bTW\\b|\\btaiwan\\b", "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Rounded_Rectangle/Taiwan.png" },
      { "name": "新加坡|智能选择", ...smartAnchor, "filter": "(?i)🇸🇬|新加坡|狮城|\\bSG\\b|\\bsingapore\\b", "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Rounded_Rectangle/Singapore.png" },
      { "name": "日本|智能选择", ...smartAnchor, "filter": "(?i)🇯🇵|日本|\\bJP\\b|\\bjapan\\b", "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Rounded_Rectangle/Japan.png" },
      { "name": "美国|智能选择", ...smartAnchor, "filter": "(?i)🇺🇸|美国|\\bUS\\b|\\bunitedstates\\b|\\bunited\\s?states\\b", "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Rounded_Rectangle/United_States.png" },
      { "name": "德国|智能选择", ...smartAnchor, "filter": "(?i)🇩🇪|德国|\\bDE\\b|\\bgermany\\b", "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Rounded_Rectangle/Germany.png" },
      { "name": "英国|智能选择", ...smartAnchor, "filter": "(?i)🇬🇧|英国|\\bUK\\b|\\bGB\\b|\\bunitedkingdom\\b|\\bunited\\s?kingdom\\b", "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Rounded_Rectangle/United_Kingdom.png" },
      { "name": "荷兰|智能选择", ...smartAnchor, "filter": "(?i)🇳🇱|荷兰|\\bNL\\b|\\bnetherlands?\\b", "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Rounded_Rectangle/Netherlands.png" },
      { "name": "香港|轮询下载", ...balAnchor, "filter": "(?i)🇭🇰|香港|\\bHK\\b|\\bhongkong\\b|\\bhong\\s?kong\\b", "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Rounded_Rectangle/Hong_Kong.png" },
      { "name": "新加坡|轮询下载", ...balAnchor, "filter": "(?i)🇸🇬|新加坡|狮城|\\bSG\\b|\\bsingapore\\b", "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Rounded_Rectangle/Singapore.png" },
      { "name": "日本|轮询下载", ...balAnchor, "filter": "(?i)🇯🇵|日本|\\bJP\\b|\\bjapan\\b", "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Rounded_Rectangle/Japan.png" },
      { "name": "美国|轮询下载", ...balAnchor, "filter": "(?i)🇺🇸|美国|\\bUS\\b|\\bunitedstates\\b|\\bunited\\s?states\\b", "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Rounded_Rectangle/United_States.png" },
      { "name": "GLOBAL", "type": "select", "proxies": ["最低延迟", "智能选择", "香港|智能选择", "台湾|智能选择", "新加坡|智能选择", "日本|智能选择", "美国|智能选择", "德国|智能选择", "英国|智能选择", "荷兰|智能选择", "香港|轮询下载", "新加坡|轮询下载", "日本|轮询下载", "美国|轮询下载", "代理连接", "直接连接", "代理DNS", "代理QUIC", "TELEGRAM", "国外AI", "下载相关", "风控安全", "GOOGLE", "YOUTUBE", "TIKTOK", "海外媒体"], "include-all-providers": true, "hidden": true, "icon": "https://mihomo.echs.top/img/Hand-Painted-icon/Google_Suite/Browser.png" }
    ]
  };
}
