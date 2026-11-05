// ============================================================
// Nowhere 专用 Mihomo 覆写 all-in-one（Smart 内核）v3.0
// 一个脚本全搞定：
//   ① 按 substore.js v2.0 同款逻辑生成交叉中转节点（37→206）
//   ② 分组/DNS 完全照抄原订阅，仅 select → smart（含 DIRECT/REJECT 的组除外）
//   ③ DNS 原样透传；URI 链路无 dns 时注入机场原版 DNS
// 覆写到原订阅配置上使用。
// ============================================================

// 配置区（与 v1 语义一致，可自由修改，不用动后面的逻辑）
// ════════════════════════════════════════════════════════════

// ── 1. 节点 → 当前接入点映射表 ──
// 左边是订阅里实际存在的落地节点名（区域+编号），右边是官网"接入点切换"页面
// 该节点当前选中的入口点名。
// 用途：① 用该节点的 server 收集"入口机地址" ② 所有落地节点可从这些入口点进
// 接入点是"仅支持原始线路"的不要写进来。
const ENTRY_NODE_TEXT = `
香港 01:香港优化
香港 02:新加坡GCP
香港 03:新加坡AWS

日本 01:日本优化
日本 02:日本GCP A
日本 03:日本GCP B

台湾 01:台湾优化
台湾 02:台湾HiNet
台湾 03:(实验性)特殊入口

新加坡 01:新加坡优化
新加坡 02:新加坡AWS
新加坡 03:日本AWS

美国 01:美国优化
美国 02:日本AWS
美国 03:日本软银

意大利 01:(IPv6)日本优化
印度 01:(IPv6)日本AWS
泰国 01:(IPv6)新加坡AWS
澳洲 01:(IPv6)新加坡AWS
墨西哥 01:日本优化
巴西 01:日本优化
`;

// ── 2/3/6 合并：各区域可切换接入点清单（对照官网"接入点切换"下拉，默认入口第一位）──
// 说明：
//   · 每个节点 × 本区域清单内全部入口 交叉生成，清单第一位是官网默认项；
//   · IPv6 入口按官网提供保留（(IPv6)日本优化 / (IPv6)日本AWS / (IPv6)新加坡AWS）；
//   · 香港/台湾/新加坡组可互相切换（HK_TW_SG 组），日本/美国/其它地区共用日本系入口（ZJ 组）。
const REGION_DEFAULT_ENTRY = {
  "香港":    "香港优化",
  "台湾":    "台湾优化",
  "新加坡":  "新加坡优化",
  "日本":    "日本优化",
  "美国":    "美国优化",
  "意大利":  "香港优化",
  "印度":    "日本优化",
  "泰国":    "日本优化",
  "澳洲":    "日本优化",
  "墨西哥":  "日本优化",
  "巴西":    "日本优化"
};

// 共享入口组：同一组内的入口可在该组各区域间交叉切换（含官网提供的 IPv6 入口）
const SHARED_ENTRY_GROUPS = {
  HK_TW_SG: [
    "新加坡GCP", "新加坡AWS", "台湾HiNet",
    "(实验性)特殊入口",
    "日本AWS",
    "(IPv6)日本优化", "(IPv6)日本AWS", "(IPv6)新加坡AWS"
  ],
  ZJ: [
    "日本GCP A", "日本GCP B", "日本AWS", "日本软银",
    "(IPv6)日本优化", "(IPv6)日本AWS", "(IPv6)新加坡AWS"
  ]
};

// 区域 → 所属共享入口组
const REGION_ACCESS_GROUP = {
  "香港":   "HK_TW_SG",
  "台湾":   "HK_TW_SG",
  "新加坡": "HK_TW_SG",
  "意大利": "HK_TW_SG",
  "日本":   "ZJ",
  "美国":   "ZJ",
  "印度":   "ZJ",
  "泰国":   "ZJ",
  "澳洲":   "ZJ",
  "墨西哥": "ZJ",
  "巴西":   "ZJ"
};

// 兼容派生：每个区域的完整可切换入口清单 = [默认项, ...共享组其余项]
const REGION_ALLOWED_ENTRIES = Object.fromEntries(
  Object.entries(REGION_DEFAULT_ENTRY).map(([region, def]) => {
    const group = SHARED_ENTRY_GROUPS[REGION_ACCESS_GROUP[region]] || [];
    return [region, [def, ...group.filter(ap => ap !== def)]];
  })
);

