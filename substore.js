// ============================================================
// Sub-Store Script Operator
// ============================================================
//
// 【脚本用途】
//   将订阅中原有的落地节点（如"香港 01"）按其所属区域分组，
//   与指定的中转入口点（Access Point，如"Sakura HK"）交叉组合，
//   生成"原节点名 - 入口点名"格式的新节点，实现一跳中转。
//
// 【运行环境】
//   Sub-Store 脚本操作器（Script Operator），全局变量 `proxies` 由 Sub-Store 注入。
//
// 【后续改动指引】
//   ┌─ 改入口点文本      → 修改 ACCESS_POINT_NODES_TEXT（L35）
//   ├─ 改入口点排列顺序  → 修改 ACCESS_POINT_ORDER（L61）
//   ├─ 改区域别名        → 修改 REGION_ALIASES（L72）
//   ├─ 改区域→入口组映射  → 修改 REGION_ACCESS_GROUP（L133）
//   ├─ 改入口组定义      → 修改 ACCESS_POINTS_HK_TW / SG / JP / EU（L107/L111/L117/L119）
//   ├─ 改区域排列顺序    → 修改 REGION_ORDER（L108）
//   ├─ 改排序模式        → 修改 SORT_MODE（L115）
//   └─ 改 CF 节点跳过    → 修改 SKIP_CF（L116）
//
// ============================================================


// ── 配置区 ─────────────────────────────────────────────────

// 节点→入口点映射文本：每行 "节点名:入口点名"
// 用途：识别哪些节点是"入口源节点"，并收集其 server 地址作为该入口点的中转地址
// 节点名格式：区域 + 空格 + 编号（如"香港 01"），编号需 padStart 为 2 位
// 多个节点映射到同一入口点时，首次出现的 server 生效（不覆盖）
// 改法：新增/删除行，确保节点名与订阅中实际节点名匹配
//
// 特殊值（不收集 server，节点不参与中转生成）：
//   仅原始线路 / 暂无可选接入点
//
const ACCESS_POINT_NODES_TEXT = `
香港 01:Sakura HK
香港 02:GCP SG
香港 03:AWS SG

台湾 01:HiNet TW
台湾 02:Stealth (Special)
台湾 03:(IPv6) Zouter JP

新加坡 01:Sakura HK
新加坡 02:Sakura HK
新加坡 03:GCP SG + AWS SG + HiNet TW + Stealth (Special) + (IPv6) Zouter JP

日本 01:GCP JP 02
日本 02:AWS JP
日本 03:BBTEC JP

美国 01:(IPv6) Zouter JP
美国 02:Zouter JP
美国 03:Zouter JP

德国 01:Frankfurt Eons
意大利 01:Frankfurt Eons
澳大利亚 01:Zouter JP
印度 01:Zouter JP
泰国 01:Zouter JP
巴西 01:Zouter JP
墨西哥 01:Zouter JP

实验 美国:GCP JP 01
`;

// 入口点排列顺序：决定生成节点中入口点的先后
// 改法：调整数组顺序，或新增/删除入口点名
// 注意：此处的名字必须与 ACCESS_POINT_NODES_TEXT 中冒号右侧一致
const ACCESS_POINT_ORDER = [
  "Sakura HK", "GCP SG", "AWS SG", "HiNet TW",
  "Stealth (Special)", "(IPv6) Zouter JP",
  "GCP SG + AWS SG + HiNet TW + Stealth (Special) + (IPv6) Zouter JP",
  "Zouter JP",
  "GCP JP 01", "GCP JP 02", "AWS JP", "BBTEC JP",
  "Frankfurt Eons"
];

