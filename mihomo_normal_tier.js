// mihomo_normal_tier.js
// normal 版：故障转移(fallback) + url-test 自动层，不依赖 ML
// 结构: main() 增强逻辑 + originalMain() 原版（与 smart 版共用 originalMain）
function main(config) {
  config = config && "object" == typeof config ? config : {};
  var result = originalMain(config), groups = result["proxy-groups"];
  // ── 1. 移除原版 provider「节点」，避免与显式列表混用 ──
  delete result["proxy-providers"]["节点"];
  // ── 2. 移除原版带 filter 的智能/轮询组 ──
  var LEGACY = [ "智能选择", "香港|智能选择", "台湾|智能选择", "新加坡|智能选择", "日本|智能选择", "美国|智能选择", "德国|智能选择", "英国|智能选择", "荷兰|智能选择", "香港|轮询下载", "新加坡|轮询下载", "日本|轮询下载", "美国|轮询下载", "最低延迟" ];
  groups = groups.filter(function(g) {
    return LEGACY.indexOf(g.name) < 0;
  });
  // ── 3/4. 过滤排除词，节点写入 result.proxies（同名只保留第一个）──
  for (var EXCLUDE = /套餐|剩余|流量|到期|重置|频道|订阅|官网|禁止|客户端|有效|联系|测试|节点|日期|群组|加入|通知|维护|网址|地址|下载|更新|APP|登录|严禁|恢复|处理|谢谢/i, raw = Array.isArray(config.proxies) ? config.proxies : [], nodes = [], existing = {}, e = 0; e < result.proxies.length; e++) existing[result.proxies[e].name] = !0;
  for (var i = 0; i < raw.length; i++) {
    var p = raw[i];
    p && p.name && !EXCLUDE.test(p.name) && !existing[p.name] && (existing[p.name] = !0, 
    nodes.push(p.name), result.proxies.push(p));
  }
  // ── 5. 常量与分类函数 ──
  var ICON = "https://raw.githubusercontent.com/Semporia/Hand-Painted-icon/master/";
  // normal 版：隐藏层用 url-test（非 smart），tolerance 容忍抖动
  function anchor(hidden) {
    return {
      type: "url-test",
      tolerance: 30,
      url: "https://www.gstatic.com/generate_204",
      interval: 300,
      timeout: 5e3,
      "empty-fallback": "REJECT",
      "include-all-providers": !1,
      hidden: hidden
    };
  }
  var TIERS = [ {
    prefix: "[高级]",
    label: "高级",
    emoji: "⭐"
  }, {
    prefix: "[实验]",
    label: "实验",
    emoji: "🧪"
  }, {
    prefix: "[基础]",
    label: "基础",
    emoji: "📦"
  } ], REGIONS = [ {
    name: "香港",
    flag: "🇭🇰",
    icon: ICON + "Rounded_Rectangle/Hong_Kong.png",
    kw: [ "香港", "hongkong", "hk", "sakura" ]
  }, {
    name: "台湾",
    flag: "🇹🇼",
    icon: ICON + "Rounded_Rectangle/Taiwan.png",
    kw: [ "台湾", "台北", "台中", "高雄", "taiwan", "tw", "hinet" ]
  }, {
    name: "日本",
    flag: "🇯🇵",
    icon: ICON + "Rounded_Rectangle/Japan.png",
    kw: [ "日本", "东京", "大阪", "japan", "jp", "zouter", "bbtec" ]
  }, {
    name: "韩国",
    flag: "🇰🇷",
    icon: ICON + "Rounded_Rectangle/South_Korea.png",
    kw: [ "韩国", "首尔", "seoul", "korea" ]
  }, {
    name: "新加坡",
    flag: "🇸🇬",
    icon: ICON + "Rounded_Rectangle/Singapore.png",
    kw: [ "新加坡", "狮城", "singapore", "sg" ]
  }, {
    name: "美国",
    flag: "🇺🇸",
    icon: ICON + "Rounded_Rectangle/United_States.png",
    kw: [ "美国", "usa", "unitedstates", "洛杉矶", "纽约", "硅谷" ]
  }, {
    name: "欧洲",
    flag: "🇪🇺",
    icon: ICON + "Rounded_Rectangle/European_Union.png",
    kw: [ "德国", "英国", "荷兰", "法国", "意大利", "西班牙", "葡萄牙", "瑞士", "瑞典", "芬兰", "挪威", "丹麦", "比利时", "奥地利", "爱尔兰", "波兰", "捷克", "俄罗斯", "乌克兰", "土耳其", "germany", "frankfurt", "法兰克福", "unitedkingdom", "netherlands", "france", "italy", "spain", "london", "伦敦", "paris", "巴黎", "berlin", "柏林", "russia", "莫斯科", "moscow", "de", "uk", "gb", "nl", "fr" ]
  }, {
    name: "其它",
    flag: "🌍",
    icon: ICON + "Universal/StreamingSE.png",
    kw: []
  } ], REGION_ORDER = [ "香港", "台湾", "日本", "韩国", "新加坡", "美国", "欧洲", "其它" ], ENTRIES = [ {
    label: "香港优化",
    key: [ "香港优化" ]
  }, {
    label: "新加坡GCP",
    key: [ "新加坡gcp", "新加坡 gcp" ]
  }, {
    label: "新加坡AWS",
    key: [ "新加坡aws", "新加坡 aws" ]
  }, {
    label: "台湾HiNet",
    key: [ "台湾hinet", "台湾 hinet" ]
  }, {
    label: "(实验性)特殊入口",
    key: [ "(实验性)特殊入口", "实验性)特殊入口" ]
  }, {
    label: "(IPv6)日本优化",
    key: [ "(ipv6)日本优化", "(ipv6) 日本优化" ]
  }, {
    label: "(IPv6)日本AWS",
    key: [ "(ipv6)日本aws", "(ipv6) 日本aws" ]
  }, {
    label: "(IPv6)新加坡AWS",
    key: [ "(ipv6)新加坡aws", "(ipv6) 新加坡aws" ]
  }, {
    label: "日本优化",
    key: [ "日本优化" ]
  }, {
    label: "日本GCP",
    key: [ "日本gcp", "日本 gcp" ]
  }, {
    label: "日本AWS",
    key: [ "日本aws", "日本 aws" ]
  }, {
    label: "日本软银",
    key: [ "日本软银", "日本软银" ]
  } ], SUF = ENTRIES.map(function(e) {
    return " - " + e.label;
  }).sort(function(a, b) {
    return b.length - a.length;
  });
  function strip(name) {
    var s = String(name || "");
    s = s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2000-\u3300]|[\uE000-\uF900]/g, "").replace(/\s+/g, " ").trim();
    for (var changed = !0; changed; ) {
      changed = !1;
      for (var k = 0; k < SUF.length; k++) s.slice(-SUF[k].length) === SUF[k] && (s = s.slice(0, -SUF[k].length).trim(), 
      changed = !0);
    }
    return s;
  }
  function lc(s) {
    return String(s || "").toLowerCase();
  }
  function has(sub, keys) {
    for (var t = lc(sub), k = 0; k < keys.length; k++) if (t.indexOf(keys[k]) >= 0) return !0;
    return !1;
  }
  function matchTier(name) {
    for (var t = 0; t < TIERS.length; t++) if (name.indexOf(TIERS[t].prefix) >= 0) return TIERS[t];
    return null;
  }
  function matchRegion(name) {
    for (var c = strip(name), r = 0; r < REGIONS.length; r++) if ("其它" !== REGIONS[r].name && has(c, REGIONS[r].kw)) return REGIONS[r].name;
    return "其它";
  }
  function matchEntry(name) {
    for (var t = lc(name), best = null, bestLen = 0, e2 = 0; e2 < ENTRIES.length; e2++) for (var entry = ENTRIES[e2], k2 = 0; k2 < entry.key.length; k2++) t.indexOf(entry.key[k2]) >= 0 && entry.key[k2].length > bestLen && (best = entry, 
    bestLen = entry.key[k2].length);
    return best;
  }
  // ── 5.5 倍率 / 家宽 / 运营商优化 识别 ──
      var multiplierNamePatterns = [ /倍率/, /\bbandwidth\b/i, /\bboost\b/i, /\bturbo\b/i, /(?<![a-z])\d+(?:\.\d+)?\s*x\b/i, /\bx\s*\d+(?:\.\d+)?(?![a-z])/i, /\d+(?:\.\d+)?\s*倍/, /×/, /[\d０-９]\s*[%％]/ ], multiplierSortInfoCache = new Map;
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
  var HOME_KW = [ "家宽", "住宅", "home", "homes", "residential", "broadband", "isp" ];
  function matchHome(name) {
    for (var c = lc(strip(name)), h = 0; h < HOME_KW.length; h++) if (c.indexOf(HOME_KW[h]) >= 0) return !0;
    return !1;
  }
  var CARRIERS = [ {
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
  } ];
  function matchCarriers(name) {
    for (var c = lc(strip(name)), found = [], k = 0; k < CARRIERS.length; k++) for (var w = 0; w < CARRIERS[k].kw.length; w++) if (c.indexOf(CARRIERS[k].kw[w]) >= 0) {
      found.push(CARRIERS[k].label);
      break;
    }
    return found;
  }
  // ── 6. 分类统计 ──
    for (var tierProxies = {}, tierCount = {}, regionProxies = {}, regionCount = {}, tierRegionProxies = {}, entryProxies = {}, entryCount = {}, known = {}, tripleNetProxies = [], multHighProxies = [], multLowProxies = [], homeAllProxies = [], homeRegionProxies = {}, carrierProxies = {}, v = 0; v < nodes.length; v++) {
    var nm = nodes[v];
    known[nm] = !0;
    var tier = matchTier(nm), reg = matchRegion(nm), ent = matchEntry(nm);
    if (regionCount[reg] = (regionCount[reg] || 0) + 1, (regionProxies[reg] = regionProxies[reg] || []).push(nm), 
    tier && (tierCount[tier.label] = (tierCount[tier.label] || 0) + 1, (tierProxies[tier.label] = tierProxies[tier.label] || []).push(nm), 
    tierRegionProxies[tier.label] || (tierRegionProxies[tier.label] = {}), (tierRegionProxies[tier.label][reg] = tierRegionProxies[tier.label][reg] || []).push(nm)), 
    ent && (entryCount[ent.label] = (entryCount[ent.label] || 0) + 1, (entryProxies[ent.label] = entryProxies[ent.label] || []).push(nm)), 
    isMultiplierProxyName(nm)) {
      var mult = getMultiplierSortInfo(nm).value;
      null !== mult && mult > 1 ? multHighProxies.push(nm) : multLowProxies.push(nm);
    }
    matchHome(nm) && (homeAllProxies.push(nm), (homeRegionProxies[reg] = homeRegionProxies[reg] || []).push(nm)), 
    // 三网优化：独立组，与运营商组平行不交叉
    nm.indexOf("三网") >= 0 && tripleNetProxies.push(nm);
    // 运营商优化（一个节点可同时归入多个运营商组）
    for (var cars = matchCarriers(nm), cc = 0; cc < cars.length; cc++) (carrierProxies[cars[cc]] = carrierProxies[cars[cc]] || []).push(nm);
  }
  for (var REGION_MAP = {}, rm = 0; rm < REGIONS.length; rm++) REGION_MAP[REGIONS[rm].name] = REGIONS[rm];
  // ── 7. 构建新增分组 ──
    // 7A 地区组（select 可见：地区名放最前 + 该地区全部真实节点，供用户手动选）
  for (var newGroups = [], visible = [], r1 = 0; r1 < REGION_ORDER.length; r1++) {
    var rn = REGION_ORDER[r1];
    if (regionCount[rn]) {
      var rd = REGION_MAP[rn], sn = rd.flag + rn + "自动", gn = rd.flag + rn + "节点";
      // 隐藏 url-test：自动选该地区最快节点
            newGroups.push(Object.assign(anchor(!0), {
        name: sn,
        proxies: regionProxies[rn],
        icon: rd.icon
      })), 
      // 可见 select：地区名优先 + 全部节点，用户可手动切
      newGroups.push({
        name: gn,
        type: "select",
        proxies: [ sn ].concat(regionProxies[rn]),
        "empty-fallback": "REJECT",
        icon: rd.icon
      }), visible.push(gn);
    }
  }
  // 7B 分级组（总 url-test 隐藏 + 地区小 url-test 隐藏 + select 可见）
    for (var t1 = 0; t1 < TIERS.length; t1++) {
    var t = TIERS[t1], tl = t.label;
    if (tierCount[tl]) {
      var ch = [ sn = t.emoji + tl + "自动" ];
      newGroups.push(Object.assign(anchor(!0), {
        name: sn,
        proxies: tierProxies[tl],
        icon: ICON + "Universal/Auto_Speed.png"
      }));
      for (var trp = tierRegionProxies[tl], r3 = 0; r3 < REGION_ORDER.length; r3++) {
        var rr = REGION_ORDER[r3];
        if (trp[rr]) {
          var rdx = REGION_MAP[rr], sub = t.emoji + rdx.flag + rr + tl;
          newGroups.push(Object.assign(anchor(!0), {
            name: sub,
            proxies: trp[rr],
            icon: rdx.icon
          })), ch.push(sub);
        }
      }
      newGroups.push({
        name: t.emoji + tl,
        type: "select",
        proxies: ch,
        icon: ICON + "Universal/StreamingSE.png"
      }), visible.push(t.emoji + tl);
    }
  }
  // 7C 入口组（总 url-test 隐藏 + 分级小 url-test 隐藏 + select 可见）
    for (var e1 = 0; e1 < ENTRIES.length; e1++) {
    var es = ENTRIES[e1].label;
    if (entryCount[es]) {
      var epAll = entryProxies[es], esn = "🚀" + es + "自动", ch2 = [ esn ];
      newGroups.push(Object.assign(anchor(!0), {
        name: esn,
        proxies: epAll,
        icon: ICON + "Universal/StreamingSE.png"
      }));
      for (var t2 = 0; t2 < TIERS.length; t2++) {
        var t3 = TIERS[t2], subAll = epAll.filter(function(x) {
          return x.indexOf(t3.prefix) >= 0;
        });
        if (subAll.length) {
          var subn = "🔹" + t3.label + es;
          newGroups.push(Object.assign(anchor(!0), {
            name: subn,
            proxies: subAll,
            icon: ICON + "Universal/StreamingSE.png"
          })), ch2.push(subn);
        }
      }
      newGroups.push({
        name: "🚀" + es,
        type: "select",
        proxies: ch2.concat(epAll),
        icon: ICON + "Universal/StreamingSE.png"
      }), visible.push("🚀" + es);
    }
  }
  // 7D 故障转移（normal 版）
  // fallback 类型：按顺序故障转移，地区节点组优先，最低延迟（全量 url-test）兜底。
  // 地区组自身是 select（内含该地区 url-test 自动层），故顺序 = HK → TW → JP → SG → US → EU → 其它 → 最低延迟。
  var regionFallbackChoices = visible.slice();
  // 7A 生成的地区可见组名
  newGroups.push({
    name: "故障转移",
    type: "fallback",
    url: "https://www.gstatic.com/generate_204",
    interval: 180,
    timeout: 5e3,
    lazy: !1,
    "empty-fallback": "REJECT",
    proxies: regionFallbackChoices.concat([ "最低延迟" ]),
    icon: ICON + "Universal/Final.png"
  }), newGroups.push({
    name: "最低延迟",
    type: "url-test",
    tolerance: 30,
    url: "https://www.gstatic.com/generate_204",
    interval: 300,
    timeout: 5e3,
    proxies: nodes.slice(),
    "empty-fallback": "REJECT",
    icon: ICON + "Universal/Auto_Speed.png"
  }), visible.push("故障转移", "最低延迟");
  // 7G 家宽组：url-test(hidden)+select(visible)
  var HOME_REGION_ICON = {
    "香港": "https://api.iconify.design/circle-flags:hk.svg",
    "台湾": "https://api.iconify.design/circle-flags:tw.svg",
    "日本": "https://api.iconify.design/circle-flags:jp.svg",
    "韩国": "https://api.iconify.design/circle-flags:kr.svg",
    "新加坡": "https://api.iconify.design/circle-flags:sg.svg",
    "美国": "https://api.iconify.design/circle-flags:us.svg",
    "欧洲": "https://api.iconify.design/circle-flags:eu.svg",
    "其它": "https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/World_Map.png"
  };
  if (homeAllProxies.length) {
    for (var h1 = 0; h1 < REGION_ORDER.length; h1++) {
      var hr = REGION_ORDER[h1];
      if (homeRegionProxies[hr] && homeRegionProxies[hr].length) {
        var hrd = REGION_MAP[hr], hgn = "🏠" + hrd.flag + hr + "家宽", hsn = "🏠" + hrd.flag + hr + "家宽自动", hIcon = HOME_REGION_ICON[hr] || hrd.icon;
        newGroups.push(Object.assign(anchor(!0), {
          name: hsn,
          proxies: homeRegionProxies[hr].slice(),
          icon: hIcon
        })), newGroups.push({
          name: hgn,
          type: "select",
          proxies: [ hsn ].concat(homeRegionProxies[hr].slice()),
          "empty-fallback": "REJECT",
          icon: hIcon
        }), visible.push(hgn);
      }
    }
    newGroups.push(Object.assign(anchor(!0), {
      name: "🏡全球家宽自动",
      proxies: homeAllProxies.slice(),
      icon: "https://api.iconify.design/tabler:home-filled.svg"
    })), newGroups.push({
      name: "🏡全球家宽",
      type: "select",
      proxies: [ "🏡全球家宽自动" ].concat(homeAllProxies.slice()),
      "empty-fallback": "REJECT",
      icon: "https://api.iconify.design/tabler:home-filled.svg"
    }), visible.push("🏡全球家宽");
  }
  // 7F 倍率组：url-test(hidden)+select(visible) 结构
    multHighProxies.length && (newGroups.push(Object.assign(anchor(!0), {
    name: "🐎高倍率自动",
    proxies: multHighProxies.slice(),
    icon: "https://api.iconify.design/tabler:gauge-filled.svg?color=%23ef4444"
  })), newGroups.push({
    name: "🐎高倍率",
    type: "select",
    proxies: [ "🐎高倍率自动" ].concat(multHighProxies.slice()),
    "empty-fallback": "REJECT",
    icon: "https://api.iconify.design/tabler:gauge-filled.svg?color=%23ef4444"
  }), visible.push("🐎高倍率")), multLowProxies.length && (newGroups.push(Object.assign(anchor(!0), {
    name: "🐢低倍率自动",
    proxies: multLowProxies.slice(),
    icon: "https://api.iconify.design/tabler:gauge-filled.svg?color=%23f59e0b"
  })), newGroups.push({
    name: "🐢低倍率",
    type: "select",
    proxies: [ "🐢低倍率自动" ].concat(multLowProxies.slice()),
    "empty-fallback": "REJECT",
    icon: "https://api.iconify.design/tabler:gauge-filled.svg?color=%23f59e0b"
  }), visible.push("🐢低倍率"));
  // 7H 四大运营商优化组：url-test(hidden)+select(visible) 结构
  // 运营商图标：/mini Color 集合（10086=移动, 10010=联通, 10000=电信）
  for (var CARRIER_EMOJI = {
    "移动": "📱",
    "联通": "📶",
    "电信": "☎️",
    "广电": "📺"
  }, CARRIER_ICON = {
    "移动": "https://fastly.jsdelivr.net/gh/Orz-3/mini@master/Color/10086.png",
    "联通": "https://fastly.jsdelivr.net/gh/Orz-3/mini@master/Color/10010.png",
    "电信": "https://fastly.jsdelivr.net/gh/Orz-3/mini@master/Color/10000.png",
    "广电": "https://api.iconify.design/tabler:device-tv.svg?color=%23722ED1"
  }, c1 = 0; c1 < CARRIERS.length; c1++) {
    var cl = CARRIERS[c1].label;
    if (carrierProxies[cl] && carrierProxies[cl].length) {
      var cgn = CARRIER_EMOJI[cl] + cl + "优化", csn = CARRIER_EMOJI[cl] + cl + "优化自动", cIcon = CARRIER_ICON[cl] || ICON + "Universal/StreamingSE.png";
      newGroups.push(Object.assign(anchor(!0), {
        name: csn,
        proxies: carrierProxies[cl].slice(),
        icon: cIcon
      })), newGroups.push({
        name: cgn,
        type: "select",
        proxies: [ csn ].concat(carrierProxies[cl].slice()),
        "empty-fallback": "REJECT",
        icon: cIcon
      }), visible.push(cgn);
    }
  }
  // 三网优化组：命名含“三网”的线路独立成组（同时服务移动·联通·电信）
    if (tripleNetProxies.length) {
    var tsn = "💠三网优化智能", tIcon = "https://api.iconify.design/tabler:world.svg?color=%230EA5E9";
    newGroups.push(Object.assign(anchor(!0), {
      name: tsn,
      proxies: tripleNetProxies.slice(),
      icon: tIcon
    })), newGroups.push({
      name: "💠三网优化",
      type: "select",
      proxies: [ tsn ].concat(tripleNetProxies.slice()),
      "empty-fallback": "REJECT",
      icon: tIcon
    }), visible.push("💠三网优化");
  }
  // 7I 下载专用组：负载均衡 / 下载散列组 / 下载轮询组
    var LB_HEALTH = {
    interval: 180,
    timeout: 2500,
    maxFailedTimes: 3
  };
  function makeLoadBalanceGroup(name, icon, proxies, options) {
    if (!proxies || !proxies.length) return null;
    var o = options || {};
    return {
      name: name,
      type: "load-balance",
      icon: icon,
      url: o.url || "https://www.gstatic.com/generate_204",
      interval: o.interval || LB_HEALTH.interval,
      timeout: o.timeout || LB_HEALTH.timeout,
      "max-failed-times": o.maxFailedTimes || LB_HEALTH.maxFailedTimes,
      strategy: o.strategy || "consistent-hashing",
      lazy: void 0 === o.lazy || o.lazy,
      proxies: proxies
    };
  }
  // 负载均衡：全量节点 + consistent-hashing
    var lbAll = makeLoadBalanceGroup("负载均衡", ICON + "Universal/Final.png", nodes.slice(), Object.assign({}, LB_HEALTH, {
    strategy: "consistent-hashing"
  }));
  lbAll && (lbAll.hidden = !0, newGroups.push(lbAll));
  // 下载散列组 / 下载轮询组：引用各地区自动组
    for (var regionAutoNames = [], r2 = 0; r2 < REGION_ORDER.length; r2++) {
    var rr2 = REGION_ORDER[r2];
    if (regionProxies[rr2] && regionProxies[rr2].length) {
      var rsn = REGION_MAP[rr2].flag + rr2 + "自动";
      regionAutoNames.push(rsn);
    }
  }
  var lbHash = makeLoadBalanceGroup("下载散列组", ICON + "Universal/Final.png", regionAutoNames.slice(), Object.assign({}, LB_HEALTH, {
    strategy: "consistent-hashing",
    lazy: !1
  }));
  lbHash && (lbHash.hidden = !0, newGroups.push(lbHash));
  var lbRound = makeLoadBalanceGroup("下载轮询组", ICON + "Universal/Final.png", regionAutoNames.slice(), Object.assign({}, LB_HEALTH, {
    strategy: "round-robin"
  }));
  lbRound && (lbRound.hidden = !0, newGroups.push(lbRound)), groups = groups.concat(newGroups);
  // ── 8. 新组挂到业务组和 GLOBAL ──
  for (var TARGET = [ "代理连接", "代理DNS", "TELEGRAM", "国外AI", "下载相关", "风控安全", "GOOGLE", "YOUTUBE", "TIKTOK", "海外媒体", "GLOBAL" ], g1 = 0; g1 < groups.length; g1++) {
    var gx = groups[g1];
    if (!(TARGET.indexOf(gx.name) < 0)) for (var v1 = 0; v1 < visible.length; v1++) if (gx.proxies.indexOf(visible[v1]) < 0) if ("GLOBAL" !== gx.name || "故障转移" !== visible[v1] && "最低延迟" !== visible[v1]) gx.proxies.push(visible[v1]); else {
      var anchor = "故障转移" === visible[v1] ? "代理连接" : "故障转移", anchorIdx = gx.proxies.indexOf(anchor);
      anchorIdx < 0 && (anchorIdx = gx.proxies.indexOf("代理连接")), gx.proxies.splice(anchorIdx + 1, 0, visible[v1]);
    }
  }
  // ── 9. 剔除对已删除 LEGACY 组的悬空引用 ──
    for (var builtin = [ "DIRECT", "REJECT", "REJECT-DROP", "PASS", "PASS-RULE", "COMPATIBLE", "IPV4优先", "IPV6优先", "仅IPV4", "仅IPV6" ], gnames = {}, b1 = 0; b1 < groups.length; b1++) gnames[groups[b1].name] = !0;
  for (var c2 = 0; c2 < groups.length; c2++) groups[c2].proxies = groups[c2].proxies.filter(function(ref) {
    return known[ref] || gnames[ref] || builtin.indexOf(ref) >= 0;
  });
  // ── 9.5 断环兜底 ──
    for (var gAdj = {}, a1 = 0; a1 < groups.length; a1++) {
    var an = groups[a1].name;
    gAdj[an] = [];
    for (var ap = groups[a1].proxies || [], a2 = 0; a2 < ap.length; a2++) gnames[ap[a2]] && ap[a2] !== an && gAdj[an].push(ap[a2]);
  }
  var gVis = {}, gStk = {};
  function breakCycles(name) {
    if (gStk[name]) return !0;
    if (gVis[name]) return !1;
    gStk[name] = !0;
    for (var adj = gAdj[name] || [], a3 = adj.length - 1; a3 >= 0; a3--) if (breakCycles(adj[a3])) {
      for (var grp = null, a4 = 0; a4 < groups.length; a4++) if (groups[a4].name === name) {
        grp = groups[a4];
        break;
      }
      grp && (grp.proxies = grp.proxies.filter(function(p) {
        return p !== adj[a3];
      })), gAdj[name].splice(a3, 1);
    }
    return delete gStk[name], gVis[name] = !0, !1;
  }
  for (var a5 = 0; a5 < groups.length; a5++) gVis[groups[a5].name] || breakCycles(groups[a5].name);
  // ── 10. CN 直连 ──
    var rules = result.rules;
  if (rules.indexOf("GEOSITE,CN,直接连接") < 0) {
    var gi = rules.indexOf("RULE-SET,direct-lite,直接连接");
    gi >= 0 && rules.splice(gi + 1, 0, "GEOSITE,CN,直接连接");
  }
  if (rules.indexOf("GEOIP,CN,直接连接,no-resolve") < 0) {
    var pi = rules.indexOf("RULE-SET,direct_ip,直接连接");
    pi >= 0 && rules.splice(pi + 1, 0, "GEOIP,CN,直接连接,no-resolve");
  }
  return result["proxy-groups"] = groups, result;
}