// ── 4. 区域别名表 ──
const REGION_ALIASES = {
  "香港":   ["香港"],
  "日本":   ["日本"],
  "台湾":   ["台湾", "臺灣"],
  "新加坡": ["新加坡", "狮城"],
  "美国":   ["美国"],
  "意大利": ["意大利"],
  "印度":   ["印度"],
  "泰国":   ["泰国"],
  "澳洲":   ["澳洲", "澳大利亚"],
  "墨西哥": ["墨西哥"],
  "巴西":   ["巴西"]
};

// ── 5. 区域排列顺序（决定输出顺序，与官网分组一致）──
const REGION_ORDER = [
  "香港", "日本", "台湾", "新加坡", "美国",
  "意大利", "印度", "泰国", "澳洲", "墨西哥", "巴西"
];

// ── 6. 区域 → 共享入口组映射 ──（已并入上方 REGION_ACCESS_GROUP）

// ── 7. 排序模式 ──
// 1 = 按节点优先（香港 01 的所有入口 → 香港 02 的所有入口…）
// 2 = 按入口点优先（香港优化的所有节点 → 新加坡GCP 的所有节点…）
const SORT_MODE = 1;

// ── 8. 是否跳过 Cloudflare 节点（server 含 "cf" 不参与入口收集与中转）──
const SKIP_CF = true;

// ── 9. "跳过"标记：接入点为这些值表示没有中转入口 ──
const SKIP_MARKERS = new Set([
  "仅原始线路",
  "仅支持原始线路",
  "暂无可选接入点"
]);

// ── 10. "不参与中转"的节点名标记（原样保留）──
const UNTOUCHED_NAME_MARKERS = ["基础", "Smell", "测试"];

// ── 11. 手动指定入口机地址（优先级最高）──
const MANUAL_ENTRY_SERVERS = {
  // "新加坡优化": "sg-opt.example.com",
};

// ── 12. 入口机缺失时的兜底规则 ──
// "XX优化"入口采集不到地址时，借用"XX 01"节点的完整参数兜底
const ENABLE_ENTRY_SERVER_FALLBACK = true;

// ── 13. ★ v2.0 新增：是否保留原落地节点 ──
// true  = 输出 [中转节点..., 全部原节点]。proxy-groups 引用永远有效，
//         原节点可直接回退，绝不会因为脚本导致整份订阅不可用（推荐）
// false = 输出 [中转节点..., 未参与中转的节点]，脚本会自动重建
//         proxy-groups 里的悬空引用（按区域替换成该区域第一个中转节点）
const KEEP_ORIGINAL_NODES = true;


// ════════════════════════════════════════════════════════════
// 工具函数区（全部定义在顶层，任何环境入口都能用）
// ════════════════════════════════════════════════════════════

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 解析 ENTRY_NODE_TEXT → { "香港 01": "香港优化", ... }
function parseEntryNodes(text) {
  const map = {};
  String(text).split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .forEach(line => {
      const idx = line.indexOf(":");
      if (idx === -1) return;
      const name = line.slice(0, idx).trim();
      const ap = line.slice(idx + 1).trim();
      if (name && ap) map[name] = ap;
    });
  return map;
}

// 预编译区域匹配正则（别名可能含正则特殊字符，如括号）
const REGION_PATTERNS = REGION_ORDER.map(region => {
  const alt = (REGION_ALIASES[region] || []).map(escapeRegExp).join("|");
  return {
    region,
    testRe: new RegExp(`(${alt})\\s*\\d+(?=\\s|$)`),
    numRe:  new RegExp(`(${alt})\\s*(\\d+)(?=\\s|$)`)
  };
});

// "【高级】香港 01" → "香港"
function getRegionFromName(name) {
  if (!name) return null;
  const text = String(name);
  for (const p of REGION_PATTERNS) {
    if (p.testRe.test(text)) return p.region;
  }
  return null;
}

// "日本 02" → 2
function getNodeNumber(name) {
  if (!name) return null;
  const text = String(name);
  for (const p of REGION_PATTERNS) {
    const m = text.match(p.numRe);
    if (m) return parseInt(m[2], 10);
  }
  return null;
}

// "【高级】香港 01" → "香港 01"
function getNodeKey(name) {
  const region = getRegionFromName(name);
  if (!region) return null;
  const number = getNodeNumber(name);
  if (number === null) return null;
  return `${region} ${String(number).padStart(2, "0")}`;
}

