// ============================================================
// Sub-Store Script Operator —— 中转节点生成脚本
// 适配：机场主已下线【实验】节点、调整接入点列表（新增 日本 GCP A/B）
// ============================================================
//
// 【核心语义（原版映射表语义）】
//   `节点名:入口点名` 表示：该入口点的"入口机地址" = 该节点的 server
//   例：`香港 02:新加坡GCP` → "新加坡GCP"入口机 = 香港02 的 server
//
// 【中转机制】
//   入口机在「落地节点自己的 port」上做 TCP 转发，转发到落地节点的 server:port。
//   客户端用落地节点的 pbk/sid/sni 连接「入口机地址:落地port」，
//   TLS 握手穿透到落地节点，由落地节点处理 Reality。
//   → 因此：以落地节点为基础，只换 server（入口机地址），
//     保留落地节点的 port 和全部 Reality 参数（pbk/sid/sni/uuid）。
//   → 不能换 port！换了 port 就连到入口机自己的 VLESS 服务，pbk 不匹配 → 回退真实网站。
//
// 【区域分组（只有两组）】
//   HK 组：香港 / 台湾 / 新加坡 / 意大利
//   ZJ 组：日本 / 美国 / 印度 / 泰国 / 澳洲 / 墨西哥 / 巴西
//
// 【Sub-Store 运行环境】
//   订阅解析出的节点数组注入到全局变量 `proxies`，脚本最后 return 新数组替换输出。
// ============================================================


// ── 1. 节点 → 当前接入点映射表 ─────────────────────────────
// 左边 = 订阅里实际存在的落地节点名；右边 = 官网该节点当前选中的接入点名。
// 多个节点映射到同一入口点时，只记录第一次出现的 server（不覆盖）。
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

新加坡 01:日本AWS
新加坡 02:新加坡AWS
新加坡 03:日本AWS

美国 01:美国优化
美国 02:日本软银
美国 03:(IPv6)新加坡AWS