// 区域别名表：用于从节点名中匹配区域
// 一个区域可以有多个别名（如"澳大利亚"匹配"澳大""澳洲"）
// 改法：新增区域时添加别名数组；增加别名时在数组中追加字符串
// 注意：别名不应互相包含（如不要同时有"澳大"和"澳大利亚"，否则正则歧义）
const REGION_ALIASES = {
  "香港": ["香港"],
  "台湾": ["台湾"],
  "新加坡": ["新加坡"],
  "日本": ["日本"],
  "美国": ["美国"],
  "德国": ["德国"],
  "意大利": ["意大利"],
  "泰国": ["泰国"],
  "澳大利亚": ["澳大利亚", "澳大", "澳洲"],
  "印度": ["印度"],
  "巴西": ["巴西"],
  "墨西哥": ["墨西哥"],
  "实验 香港": ["[实验] 香港", "[实验]香港", "实验 香港", "实验.香港", "实验-香港"],
  "实验 新加坡": ["[实验] 新加坡", "[实验]新加坡", "实验 新加坡", "实验.新加坡", "实验-新加坡"],
  "实验 美国": ["[实验] 美国", "[实验]美国", "实验 美国", "实验.美国", "实验-美国"],
  "实验 日本": ["[实验] 日本", "[实验]日本", "实验 日本", "实验.日本", "实验-日本"]
};

// 无编号区域：这些区域的节点名不含编号，匹配时不要求 \d+
const NO_NUMBER_REGIONS = new Set(["实验 香港", "实验 新加坡", "实验 美国", "实验 日本"]);

// 实验区域→基础区域名映射（用于模糊匹配：名字含"实验"+区域名即命中）
const EXP_REGION_BASE = {
  "实验 香港": "香港",
  "实验 新加坡": "新加坡",
  "实验 美国": "美国",
  "实验 日本": "日本"
};

// 入口组定义：每个组包含一组入口点，交叉组合时遍历这些入口点
// HK_TW 组：香港/台湾可用入口点（含独立 Stealth (Special)）
// SG 组：新加坡可用入口点（组合入口含 Stealth，无独立 Stealth）
// JP 组：日本/美国/远程区域可用入口点
// EU 组：欧洲区域可用入口点（德国/意大利）
// 改法：新增组时定义数组并在 ACCESS_POINT_GROUPS 中注册
// 注意：组名需与 REGION_ACCESS_GROUP 中的值一致
const ACCESS_POINTS_HK_TW = [
  "Sakura HK", "GCP SG", "AWS SG", "HiNet TW",
  "Stealth (Special)", "(IPv6) Zouter JP"
];
const ACCESS_POINTS_SG = [
  "Sakura HK", "GCP SG", "AWS SG", "HiNet TW",
  "(IPv6) Zouter JP",
  "GCP SG + AWS SG + HiNet TW + Stealth (Special) + (IPv6) Zouter JP"
];
const ACCESS_POINTS_JP = [
  "Zouter JP", "(IPv6) Zouter JP",
  "GCP JP 01", "GCP JP 02", "AWS JP", "BBTEC JP"
];
const ACCESS_POINTS_EU = [
  "Frankfurt Eons"
];
const ACCESS_POINTS_EXP_ASIA = [
  "Sakura HK", "GCP SG", "AWS SG", "HiNet TW", "(IPv6) Zouter JP"
];
const ACCESS_POINT_GROUPS = {
  HK_TW: ACCESS_POINTS_HK_TW,
  SG: ACCESS_POINTS_SG,
  JP: ACCESS_POINTS_JP,
  EU: ACCESS_POINTS_EU,
  EXP_ASIA: ACCESS_POINTS_EXP_ASIA
};

// 区域→入口组映射：决定每个区域使用哪组入口点进行交叉组合
// 改法：将区域映射到新组名，或新增区域时指定其所属组
// 注意：区域名需与 REGION_ORDER / REGION_ALIASES 中的 key 一致
const REGION_ACCESS_GROUP = {
  "香港": "HK_TW", "台湾": "HK_TW",
  "新加坡": "SG",
  "日本": "JP", "美国": "JP", "泰国": "JP",
  "澳大利亚": "JP", "印度": "JP", "巴西": "JP",
  "墨西哥": "JP",
  "德国": "EU", "意大利": "EU",
  "实验 香港": "EXP_ASIA", "实验 新加坡": "EXP_ASIA",
  "实验 美国": "JP", "实验 日本": "JP"
};

// 区域排列顺序：决定生成节点的排序（先按此顺序排区域，再按编号排）
// 改法：调整数组顺序或增删区域名
// 注意：需要与 REGION_ALIASES / REGION_ACCESS_GROUP 中的 key 保持一致
const REGION_ORDER = [
  "香港", "台湾", "新加坡", "日本", "美国",
  "德国", "意大利",
  "泰国", "澳大利亚", "印度", "巴西", "墨西哥",
  "实验 香港", "实验 新加坡", "实验 美国", "实验 日本"
];