function getRegionIndex(region) {
  const i = REGION_ORDER.indexOf(region);
  return i === -1 ? REGION_ORDER.length : i;
}

// server 含 "cf" 视为 Cloudflare 节点
function isCF(proxy) {
  return String(proxy && proxy.server || "").toLowerCase().includes("cf");
}

// 名字带"不参与中转"标记
function isUntouchedByName(name) {
  const text = String(name || "");
  return UNTOUCHED_NAME_MARKERS.some(m => text.includes(m));
}

// 剥离节点名末尾的入口点后缀（可能多层）："香港 01 - 香港优化 - 日本AWS" → "香港 01"
function stripEntrySuffixes(name) {
  let result = String(name || "");
  let changed = true;
  while (changed) {
    changed = false;
    for (const ap of ALL_ACCESS_POINTS) {
      const suffix = ` - ${ap}`;
      if (result.endsWith(suffix)) {
        result = result.slice(0, -suffix.length).trim();
        changed = true;
      }
    }
  }
  return result;
}

// ── 由配置派生的入口点结构 ──
// ALL_ACCESS_POINTS：所有出现的入口点名（各区域清单去重保序 + 手动指定）
const ALL_ACCESS_POINTS = (() => {
  const seen = new Set();
  const list = [];
  const push = ap => { if (ap && !SKIP_MARKERS.has(ap) && !seen.has(ap)) { seen.add(ap); list.push(ap); } };
  for (const region of REGION_ORDER) {
    for (const ap of (REGION_ALLOWED_ENTRIES[region] || [])) push(ap);
  }
  for (const ap of Object.keys(MANUAL_ENTRY_SERVERS)) push(ap);
  return list;
})();

// 每个区域的入口列表：直接取显式清单（默认项已在清单第一位），过滤跳过标记
const REGION_ENTRY_LISTS = (() => {
  const lists = {};
  for (const region of REGION_ORDER) {
    lists[region] = (REGION_ALLOWED_ENTRIES[region] || [])
      .filter(ap => ap && !SKIP_MARKERS.has(ap));
  }
  return lists;
})();

function regionSupportsAccessPoint(region, ap) {
  return (REGION_ENTRY_LISTS[region] || []).includes(ap);
}


// ════════════════════════════════════════════════════════════
// 核心逻辑：输入原节点数组 → 输出 [中转节点..., 保留节点...]
// ════════════════════════════════════════════════════════════

