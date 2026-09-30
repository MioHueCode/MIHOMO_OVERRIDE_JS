// ============================================================
// Sub-Store Script Operator
// ============================================================

const ACCESS_POINT_NODES_TEXT = `
香港 01:Sakura HK
香港 02:GCP SG
香港 03:AWS SG

台湾 01:HiNet TW
台湾 02:Stealth (Special)
台湾 03:Zouter JP V6

日本 01:Zouter JP
日本 02:GCP JP 01
日本 03:GCP JP 02

美国 01:AWS JP
美国 02:BBTEC JP
`;

const ACCESS_POINT_ORDER = [
  "Zouter JP V6", "Zouter JP", "GCP JP 01", "GCP JP 02",
  "AWS JP", "BBTEC JP",
  "Sakura HK", "GCP SG", "AWS SG",
  "HiNet TW", "Stealth (Special)"
];

const REGION_ALIASES = {
  "香港": ["香港"],
  "台湾": ["台湾"],
  "新加坡": ["新加坡"],
  "日本": ["日本"],
  "美国": ["美国"],
  "泰国": ["泰国"],
  "澳大利亚": ["澳大利亚", "澳大", "澳洲"],
  "印度": ["印度"],
  "巴西": ["巴西"]
};

const ACCESS_POINTS_ASIA = [
  "Sakura HK", "GCP SG", "AWS SG",
  "HiNet TW", "Stealth (Special)", "Zouter JP V6"
];

const ACCESS_POINTS_JP = [
  "Zouter JP", "GCP JP 01", "GCP JP 02",
  "AWS JP", "BBTEC JP", "Zouter JP V6"
];

const ACCESS_POINT_GROUPS = {
  ASIA: ACCESS_POINTS_ASIA,
  JP: ACCESS_POINTS_JP
};

const REGION_ACCESS_GROUP = {
  "香港": "ASIA", "台湾": "ASIA", "新加坡": "ASIA",
  "日本": "JP", "美国": "JP", "泰国": "JP",
  "澳大利亚": "JP", "印度": "JP", "巴西": "JP"
};

const REGION_ORDER = [
  "香港", "台湾", "新加坡", "日本", "美国",
  "泰国", "澳大利亚", "印度", "巴西"
];

const SORT_MODE = 1;
const SKIP_CF = true;

// ── 工具函数 ──────────────────────────────────────────────