意大利 01:(IPv6)日本AWS
印度 01:日本优化
泰国 01:日本优化
澳洲 01:日本优化
墨西哥 01:日本优化
巴西 01:日本优化
`;

// ── 2. 各区域"默认优化入口" ─────────────────────────────────
// 官网每组节点第一个选项是"(默认)XX优化"，不同区域默认不同。
// 该默认入口会排在该区域入口列表的第一位。
const REGION_DEFAULT_ENTRY = {
  "香港":    "香港优化",
  "台湾":    "台湾优化",
  "新加坡":  "新加坡优化",
  "意大利":  "香港优化",
  "日本":    "日本优化",
  "美国":    "美国优化",
  "印度":    "日本优化",
  "泰国":    "日本优化",
  "澳洲":    "日本优化",
  "墨西哥":  "日本优化",
  "巴西":    "日本优化"
};

// ── 3. 两组共享入口（默认优化入口之外的固定入口） ──────────
const SHARED_ENTRY_GROUPS = {
  HK: [
    "新加坡GCP", "新加坡AWS", "台湾HiNet", "(实验性)特殊入口",
    "日本AWS",
    "(IPv6)日本优化", "(IPv6)日本AWS", "(IPv6)新加坡AWS"
  ],
  ZJ: [
    "日本GCP A", "日本GCP B", "日本AWS", "日本软银",
    "(IPv6)日本优化", "(IPv6)日本AWS", "(IPv6)新加坡AWS"
  ]
};

// ── 4. 区域 → 组映射 ───────────────────────────────────────
const REGION_ACCESS_GROUP = {
  "香港": "HK", "台湾": "HK", "新加坡": "HK", "意大利": "HK",
  "日本": "ZJ", "美国": "ZJ", "印度": "ZJ", "泰国": "ZJ",
  "澳洲": "ZJ", "墨西哥": "ZJ", "巴西": "ZJ"
};

// ── 5. 区域排列顺序（决定最终输出顺序） ────────────────────
const REGION_ORDER = [
  "香港", "日本", "台湾", "新加坡", "美国",
  "印度", "泰国", "意大利", "澳洲", "墨西哥", "巴西"
];

// ── 6. 区域别名（从节点名识别区域） ────────────────────────
const REGION_ALIASES = {
  "香港":   ["香港"],
  "台湾":   ["台湾"],
  "新加坡": ["新加坡"],
  "意大利": ["意大利"],
  "日本":   ["日本"],
  "美国":   ["美国"],
  "印度":   ["印度"],
  "泰国":   ["泰国"],
  "澳洲":   ["澳洲", "澳大利亚", "澳大"],
  "墨西哥": ["墨西哥"],
  "巴西":   ["巴西"]
};

// ── 7. "跳过"标记（这些接入点值表示节点只能走原始线路，不参与中转） ──
const SKIP_MARKERS = new Set(["仅原始线路", "暂无可选接入点"]);

// ── 8. 是否跳过 Cloudflare 节点 ────────────────────────────
const SKIP_CF = true;


// ── 工具函数 ───────────────────────────────────────────────

function parseEntryNodes(text) {
  const map = {};
  text.split("\n").map(l => l.trim()).filter(Boolean).forEach(line => {
    const idx = line.indexOf(":");
    if (idx === -1) return;
    const name = line.slice(0, idx).trim();
    const ap = line.slice(idx + 1).trim();
    if (name && ap) map[name] = ap;
  });
  return map;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 预编译区域正则（含编号提取）
const REGION_PATTERNS = REGION_ORDER.map(region => {
  const aliases = (REGION_ALIASES[region] || []).map(escapeRegExp);
  const alt = aliases.join("|");
  return {
    region,
    testRe: new RegExp(`(${alt})`),
    numRe: new RegExp(`(${alt})\\s*(\\d+)`)
  };
});

function getRegionFromName(name) {
  if (!name) return null;
  // 先匹配带编号的，避免"意大利"被"澳大"等误配（这里按 REGION_ORDER 顺序，先精确匹配）
  for (const p of REGION_PATTERNS) {
    if (p.numRe.test(name)) return p.region;
  }
  for (const p of REGION_PATTERNS) {
    if (p.testRe.test(name)) return p.region;
  }
  return null;
}

function getNodeNumber(name) {
  if (!name) return 0;
  for (const p of REGION_PATTERNS) {
    const m = p.numRe.exec(name);
    if (m) return parseInt(m[2], 10);
  }
  return 0;
}

function getNodeKey(name) {
  const region = getRegionFromName(name);
  if (!region) return name;
  const number = getNodeNumber(name);
  return number ? `${region} ${String(number).padStart(2, "0")}` : region;
}

// 判断节点名是否为"仅原始线路"标记（基础节点不带"高级"标记）
function isUntouchedByName(name) {
  return name.includes("[基础]") || name.includes("[Basic]");
}

function isCF(proxy) {
  const s = (proxy.server || "").toLowerCase();
  return s.includes("cf") || s.includes("cloudflare");
}


// ── 主逻辑 ─────────────────────────────────────────────────

const ENTRY_NODE_MAP = parseEntryNodes(ENTRY_NODE_TEXT);

// 区域 → 入口列表（默认入口 + 组共享入口，去重）
const REGION_ENTRY_LISTS = {};
for (const region of REGION_ORDER) {
  const group = REGION_ACCESS_GROUP[region];
  const def = REGION_DEFAULT_ENTRY[region];
  const shared = SHARED_ENTRY_GROUPS[group] || [];
  const list = [];
  if (def && !list.includes(def)) list.push(def);
  for (const ap of shared) if (!list.includes(ap)) list.push(ap);
  REGION_ENTRY_LISTS[region] = list;
}

const REGION_AP_SETS = {};
for (const region of REGION_ORDER) {
  REGION_AP_SETS[region] = new Set(REGION_ENTRY_LISTS[region]);
}

// 全量入口点顺序（用于兜底解析）
const ACCESS_POINT_ORDER = (() => {
  const out = [];
  for (const region of REGION_ORDER) {
    for (const ap of REGION_ENTRY_LISTS[region]) {
      if (!out.includes(ap)) out.push(ap);
    }
  }
  return out;
})();

// ── 第 1 步：收集入口机地址（只存 server，第一次出现） ──
const ENTRY_SERVERS = {};
const targetNodes = [];
const untouchedNodes = [];

for (const proxy of proxies) {
  if (!proxy || !proxy.name) { untouchedNodes.push(proxy); continue; }

  const baseName = proxy.name.replace(/\[.*?\]\s*/g, "").replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]\s*/g, "").trim();
  const region = getRegionFromName(baseName);
  const nodeKey = getNodeKey(baseName);
  const cf = SKIP_CF ? isCF(proxy) : false;
  const untouched = isUntouchedByName(proxy.name);   // ★ 用原始名字判断（含 [基础] 标记）

  // 入口机收集：查映射表，找到该节点当前接入点，记录 server（第一次出现）
  const ap = ENTRY_NODE_MAP[nodeKey];
  if (ap && !SKIP_MARKERS.has(ap) && !cf && !untouched && proxy.server) {
    if (!ENTRY_SERVERS[ap]) {
      ENTRY_SERVERS[ap] = proxy.server;   // ★ 只存 server 字符串，不存 port
    }
  }

  // 节点分类
  if (!region || !REGION_AP_SETS[region] || cf || untouched) {
    untouchedNodes.push(proxy);
    continue;
  }
  targetNodes.push({ proxy, region, number: getNodeNumber(baseName) });
}

// ── 第 2 步：解析入口机地址（采集 > 兜底） ──
// 兜底："XX优化" 找不到入口机时，借 "XX 01" 节点的 server
const nodeKeyServerMap = new Map();
for (const item of targetNodes) {
  const key = getNodeKey(item.proxy.name.replace(/\[.*?\]\s*/g, "").replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]\s*/g, "").trim());
  if (key && item.proxy.server && !nodeKeyServerMap.has(key)) {
    nodeKeyServerMap.set(key, item.proxy.server);
  }
}

const RESOLVED_ENTRY_SERVERS = {};
for (const ap of ACCESS_POINT_ORDER) {
  if (ENTRY_SERVERS[ap]) {
    RESOLVED_ENTRY_SERVERS[ap] = ENTRY_SERVERS[ap];
  } else {
    const m = /^(.+?)优化$/.exec(ap);
    if (m) {
      const fallback = nodeKeyServerMap.get(`${m[1]} 01`);
      if (fallback) RESOLVED_ENTRY_SERVERS[ap] = fallback;
    }
  }
}

// ── 第 3 步：排序（区域顺序 → 编号） ──
const REGION_INDEX_MAP = new Map(REGION_ORDER.map((r, i) => [r, i]));
targetNodes.sort((a, b) => {
  const ia = REGION_INDEX_MAP.get(a.region) ?? 9999;
  const ib = REGION_INDEX_MAP.get(b.region) ?? 9999;
  return ia - ib || a.number - b.number;
});

// ── 第 4 步：交叉组合生成中转节点 ──
// ★ 以落地节点为基础，只换 server（入口机地址），不换 port。
//   保留落地节点的 port / pbk / sid / sni / uuid 等全部 Reality 参数。
function cloneProxyWithRelay(proxy, entryServer, name) {
  const np = { ...proxy };
  np.server = entryServer;   // ★ 只换 server
  np.name = name;
  return np;
}

const generatedNodes = [];
for (const item of targetNodes) {
  const { proxy, region } = item;
  const baseName = proxy.name.replace(/\[.*?\]\s*/g, "").replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]\s*/g, "").trim();
  for (const ap of REGION_ENTRY_LISTS[region]) {
    const entryServer = RESOLVED_ENTRY_SERVERS[ap];
    if (!entryServer) continue;
    generatedNodes.push(cloneProxyWithRelay(proxy, entryServer, `${baseName} - ${ap}`));
  }
}

// ── 第 5 步：输出（中转节点在前，保留节点在后） ──
return [...generatedNodes, ...untouchedNodes];