function processProxies(proxies) {
  const stats = { total: proxies.length, targets: 0, untouched: 0, entryMachines: 0, fallback: 0, generated: 0, renamed: 0 };
  const logs = [];

  // ── 第 1 步：单轮遍历，收集入口机 + 节点分类 ──
  const ENTRY_SERVERS = {};        // 入口点名 → { server, port, proxy }
  const targetNodes = [];          // 参与中转的落地节点
  const untouchedNodes = [];       // 原样保留的节点

  for (const proxy of proxies) {
    if (!proxy || !proxy.server) { untouchedNodes.push(proxy); continue; }
    const name = String(proxy.name || "");
    const nodeKey = getNodeKey(name);           // "香港 01"
    const ap = nodeKey ? ENTRY_NODE_MAP[nodeKey] : null;

    // 收集入口机（该节点在映射表里有对应入口点，且不是跳过项）
    if (ap && !SKIP_MARKERS.has(ap) && !(SKIP_CF && isCF(proxy))) {
      if (!ENTRY_SERVERS[ap]) {
        ENTRY_SERVERS[ap] = { server: proxy.server, port: proxy.port, proxy: proxy };
      }
    }

    // 分类
    const region = getRegionFromName(name);
    if (!region || !REGION_ENTRY_LISTS[region] || !REGION_ENTRY_LISTS[region].length
        || (SKIP_CF && isCF(proxy)) || isUntouchedByName(name)) {
      untouchedNodes.push(proxy);
    } else {
      targetNodes.push({ proxy, region, number: getNodeNumber(name) || 0 });
    }
  }

  // ── 第 2 步：解析每个入口点的入口机（手动 > 采集 > 兜底）──
  const nodeKeyProxy = new Map();   // "香港 01" → 完整 proxy（兜底用）
  for (const item of targetNodes) {
    const key = getNodeKey(item.proxy.name);
    if (key && !nodeKeyProxy.has(key)) nodeKeyProxy.set(key, item.proxy);
  }

  function resolveEntryServer(ap) {
    const manual = MANUAL_ENTRY_SERVERS[ap];
    if (manual) {
      return typeof manual === "string"
        ? { server: manual, port: null, proxy: { server: manual } }
        : manual;
    }
    if (ENTRY_SERVERS[ap]) return ENTRY_SERVERS[ap];
    if (ENABLE_ENTRY_SERVER_FALLBACK) {
      const m = /^(.+?)优化$/.exec(ap);
      if (m) {
        const fb = nodeKeyProxy.get(`${m[1]} 01`);
        if (fb) { stats.fallback++; return { server: fb.server, port: fb.port, proxy: fb }; }
      }
    }
    return null;
  }

  const RESOLVED = {};
  for (const ap of ALL_ACCESS_POINTS) {
    const ep = resolveEntryServer(ap);
    if (ep && ep.server) RESOLVED[ap] = ep;
  }
  stats.entryMachines = Object.keys(RESOLVED).length;
  for (const ap of ALL_ACCESS_POINTS) {
    if (!RESOLVED[ap]) logs.push(`⚠ 入口机缺失: ${ap}（该列不会生成中转节点）`);
  }

  // ── 第 3 步：目标节点排序（区域顺序 → 编号）──
  targetNodes.sort((a, b) =>
    getRegionIndex(a.region) - getRegionIndex(b.region) || a.number - b.number
  );

  // ── 第 4 步：交叉组合生成中转节点 ──
  const generatedNodes = [];
  const usedNames = new Set(untouchedNodes.map(p => p && p.name));
  const uniqueName = name => {
    if (!usedNames.has(name)) { usedNames.add(name); return name; }
    for (let i = 2; ; i++) {
      const n = `${name} #${i}`;
      if (!usedNames.has(n)) { usedNames.add(n); stats.renamed++; return n; }
    }
  };

  function pushRelay(entry, name) {
    const np = Object.assign({}, entry.proxy, { name: uniqueName(name) });
    generatedNodes.push(np);
  }

  if (SORT_MODE === 1) {
    for (const item of targetNodes) {
      const baseName = stripEntrySuffixes(item.proxy.name);
      for (const ap of REGION_ENTRY_LISTS[item.region]) {
        const entry = RESOLVED[ap];
        if (entry) pushRelay(entry, `${baseName} - ${ap}`);
      }
    }
  } else if (SORT_MODE === 2) {
    for (const ap of ALL_ACCESS_POINTS) {
      const entry = RESOLVED[ap];
      if (!entry) continue;
      for (const item of targetNodes) {
        if (regionSupportsAccessPoint(item.region, ap)) {
          pushRelay(entry, `${stripEntrySuffixes(item.proxy.name)} - ${ap}`);
        }
      }
    }
  } else {
    throw new Error(`SORT_MODE 必须是 1 或 2，当前值：${SORT_MODE}`);
  }
  stats.targets = targetNodes.length;
  stats.untouched = untouchedNodes.length;
  stats.generated = generatedNodes.length;

  // ── 第 5 步：输出 ──
  // KEEP_ORIGINAL_NODES=true  → 中转节点在前 + 全部原节点在后
  // KEEP_ORIGINAL_NODES=false → 中转节点在前 + 未参与中转的节点在后
  const originalOutput = KEEP_ORIGINAL_NODES ? proxies : untouchedNodes;
  const out = [...generatedNodes, ...originalOutput];

  // 自检日志
  console.log(`[substore.js v2.0] 输入 ${stats.total} | 参与中转 ${stats.targets} | 保留 ${stats.untouched} | ` +
    `入口机 ${stats.entryMachines}（兜底 ${stats.fallback}）| 生成中转 ${stats.generated} | 输出 ${out.length}` +
    (stats.renamed ? ` | 重名改写 ${stats.renamed}` : ""));
  logs.forEach(l => console.log(`[substore.js v2.0] ${l}`));
  return out;
}

const AIRPORT_DNS = {
  enable: true,
  ipv6: false,
  "enhanced-mode": "fake-ip",
  "fake-ip-range": "198.18.0.1/16",
  "use-hosts": true,
  "default-nameserver": ["223.5.5.5"],
  nameserver: ["https://223.5.5.5/dns-query"],
  "proxy-server-nameserver": [
    "https://domestic-dns.114514.nowhere-backend.xyz/dns-query/a9e09e225e08d7caa10001ac"
  ],
  fallback: ["https://223.5.5.5/dns-query"],
  "fallback-filter": {
    geoip: true,
    "geoip-code": "CN",
    ipcidr: [
      "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
      "169.254.0.0/16", "172.16.0.0/12", "192.168.0.0/16",
      "224.0.0.0/4", "240.0.0.0/4"
    ],
    domain: [
      "+.google.com", "+.facebook.com", "+.youtube.com",
      "+.githubusercontent.com", "+.googlevideo.com", "+.googleapis.cn"
    ]
  }
};