// ═══ 原版 originalMain（与 smart 版共用）═══
function originalMain(config) {
  const subscriptionProxies = config.proxies || [], ipAnchor = {
    type: "http",
    interval: 86400,
    proxy: "代理连接",
    behavior: "ipcidr",
    format: "mrs"
  }, domainAnchor = {
    type: "http",
    interval: 86400,
    proxy: "代理连接",
    behavior: "domain",
    format: "mrs"
  }, domainYamlAnchor = {
    type: "http",
    interval: 86400,
    proxy: "代理连接",
    behavior: "domain",
    format: "yaml"
  }, ipYamlAnchor = {
    type: "http",
    interval: 86400,
    proxy: "代理连接",
    behavior: "ipcidr",
    format: "yaml"
  }, directDns = [ "https://dns.alidns.com/dns-query#直接连接", "https://doh.pub/dns-query#直接连接&h3=false" ], proxyDns = [ "https://dns.google/dns-query#代理DNS&ecs=8.8.8.8/24&ecs-override=true", "https://dns.quad9.net/dns-query#代理DNS&ecs=9.9.9.9/24&ecs-override=true" ], dlAnchor = {
    type: "select",
    proxies: [ "代理连接", "故障转移", "最低延迟", "负载均衡", "下载散列组", "下载轮询组" ],
    "include-all-providers": !0,
    "empty-fallback": "REJECT"
  }, cnAppDomains = [ "douyin.com", "iesdouyin.com", "amemv.com", "amemv.net", "snssdk.com", "zjbyte.com", "zjbyte.net", "toutiao.com", "toutiao.cn", "toutiaoimg.com", "toutiaoimg.net", "toutiaocdn.com", "toutiaostatic.com", "toutiaovod.com", "pstatp.com", "bytecdn.com", "bytecdn.net", "bytecdntp.com", "bytednsdoc.com", "bytescm.com", "bytetos.com", "volccs.com", "volces.com", "ixigua.com", "ixiguavideo.com", "douyinvod.com", "douyincdn.com", "douyinpic.com", "douyinstatic.com", "douyinliving.com", "douyinec.com", "byteimg.com", "bytegoofy.com", "bytecdn.cn", "ipstatp.com", "bytedance.com", "byted.org", "toutiao.io", "jinritemai.com" ], cnAppRules = cnAppDomains.map(function(d) {
    return "DOMAIN-SUFFIX," + d + ",直接连接";
  }), cnAppFakeIp = cnAppDomains.map(function(d) {
    return "DOMAIN-SUFFIX," + d + ",real-ip";
  }), cnAppDnsPolicy = {};
  cnAppDomains.forEach(function(d) {
    cnAppDnsPolicy["+." + d] = directDns;
  });
  const originDns = config.dns || {}, appendDirectTag = val => "string" == typeof val ? val.split("#")[0] + "#直接连接" : val, formatDnsValues = dnsValue => Array.isArray(dnsValue) ? dnsValue.map(appendDirectTag) : appendDirectTag(dnsValue);
  let finalProxyServerNameserver = proxyDns;
  const originPsn = originDns["proxy-server-nameserver"];
  let finalProxyServerNameserverPolicy;
  null != originPsn && "" !== originPsn && (!Array.isArray(originPsn) || originPsn.length > 0) && (finalProxyServerNameserver = formatDnsValues(originPsn));
  const originPolicy = originDns["proxy-server-nameserver-policy"];
  if (originPolicy && "object" == typeof originPolicy && !Array.isArray(originPolicy) && Object.keys(originPolicy).length > 0) {
    finalProxyServerNameserverPolicy = {};
    for (const [domain, servers] of Object.entries(originPolicy)) finalProxyServerNameserverPolicy[domain] = formatDnsValues(servers);
  }
  // QUIC(UDP:443) 不再单独建组：域名识别交给 sniffer 的 QUIC 嗅探，流量与 TCP 完全同路径
  return {
    "proxy-providers": {
      "节点": {
        type: "inline",
        "health-check": {
          enable: !0,
          url: "https://dns.google/generate_204",
          "expected-status": 204,
          interval: 600,
          timeout: 3e3,
          "max-failed-times": 2,
          lazy: !1
        },
        override: {
          "ip-version": "dual"
        },
        "exclude-filter": "(?i)套餐|剩余|流量|到期|重置|频道|订阅|官网|禁止|客户端|有效|联系|测试|节点|日期|群组|加入|通知|维护|网址|地址|下载|更新|APP|登录|严禁|恢复|处理|谢谢",
        payload: subscriptionProxies
      }
    },
    ipv6: !0,
    "allow-lan": !1,
    "bind-address": "*",
    mode: "rule",
    "log-level": "error",
    // 可选：直连组测速由红转绿。默认测速目标是 gstatic（大陆直连必超时=全红，但不影响可用性）。
    // 取消注释改用小米国内 204；注意：会同时改变所有节点延迟排序口径。
    // "proxy-test-url": "http://connect.rom.miui.com/generate_204",
    // "proxy-test-interval": 600,
    "unified-delay": !0,
    "tcp-concurrent": !0,
    "find-process-mode": "off",
    "disable-keep-alive": !1,
    "keep-alive-interval": 15,
    "keep-alive-idle": 600,
    "etag-support": !0,
    "lgbm-auto-update": !0,
    "lgbm-update-interval": 72,
    "lgbm-url": "https://github.com/vernesong/mihomo/releases/download/LightGBM-Model/Model-large.bin",
    profile: {
      "store-selected": !0,
      "store-fake-ip": !0,
      "smart-collector-size": 100
    },
    experimental: {
      "quic-go-disable-gso": !1,
      "quic-go-disable-ecn": !0,
      "dialer-ip4p-convert": !1
    },
    port: 0,
    "socks-port": 0,
    "mixed-port": 0,
    "redir-port": 0,
    "tproxy-port": 0,
    tun: {
      enable: !0,
      stack: "mixed",
      "auto-route": !0,
      "auto-redirect": !0,
      "auto-detect-interface": !0,
      "strict-route": !0,
      "disable-icmp-forwarding": !0,
      "dns-hijack": [ "any:53", "tcp://any:53" ],
      "udp-timeout": 600
    },
    hosts: {
      ...config.hosts || {},
      "dns.alidns.com": [ "223.5.5.5", "223.6.6.6", "2400:3200::1", "2400:3200:baba::1" ],
      "doh.pub": [ "120.53.53.53", "1.12.12.12" ],
      "dns.google": [ "8.8.8.8", "8.8.4.4", "2001:4860:4860::8888", "2001:4860:4860::8844" ],
      "dns.quad9.net": [ "9.9.9.9", "149.112.112.112", "2620:fe::fe", "2620:fe::9" ],
      "services.googleapis.cn": "services.googleapis.com",
      "google.cn": "google.com",
      "cn.bing.com": "global.bing.com"
    },
    dns: {
      enable: !0,
      ipv6: !0,
      "ipv6-timeout": 300,
      "cache-algorithm": "arc",
      "use-hosts": !0,
      "use-system-hosts": !1,
      "prefer-h3": !0,
      "respect-rules": !1,
      "enhanced-mode": "fake-ip",
      "fake-ip-range": "198.18.0.0/15",
      "fake-ip-range6": "fd00:a4c5:9b12:d3f8:e760:00df::/96",
      "fake-ip-ttl": 1,
      "fake-ip-filter-mode": "rule",
      "fake-ip-filter": [ "RULE-SET,ads,fake-ip", "RULE-SET,proxy@direct,real-ip", "RULE-SET,ai,fake-ip", "RULE-SET,download,fake-ip", "RULE-SET,safe,fake-ip", "RULE-SET,youtube,fake-ip", "RULE-SET,tiktok,fake-ip", "RULE-SET,google,fake-ip", "RULE-SET,media,fake-ip", "RULE-SET,proxy-lite,fake-ip", "RULE-SET,direct-lite,real-ip", "RULE-SET,cn_domain,real-ip", "RULE-SET,private_domain,real-ip", ...cnAppFakeIp, "GEOSITE,cn,real-ip", "GEOSITE,private,real-ip", "MATCH,fake-ip" ],
      "default-nameserver": [ "223.6.6.6", "119.29.29.29" ],
      "proxy-server-nameserver": finalProxyServerNameserver,
      ...void 0 !== finalProxyServerNameserverPolicy && {
        "proxy-server-nameserver-policy": finalProxyServerNameserverPolicy
      },
      nameserver: proxyDns,
      "nameserver-policy": {
        "rule-set:ads": [ "rcode://name_error" ],
        "rule-set:proxy@direct": proxyDns,
        "rule-set:ai,download,safe,youtube,tiktok,google,media,proxy-lite": proxyDns,
        "rule-set:direct-lite,dnsmasq-china-lite": directDns,
        "rule-set:cn_domain,private_domain": directDns,
        "GEOSITE,cn": directDns,
        "GEOSITE,private": directDns,
        ...cnAppDnsPolicy
      },
      // 直连路径的兜底解析。原值 rcode://success 会让"未被 nameserver-policy 覆盖"的域名
      // 在 DIRECT 策略下解析为空答案(no such host)，导致 DIRECT 及 4 个自建 direct 节点测速/建连必然失败。
      // 若追求极致防泄漏可改回 ["rcode://success"]，代价是直连兜底解析全废。
      "direct-nameserver": directDns,
      "direct-nameserver-follow-policy": !1
    },
    sniffer: {
      enable: !0,
      "force-dns-mapping": !0,
      "parse-pure-ip": !0,
      "override-destination": !1,
      sniff: {
        HTTP: {
          ports: [ 80, "8080-8880" ],
          "override-destination": !0
        },
        TLS: {
          ports: [ 443, 8443 ],
          "override-destination": !0
        },
        QUIC: {
          ports: [ 443, 8443 ],
          "override-destination": !1
        }
      },
      "skip-domain": [ "rule-set:ads,proxy@direct,ai,download,safe,youtube,tiktok,google,media,proxy-lite,direct-lite,dnsmasq-china-lite,cn_domain,private_domain" ],
      "skip-src-address": [ "rule-set:telegram_ip,safe_ip,google_ip,media_ip,direct_ip,lan_ip,cn_ip" ]
    },
    "rule-providers": {
      ads: {
        ...domainAnchor,
        url: "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/ads.mrs",
        path: "./rules/ads.mrs"
      },
      "proxy@direct": {
        ...domainAnchor,
        url: "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/proxy@direct.mrs",
        path: "./rules/proxy@direct.mrs"
      },
      ai: {
        ...domainAnchor,
        url: "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/ai.mrs",
        path: "./rules/ai.mrs"
      },
      download: {
        ...domainAnchor,
        url: "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/download.mrs",
        path: "./rules/download.mrs"
      },
      safe: {
        ...domainAnchor,
        url: "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/safe.mrs",
        path: "./rules/safe.mrs"
      },
      youtube: {
        ...domainAnchor,
        url: "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/youtube.mrs",
        path: "./rules/youtube.mrs"
      },
      tiktok: {
        ...domainAnchor,
        url: "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/tiktok.mrs",
        path: "./rules/tiktok.mrs"
      },
      google: {
        ...domainAnchor,
        url: "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/google.mrs",
        path: "./rules/google.mrs"
      },
      media: {
        ...domainAnchor,
        url: "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/media.mrs",
        path: "./rules/media.mrs"
      },
      "proxy-lite": {
        ...domainAnchor,
        url: "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/proxy-lite.mrs",
        path: "./rules/proxy-lite.mrs"
      },
      "direct-lite": {
        ...domainAnchor,
        url: "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/direct-lite.mrs",
        path: "./rules/direct-lite.mrs"
      },
      "dnsmasq-china-lite": {
        ...domainAnchor,
        url: "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/domain/dnsmasq-china-lite.mrs",
        path: "./rules/dnsmasq-china-lite.mrs"
      },
      telegram_ip: {
        ...ipAnchor,
        url: "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/ip/telegram.mrs",
        path: "./rules/telegram_ip.mrs"
      },
      safe_ip: {
        ...ipAnchor,
        url: "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/ip/safe.mrs",
        path: "./rules/safe_ip.mrs"
      },
      google_ip: {
        ...ipAnchor,
        url: "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/ip/google.mrs",
        path: "./rules/google_ip.mrs"
      },
      media_ip: {
        ...ipAnchor,
        url: "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/ip/media.mrs",
        path: "./rules/media_ip.mrs"
      },
      direct_ip: {
        ...ipAnchor,
        url: "https://raw.githubusercontent.com/echs-top/proxy/main/mrs/ip/direct.mrs",
        path: "./rules/direct_ip.mrs"
      },
      cn_domain: {
        ...domainYamlAnchor,
        url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/direct.txt",
        path: "./rules/cn_domain.yaml"
      },
      cn_ip: {
        ...ipYamlAnchor,
        url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/cncidr.txt",
        path: "./rules/cn_ip.yaml"
      },
      private_domain: {
        ...domainYamlAnchor,
        url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/private.txt",
        path: "./rules/private_domain.yaml"
      },
      lan_ip: {
        ...ipYamlAnchor,
        url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/lancidr.txt",
        path: "./rules/lan_ip.yaml"
      },
      applications_direct: {
        type: "http",
        interval: 86400,
        proxy: "代理连接",
        behavior: "classical",
        format: "yaml",
        url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/applications.txt",
        path: "./rules/applications_direct.yaml"
      }
    },
    rules: [ ...cnAppRules, "RULE-SET,applications_direct,直接连接", "DST-PORT,5228-5230,直接连接", "SUB-RULE,(RULE-SET,telegram_ip,no-resolve),sub-telegram", "RULE-SET,private_domain,直接连接", "RULE-SET,ads,REJECT", "RULE-SET,proxy@direct,直接连接", "RULE-SET,cn_domain,直接连接", "RULE-SET,direct-lite,直接连接", "RULE-SET,dnsmasq-china-lite,直接连接", "GEOSITE,CN,直接连接", "SUB-RULE,(RULE-SET,ai),sub-ai", "SUB-RULE,(RULE-SET,download),sub-download", "SUB-RULE,(RULE-SET,safe),sub-safe", "SUB-RULE,(RULE-SET,youtube),sub-youtube", "SUB-RULE,(RULE-SET,tiktok),sub-tiktok", "SUB-RULE,(RULE-SET,google),sub-google", "SUB-RULE,(RULE-SET,media),sub-media", "SUB-RULE,(RULE-SET,proxy-lite),sub-proxy", "SUB-RULE,(RULE-SET,safe_ip),sub-safe", "SUB-RULE,(RULE-SET,google_ip),sub-google", "SUB-RULE,(RULE-SET,media_ip),sub-media", "RULE-SET,direct_ip,直接连接", "GEOIP,CN,直接连接,no-resolve", "RULE-SET,lan_ip,直接连接,no-resolve", "RULE-SET,cn_ip,直接连接,no-resolve", "MATCH,代理连接" ],
    "sub-rules": {
      "sub-telegram": [ "MATCH,TELEGRAM" ],
      "sub-ai": [ "MATCH,国外AI" ],
      "sub-download": [ "MATCH,下载相关" ],
      "sub-safe": [ "MATCH,风控安全" ],
      "sub-google": [ "MATCH,GOOGLE" ],
      "sub-youtube": [ "MATCH,YOUTUBE" ],
      "sub-tiktok": [ "MATCH,TIKTOK" ],
      "sub-media": [ "MATCH,海外媒体" ],
      "sub-proxy": [ "MATCH,代理连接" ]
    },
    proxies: [ {
      name: "IPV4优先",
      type: "direct",
      udp: !0,
      "ip-version": "ipv4-prefer"
    }, {
      name: "IPV6优先",
      type: "direct",
      udp: !0,
      "ip-version": "ipv6-prefer"
    }, {
      name: "仅IPV4",
      type: "direct",
      udp: !0,
      "ip-version": "ipv4"
    }, {
      name: "仅IPV6",
      type: "direct",
      udp: !0,
      "ip-version": "ipv6"
    } ],
    "proxy-groups": [ {
      name: "代理连接",
      type: "select",
      proxies: [ "最低延迟", "故障转移" ],
      "include-all-providers": !0,
      icon: "https://raw.githubusercontent.com/Semporia/Hand-Painted-icon/master/Universal/StreamingSE.png"
    }, {
      name: "直接连接",
      type: "select",
      proxies: [ "DIRECT", "IPV4优先", "IPV6优先", "仅IPV4", "仅IPV6" ],
      url: "http://connect.rom.miui.com/generate_204",
      "expected-status": "204",
      icon: "https://raw.githubusercontent.com/Semporia/Hand-Painted-icon/master/Accommodation/Online_Booking.png"
    }, {
      name: "代理DNS",
      ...dlAnchor,
      icon: "https://raw.githubusercontent.com/Semporia/Hand-Painted-icon/master/Universal/Streaming.png"
    }, {
      name: "TELEGRAM",
      ...dlAnchor,
      icon: "https://raw.githubusercontent.com/Semporia/Hand-Painted-icon/master/Social_Media/Telegram.png"
    }, {
      name: "国外AI",
      ...dlAnchor,
      icon: "https://raw.githubusercontent.com/Semporia/Hand-Painted-icon/master/Fitness/Chat.png"
    }, {
      name: "下载相关",
      ...dlAnchor,
      icon: "https://raw.githubusercontent.com/Semporia/Hand-Painted-icon/master/Google_Suite/Drive.png"
    }, {
      name: "风控安全",
      ...dlAnchor,
      icon: "https://raw.githubusercontent.com/Semporia/Hand-Painted-icon/master/Google_Suite/Account.png"
    }, {
      name: "GOOGLE",
      ...dlAnchor,
      icon: "https://raw.githubusercontent.com/Semporia/Hand-Painted-icon/master/Google_Suite/Google.png"
    }, {
      name: "YOUTUBE",
      ...dlAnchor,
      icon: "https://raw.githubusercontent.com/Semporia/Hand-Painted-icon/master/Social_Media/YouTube.png"
    }, {
      name: "TIKTOK",
      ...dlAnchor,
      icon: "https://raw.githubusercontent.com/Semporia/Hand-Painted-icon/master/Social_Media/TikTok.png"
    }, {
      name: "海外媒体",
      ...dlAnchor,
      icon: "https://raw.githubusercontent.com/Semporia/Hand-Painted-icon/master/Universal/Video.png"
    }, {
      name: "GLOBAL",
      type: "select",
      proxies: [ "代理连接", "直接连接", "代理DNS", "TELEGRAM", "国外AI", "下载相关", "风控安全", "GOOGLE", "YOUTUBE", "TIKTOK", "海外媒体" ],
      "include-all-providers": !0,
      hidden: !0,
      icon: "https://raw.githubusercontent.com/Semporia/Hand-Painted-icon/master/Google_Suite/Browser.png"
    } ]
  };
}