// 排序模式：1 = 按节点优先（先遍历节点，每个节点铺开所有入口点）
//           2 = 按入口点优先（先遍历入口点，每个入口点铺开所有节点）
// 改法：改为 1 或 2
const SORT_MODE = 1;

// 是否跳过 Cloudflare 节点：true = server 含 "cf" 的节点不参与入口点收集和生成
// 改法：改为 false 则不跳过
const SKIP_CF = true;

// "跳过"标记：在 ACCESS_POINT_NODES_TEXT 中使用这些值的节点不收集 server、不参与生成
const SKIP_MARKERS = new Set([
  "仅原始线路",
  "暂无可选接入点"
]);


// ── 工具函数 ──────────────────────────────────────────────

// 解析入口点定义文本，返回 { "香港 01": "Sakura HK", ... }
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

// 转义正则特殊字符，防止别名中含 . ( ) 等导致误匹配
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 预编译区域匹配正则，避免每次调用都 new RegExp
// testRe 用于判断节点名是否属于某区域
// numRe  用于提取节点名中的区域编号
// 无编号区域（如"实验 香港"）不要求 \d+，直接全词匹配
const REGION_PATTERNS = REGION_ORDER.map(region => {
  const aliases = (REGION_ALIASES[region] || []).map(escapeRegExp);
  const alt = aliases.join("|");
  if (NO_NUMBER_REGIONS.has(region)) {
    // 无编号区域：匹配到字符串末尾或空格
    return {
      region,
      testRe: new RegExp(`(${alt})(?=\\s|$)`),
      numRe:  null
    };
  }
  return {
    region,
    testRe: new RegExp(`(${alt})\\s*\\d+(?=\\s|$)`),
    numRe:  new RegExp(`(${alt})\\s*(\\d+)(?=\\s|$)`)
  };
});

// 从节点名中提取区域，匹配不到返回 null
// 优先检查实验区域（模糊匹配：含"实验"+基础区域名）
// 再检查常规区域（正则匹配：区域名+编号）
function getRegionFromName(name) {
  if (!name) return null;
  const text = String(name);
  // 实验区域模糊匹配：名字含"实验"且含基础区域名
  if (text.includes("实验")) {
    for (const [expRegion, baseName] of Object.entries(EXP_REGION_BASE)) {
      if (text.includes(baseName)) return expRegion;
    }
  }
  // 常规区域正则匹配
  for (const p of REGION_PATTERNS) {
    if (NO_NUMBER_REGIONS.has(p.region)) continue; // 跳过实验区域（已用模糊匹配处理）
    if (p.testRe.test(text)) return p.region;
  }
  return null;
}

// 从节点名中提取编号（如"日本 02" → 2），匹配不到返回 null
// 无编号区域（如"实验 香港"）返回 0，用于排序
function getNodeNumber(name) {
  if (!name) return null;
  const text = String(name);
  for (const p of REGION_PATTERNS) {
    if (p.numRe) {
      const m = text.match(p.numRe);
      if (m) return parseInt(m[2], 10);
    }
  }
  return null;
}

// 生成节点唯一键：区域 + 2位编号（如"日本 01"）
// 无编号区域（如"实验 香港"）直接用区域名作为键
// 用于在 ACCESS_POINT_NODE_MAP 中查找对应入口点
function getNodeKey(name) {
  const region = getRegionFromName(name);
  if (!region) return null;
  // 无编号区域直接用区域名作为键
  if (NO_NUMBER_REGIONS.has(region)) return region;
  const number = getNodeNumber(name);
  if (number === null) return null;
  return `${region} ${String(number).padStart(2, "0")}`;
}

// 判断节点是否为 Cloudflare 节点（server 含 "cf"）
function isCF(proxy) {
  return !!proxy && !!proxy.server &&
    String(proxy.server).toLowerCase().includes("cf");
}

// 收集所有入口点名（从 ACCESS_POINT_NODES_TEXT 自动提取，排除跳过标记）
// 用于预构建 getBaseName 的后缀清理表
const ALL_ACCESS_POINTS = [
  ...new Set(Object.values(parseAccessPointNodes(ACCESS_POINT_NODES_TEXT)))
].filter(ap => !SKIP_MARKERS.has(ap));