// 入口表解析（顶层一次性执行）
const ENTRY_NODE_MAP = parseEntryNodes(ENTRY_NODE_TEXT);

// ── Mihomo 覆写入口 ──
function main(config) {
  // 1) 节点生成（substore v2.0 同款逻辑，带幂等保护：
  //    输入若已是转换后订阅（节点名含 " - 接入点" 后缀占比>30%）则跳过生成，
  //    避免 206→1826 的重复交叉）
  const original = Array.isArray(config.proxies) ? config.proxies : [];
  const suffixed = original.filter(p => typeof p.name === "string" && / - [^ ]+/.test(p.name)).length;
  const alreadyConverted = original.length > 0 && suffixed / original.length > 0.3;
  const out = alreadyConverted ? original : processProxies(original);
  console.log("[nowhere_override] 输入 " + original.length + (alreadyConverted ? "（已转换，跳过生成）" : "（原订阅，生成交叉中转）") + " → 输出 " + out.length);
  config.proxies = out;

  // 2) DNS 完全照抄原订阅；无 dns 段（URI 链路）时注入机场原版
  if (!config.dns || !config.dns["proxy-server-nameserver"]) {
    config.dns = JSON.parse(JSON.stringify(AIRPORT_DNS));
  }

  // 3) 分组照抄原订阅，仅 select → smart（含 DIRECT/REJECT 的组保留 select）
  //    地区组（HK/JP/SG/TW/US 等）按区域词追加该地区全部中转节点
  //    区域词识别：节点名去掉 " - 接入点" 后缀、去掉末尾编号后的词（如 香港/日本）
  const regionWordOf = n => {
    // 中转节点名 "[高级] 🇭🇰 香港 01 - 香港优化" → 落地名 "[高级] 🇭🇰 香港 01" → 去编号 → "香港"
    const s = String(n);
    const m = /^(.+?)\s*\d+\s*-\s/.exec(s);
    if (m) {
      const base = m[1].trim();
      const m2 = /^(.*\D)\s*\d+$/.exec(base);
      return (m2 ? m2[1] : base).trim();
    }
    // 原节点/组名：去末尾编号取区域词（多词入口名场景由中转分支处理）
    const base = stripEntrySuffixes(s.replace(/\s*#\d+$/, ""));
    const m2b = /^(.*\D)\s*\d+$/.exec(base);
    return (m2b ? m2b[1] : base).trim();
  };
  const relayNames = (config.proxies || []).filter(p => String(p.name).includes(" - ")).map(p => p.name);
  const relayByRegionWord = {};
  for (const n of relayNames) {
    const w = regionWordOf(n);
    if (w && !relayByRegionWord[w]) relayByRegionWord[w] = n;
  }
  const groups = (config["proxy-groups"] || []).map(g => {
    const proxies = g.proxies || [];
    const hasBuiltin = proxies.some(
      p => p === "DIRECT" || p === "REJECT" || p === "PASS" || p === "COMPATIBLE"
    );
    // 地区组：组名是区域词（或引用里含区域词）且组内引用了原节点 → 追加该区域全部中转节点
    let extra = [];
    const refsRegionWord = proxies.map(regionWordOf).filter(Boolean);
    for (const w of refsRegionWord) {
      if (relayByRegionWord[w]) {
        for (const rn of relayNames) {
          if (regionWordOf(rn) === w && !extra.includes(rn)) extra.push(rn);
        }
      }
    }
    if (extra.length) {
      const merged = [...proxies, ...extra];
      if (g.type === "select" && !hasBuiltin)
        return Object.assign({}, g, { type: "smart", strategy: "sticky-sessions", proxies: merged });
      return Object.assign({}, g, { proxies: merged });
    }
    if (g.type === "select" && !hasBuiltin) {
      return Object.assign({}, g, { type: "smart", strategy: "sticky-sessions" });
    }
    return g;
  });
  config["proxy-groups"] = groups;
  return config;
}

// Sub-Store Script Operator 兼容入口
function operator(proxies) {
  return processProxies(proxies || []);
}
