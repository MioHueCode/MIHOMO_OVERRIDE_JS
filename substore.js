// ============================================================
// Sub-Store / Mihomo 覆写两用脚本 —— 中转节点生成（v2.0 重写版）
// ============================================================
//
// 【v2.0 重写要点】
//   1. 干净结构：配置区 → 工具函数 → processProxies 核心逻辑 → 环境适配入口，
//      全部函数定义在顶层，无裸代码、无顶层 return（v1 在 Mihomo 覆写环境
//      会因 Illegal return statement 加载失败，导致整份订阅损坏 → 全部超时）
//   2. 双环境入口：operator(proxies) 适配 Sub-Store 脚本操作器；
//      main(config) 适配 Mihomo Party / Clash Verge Rev 覆写
//   3. 默认保留原落地节点（KEEP_ORIGINAL_NODES）：
//      - proxy-groups 的名字引用永远有效，不会出现悬空引用导致的加载失败
//      - 原节点本身实测可达，客户端可直接回退，不再"全靠中转"
//   4. 自检日志：运行时输出统计（入口机采集/兜底/生成数量/重名），
//      Mihomo Party 的覆写日志里可直接看到，出问题一眼定位
//   5. 重名防御：生成的中转节点名若与已有节点重复，自动追加序号
//
// 【中转机制说明】
//   入口机是独立的 VLESS/Reality 服务，只接受自己的 pbk/sid。
//   客户端用落地节点的 pbk/sid 连入口机 → 入口机不认识 → 握手回落真实网站 → 超时。
//   因此中转节点 = 入口机的完整参数（server/port/uuid/pbk/sid/sni 全复制），仅改名字。
//   功能上等同直接连入口机，名字里标注"落地节点 - 入口点"方便选择。
//
// 【使用方式】
//   Mihomo 覆写：在 Mihomo Party / Clash Verge Rev 里引用本文件即可
//   Sub-Store：脚本操作 → 引用本文件（自动走 operator 入口）
// ============================================================


// ════════════════════════════════════════════════════════════
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
澳洲 01:日本优化
墨西哥 01:日本优化
巴西 01:日本优化
`;

// ── 2. 各区域的"默认优化入口"（排在该区域入口列表第一位）──
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

// ── 3. 共享入口组 ──
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

// ── 6. 区域 → 共享入口组映射 ──
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
// ALL_ACCESS_POINTS：所有入口点名（默认项 + 共享组，去重保序）
const ALL_ACCESS_POINTS = (() => {
  const seen = new Set();
  const list = [];
  const push = ap => { if (ap && !SKIP_MARKERS.has(ap) && !seen.has(ap)) { seen.add(ap); list.push(ap); } };
  for (const region of REGION_ORDER) push(REGION_DEFAULT_ENTRY[region]);
  for (const group of Object.keys(SHARED_ENTRY_GROUPS)) {
    for (const ap of SHARED_ENTRY_GROUPS[group]) push(ap);
  }
  for (const ap of Object.keys(MANUAL_ENTRY_SERVERS)) push(ap);
  return list;
})();

// 每个区域的入口列表：[默认项, ...所在共享组的其余项]（过滤跳过标记）
const REGION_ENTRY_LISTS = (() => {
  const lists = {};
  for (const region of REGION_ORDER) {
    const group = SHARED_ENTRY_GROUPS[REGION_ACCESS_GROUP[region]] || [];
    const ordered = [];
    const def = REGION_DEFAULT_ENTRY[region];
    if (def && !SKIP_MARKERS.has(def)) ordered.push(def);
    for (const ap of group) {
      if (!SKIP_MARKERS.has(ap) && ap !== def) ordered.push(ap);
    }
    lists[region] = ordered;
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


// ════════════════════════════════════════════════════════════
// 环境适配入口
// ════════════════════════════════════════════════════════════

// Sub-Store 脚本操作器：官方约定 operator(proxies, targetPlatform, context)
function operator(proxies, targetPlatform, context) {
  return processProxies(proxies || []);
}

// Mihomo 覆写：约定 main(config)，返回修改后的 config
// KEEP_ORIGINAL_NODES=true 时原节点全保留，groups/rules 引用不受影响；
// false 时自动重建 proxy-groups 里的悬空节点引用（按区域替换为该区域第一个中转节点）
function main(config) {
  const original = Array.isArray(config.proxies) ? config.proxies : [];
  const out = processProxies(original);
  config.proxies = out;

  if (!KEEP_ORIGINAL_NODES && Array.isArray(config["proxy-groups"])) {
    const outNames = new Set(out.map(p => p && p.name));
    const builtin = new Set(["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE"]);
    const groupNames = new Set(config["proxy-groups"].map(g => g && g.name));
    const relayNames = out.filter(p => String(p.name).includes(" - ")).map(p => p.name);
    // 区域词 = 节点名去掉入口后缀、去掉末尾编号后的最后一个词
    const regionWordOf = n => {
      const base = stripEntrySuffixes(String(n).replace(/\s*#\d+$/, ""));
      const m = /^(.*\D)\s*\d+$/.exec(base);
      return (m ? m[1] : base).trim().split(/\s+/).pop();
    };
    const relayByRegionWord = {};
    for (const n of relayNames) {
      const w = regionWordOf(n);
      if (w && !relayByRegionWord[w]) relayByRegionWord[w] = n;
    }
    for (const g of config["proxy-groups"]) {
      if (!Array.isArray(g.proxies)) continue;
      g.proxies = g.proxies.map(ref => {
        if (typeof ref !== "string" || outNames.has(ref) || builtin.has(ref) || groupNames.has(ref)) return ref;
        const rep = relayByRegionWord[regionWordOf(ref)];
        if (rep) { console.log(`[substore.js v2.0] 组 "${g.name}" 悬空引用 "${ref}" → "${rep}"`); return rep; }
        console.log(`[substore.js v2.0] 组 "${g.name}" 引用 "${ref}" 无法替换，保留原样`);
        return ref;
      });
    }
  }
  return config;
}

const ENTRY_NODE_MAP = parseEntryNodes(ENTRY_NODE_TEXT);