function parseAccessPointNodes(text) {
  const map = {};
  text.split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .forEach(line => {
      const idx = line.indexOf(":");
      if (idx === -1) return;
      const name = line.slice(0, idx).trim();
      const ap  = line.slice(idx + 1).trim();
      if (name && ap) map[name] = ap;
    });
  return map;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 预编译区域匹配正则，避免每次调用都 new RegExp
const REGION_PATTERNS = REGION_ORDER.map(region => {
  const aliases = (REGION_ALIASES[region] || []).map(escapeRegExp);
  const alt = aliases.join("|");
  return {
    region,
    testRe: new RegExp(`${alt}\\s*\\d+(?=\\s|$)`),
    numRe:  new RegExp(`(${alt})\\s*(\\d+)(?=\\s|$)`)
  };
});

function getRegionFromName(name) {
  if (!name) return null;
  const text = String(name);
  for (const p of REGION_PATTERNS) {
    if (p.testRe.test(text)) return p.region;
  }
  return null;
}

function getNodeNumber(name) {
  if (!name) return null;
  const text = String(name);
  for (const p of REGION_PATTERNS) {
    const m = text.match(p.numRe);
    if (m) return parseInt(m[2], 10);
  }
  return null;
}

function getNodeKey(name) {
  const region = getRegionFromName(name);
  const number = getNodeNumber(name);
  if (!region || number === null) return null;
  return `${region} ${String(number).padStart(2, "0")}`;
}

function isCF(proxy) {
  return !!proxy && !!proxy.server &&
    String(proxy.server).toLowerCase().includes("cf");
}

// 预构建 suffix→length 表，避免循环内重复拼接字符串
const AP_SUFFIXES = ACCESS_POINT_ORDER.map(ap => ({
  suffix: ` - ${ap}`,
  len: ap.length + 3  // " - ".length === 3
}));

function getBaseName(name) {
  if (!name) return "";
  let result = String(name);
  let changed = true;
  while (changed) {
    changed = false;
    for (const { suffix, len } of AP_SUFFIXES) {
      if (result.endsWith(suffix)) {
        result = result.slice(0, -len).trim();
        changed = true;
      }
    }
  }
  return result;
}

function getBaseRegion(proxy) {
  return proxy?.name ? getRegionFromName(getBaseName(proxy.name)) : null;
}

function getRegionIndex(region) {
  const i = REGION_ORDER.indexOf(region);
  return i === -1 ? 9999 : i;
}

// 预计算每个区域的可用入口点 Set，避免每次 regionSupportsAccessPoint 都遍历数组
const REGION_AP_SETS = {};
for (const region of REGION_ORDER) {
  const group = REGION_ACCESS_GROUP[region];
  const list = group ? (ACCESS_POINT_GROUPS[group] || []) : [];
  REGION_AP_SETS[region] = new Set(list);
}

function regionSupportsAccessPoint(region, ap) {
  return REGION_AP_SETS[region]?.has(ap) ?? false;
}

// ── 主逻辑 ────────────────────────────────────────────────

const ACCESS_POINT_NODE_MAP = parseAccessPointNodes(ACCESS_POINT_NODES_TEXT);

// 第一遍：收集各入口点的 server 地址
const ACCESS_POINT_SERVERS = {};
for (const proxy of proxies) {
  if (!proxy?.name) continue;
  const nodeKey = getNodeKey(proxy.name);
  if (!nodeKey) continue;
  const ap = ACCESS_POINT_NODE_MAP[nodeKey];
  if (!ap) continue;
  if (SKIP_CF && isCF(proxy)) continue;
  if (!proxy.server) continue;
  if (!ACCESS_POINT_SERVERS[ap]) {
    ACCESS_POINT_SERVERS[ap] = proxy.server;
  }
}

// 第二遍：分类目标节点与保留原节点
const targetNodes = [];
const untouchedNodes = [];

for (const proxy of proxies) {
  if (!proxy) continue;
  const region = getBaseRegion(proxy);
  if (!region || !REGION_AP_SETS[region] ||
      (SKIP_CF && isCF(proxy))) {
    untouchedNodes.push(proxy);
    continue;
  }
  targetNodes.push({
    proxy, region,
    number: getNodeNumber(getBaseName(proxy.name)) ?? 9999
  });
}

targetNodes.sort((a, b) =>
  getRegionIndex(a.region) - getRegionIndex(b.region) ||
  a.number - b.number
);

// 生成节点
const generatedNodes = [];

if (SORT_MODE !== 1 && SORT_MODE !== 2) {
  throw new Error(`SORT_MODE 必须是 1 或 2，当前值：${SORT_MODE}`);
}

function generateForNode(item) {
  const { proxy, region } = item;
  const baseName = getBaseName(proxy.name);
  for (const ap of ACCESS_POINT_ORDER) {
    if (!regionSupportsAccessPoint(region, ap)) continue;
    const server = ACCESS_POINT_SERVERS[ap];
    if (!server) continue;
    const np = JSON.parse(JSON.stringify(proxy));
    np.server = server;
    np.name = `${baseName} - ${ap}`;
    generatedNodes.push(np);
  }
}

function generateForAccessPoint(ap) {
  const server = ACCESS_POINT_SERVERS[ap];
  if (!server) return;
  for (const item of targetNodes) {
    if (!regionSupportsAccessPoint(item.region, ap)) continue;
    const baseName = getBaseName(item.proxy.name);
    const np = JSON.parse(JSON.stringify(item.proxy));
    np.server = server;
    np.name = `${baseName} - ${ap}`;
    generatedNodes.push(np);
  }
}

if (SORT_MODE === 1) {
  for (const item of targetNodes) generateForNode(item);
} else {
  for (const ap of ACCESS_POINT_ORDER) generateForAccessPoint(ap);
}

return [...generatedNodes, ...untouchedNodes];