// 预构建 suffix→length 表，避免 getBaseName 循环内重复拼接字符串
// 按长度降序排列，确保最长的后缀先被匹配
// （如先匹配" - GCP SG + AWS SG + HiNet TW + (IPv6) Zouter JP"再匹配" - GCP SG"）
const AP_SUFFIXES = ALL_ACCESS_POINTS
  .map(ap => ({ suffix: ` - ${ap}`, len: ap.length + 3 }))
  .sort((a, b) => b.suffix.length - a.suffix.length);

// 去除节点名末尾的入口点后缀（如"香港 01 - Sakura HK" → "香港 01"）
// 循环处理以应对多次拼接的情况
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

// 获取节点（去除后缀后）的区域，用于判断该节点属于哪个区域
function getBaseRegion(proxy) {
  return proxy?.name ? getRegionFromName(getBaseName(proxy.name)) : null;
}

// 获取区域在 REGION_ORDER 中的索引，用于排序
function getRegionIndex(region) {
  const i = REGION_ORDER.indexOf(region);
  return i === -1 ? 9999 : i;
}

// 预计算每个区域的可用入口点 Set
// 将数组转为 Set，后续 regionSupportsAccessPoint 用 has() O(1) 查找
const REGION_AP_SETS = {};
for (const region of REGION_ORDER) {
  const group = REGION_ACCESS_GROUP[region];
  const list = group ? (ACCESS_POINT_GROUPS[group] || []) : [];
  REGION_AP_SETS[region] = new Set(list);
}

// 判断某区域是否支持某入口点
function regionSupportsAccessPoint(region, ap) {
  return REGION_AP_SETS[region]?.has(ap) ?? false;
}


// ── 主逻辑 ────────────────────────────────────────────────

// 解析入口点定义文本 → 映射表
const ACCESS_POINT_NODE_MAP = parseAccessPointNodes(ACCESS_POINT_NODES_TEXT);

// 第一遍遍历：收集各入口点的 server 地址
// 遍历所有节点，通过节点名匹配 ACCESS_POINT_NODE_MAP 找到入口点名，
// 记录每个入口点对应的 server 地址（首次出现即固定，不覆盖）
// 匹配优先级：1) getNodeKey（区域+编号格式） 2) 去后缀后直接名称匹配（如"实验 美国"）
const ACCESS_POINT_SERVERS = {};
for (const proxy of proxies) {
  if (!proxy?.name) continue;
  const baseName = getBaseName(proxy.name);
  // 优先用 getNodeKey 匹配（区域+编号）
  let nodeKey = getNodeKey(baseName);
  // 回退：直接用名称匹配（用于无编号的特殊节点，如"实验 美国"）
  if (!nodeKey) nodeKey = baseName;
  const ap = ACCESS_POINT_NODE_MAP[nodeKey];
  if (!ap) continue;
  if (SKIP_MARKERS.has(ap)) continue;
  if (SKIP_CF && isCF(proxy)) continue;
  if (!proxy.server) continue;
  if (!ACCESS_POINT_SERVERS[ap]) {
    ACCESS_POINT_SERVERS[ap] = proxy.server;
  }
}

// 第二遍遍历：分类目标节点与保留原节点
// 有区域归属且有入口组映射且未被 CF 跳过的节点 → targetNodes（参与交叉组合）
// 其余节点 → untouchedNodes（原样保留追加到结果末尾）
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
    number: getNodeNumber(getBaseName(proxy.name)) ?? 0
  });
}

// 排序：先按区域顺序（REGION_ORDER），同区域内再按编号
targetNodes.sort((a, b) =>
  getRegionIndex(a.region) - getRegionIndex(b.region) ||
  a.number - b.number
);

// 生成新节点（交叉组合）
const generatedNodes = [];

if (SORT_MODE !== 1 && SORT_MODE !== 2) {
  throw new Error(`SORT_MODE 必须是 1 或 2，当前值：${SORT_MODE}`);
}

// SORT_MODE=1：按节点优先生成
// 外层遍历排序后的目标节点，内层遍历该区域可用的入口点
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

// SORT_MODE=2：按入口点优先生成
// 外层遍历入口点，内层遍历排序后的目标节点
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

// 最终输出：生成的中转节点在前，未处理的节点在后
return [...generatedNodes, ...untouchedNodes];