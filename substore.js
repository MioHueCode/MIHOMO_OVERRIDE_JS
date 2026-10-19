// ============================================================
// Sub-Store Script Operator —— 中转节点生成脚本
// 适配：机场主已下线【实验】节点、调整了接入点列表（新增 日本 GCP A/B）
// ============================================================
//
// 【整体思路】
//   机场给你一批落地节点（如"香港 01""日本 02"），每个节点有自己真实的服务器地址。
//   但你可能想从"香港优化"这个入口点进去，再落地到"日本 02"——这就是一跳中转。
//
//   这个脚本干的事就是：
//   1. 找到每个入口点（如"香港优化"）对应的那台入口机地址（从另一个落地节点的 server 里拿）
//   2. 把所有落地节点 × 它们能用的入口点 交叉组合
//   3. 每个组合生成一个新节点：名字是"落地节点名 - 入口点名"，server 改成入口机地址
//   4. 【基础】节点、公告节点等不参与中转的节点原样保留，排到最后
//
// 【举例】
//   落地节点"香港 01"（server: 152.175.13.85:57422）
//   入口点"新加坡 AWS"对应的入口机地址是 aws-sg 那台
//   → 生成新节点：名字="香港 01 - 新加坡AWS"，server=aws-sg那台
//   你连这个新节点时，流量先进 aws-sg 入口机，再转发到香港 01 落地机
//
// 【本次改动要点】（对照机场接入点切换页面）
//   ① 删除全部【实验】区域（实验 香港 / 新加坡 / 日本 / 美国 已下线）
//   ② 入口点列表更新：
//        · 日本 GCP 拆成 "日本GCP A" / "日本GCP B"
//        · 新增"区域默认优化入口"：香港优化 / 台湾优化 / 新加坡优化 / 日本优化 / 美国优化
//        · 保留 新加坡GCP / 新加坡AWS / 台湾HiNet / (实验性)特殊入口 / 日本AWS / 日本软银
//        · 保留 IPv6 三件套：(IPv6)日本优化 / (IPv6)日本AWS / (IPv6)新加坡AWS
//   ③ "默认优化"入口按区域区分：
//        香港/意大利 → 香港优化    台湾 → 台湾优化    新加坡 → 新加坡优化
//        日本/美国/印度/泰国/澳洲/墨西哥/巴西 → 日本优化
//   ④ 【基础】节点只支持原始线路 → 不参与中转，原样保留
//   ⑤ 新增 意大利 / 澳洲（原澳大利亚）等其它地区
//
// 【后续改动指引】
//   ┌─ 改节点→接入点映射   → 改 ENTRY_NODE_TEXT
//   ├─ 改区域默认优化入口   → 改 REGION_DEFAULT_ENTRY
//   ├─ 改共享入口组        → 改 SHARED_ENTRY_GROUPS
//   ├─ 改区域别名          → 改 REGION_ALIASES
//   ├─ 改区域→入口组映射    → 改 REGION_ACCESS_GROUP
//   ├─ 改区域排列顺序      → 改 REGION_ORDER
//   ├─ 改入口机地址（手动）  → 改 MANUAL_ENTRY_SERVERS
//   ├─ 改排序模式          → 改 SORT_MODE
//   └─ 改 CF 节点跳过      → 改 SKIP_CF
//
// 【运行环境】
//   Sub-Store 脚本操作器（Script Operator）
//   Sub-Store 会把订阅里解析出的节点数组注入到全局变量 `proxies`
//   脚本最后 `return` 一个新数组，Sub-Store 用它替换原订阅输出
//
// 【性能说明】
//   ① 每个节点的 基础名/区域/编号/查找键/CF标记 只计算一次，缓存在 proxyMetaCache
//   ② 两轮主循环合并为一轮，单次遍历同时完成入口机收集与节点分类
//   ③ 生成新节点用浅拷贝 {...proxy} 替代深拷贝（只改顶层 server/name，嵌套对象共享引用无副作用）
//   ④ 区域排序索引 REGION_INDEX_MAP 用 Map O(1) 查找
//   ⑤ 区域正则与入口后缀表在启动时预编译一次
//
// ============================================================


// ── 配置区 ─────────────────────────────────────────────────
// 下面全是你可以改的配置项，改完不需要动后面的代码逻辑

// ── 1. 节点 → 当前接入点映射表 ──
// 左边是订阅里实际存在的落地节点名，右边是官网"接入点切换"页面上该节点当前选中的入口点名。
//
// 脚本用这张表做两件事：
//   ① 找到这个落地节点的 server 地址 → 记为该入口点的"入口机地址"
//      例：官网显示"香港 01 → 香港优化"，脚本就把"香港 01"的 server 当作"香港优化"入口机
//   ② 收集完后，所有落地节点都能从这些入口点进
//
// 若某个节点的接入点是"仅支持原始线路"（基础节点基本都是），就不要写进这张表
//   → 脚本不收集它的 server，它也不会被拿来做中转
//
// 多个节点映射到同一入口点时，只记录第一个出现的 server（不覆盖）
//
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
美国 02:日本软银
美国 03:(IPv6)日本优化

意大利 01:(IPv6)日本AWS
印度 01:(IPv6)新加坡AWS
泰国 01:日本优化
澳洲 01:日本优化
墨西哥 01:日本优化
巴西 01:日本优化
`;

// ── 2. 各区域的"默认优化入口" ──
// 官网页面上每组节点的第一个选项是"(默认)XX优化"，不同区域默认不同：
//   香港 / 意大利 → 香港优化
//   台湾         → 台湾优化
//   新加坡       → 新加坡优化
//   日本 / 美国 / 印度 / 泰国 / 澳洲 / 墨西哥 / 巴西 → 日本优化
//
// 这个"默认入口"会被排在该区域入口列表的第一位（生成节点时也排在前面）
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
// 除去"区域默认优化入口"外，每种区域还共享一批固定入口点。
// 实测页面（不区分区域默认项）只分两组：
//   HK 组：香港 / 台湾 / 新加坡 / 意大利
//   ZJ 组：日本 / 美国 / 印度 / 泰国 / 澳洲 / 墨西哥 / 巴西
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
// 用来从节点名里识别"这个节点属于哪个区域"
// 订阅里可能写"香港 01"也可能写"【高级】香港 01"，只要名字里含"香港"就能识别。
// 注意：别名之间不要互相包含，避免正则歧义
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

// ── 5. 区域排列顺序 ──
// 决定最终输出节点列表里各区域的先后（与官网页面的分组顺序一致）
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
// 1 = 按节点优先：先遍历落地节点，每个节点铺开它所有能用的入口点
//     效果：香港 01-香港优化, 香港 01-新加坡GCP, 香港 02-香港优化...
// 2 = 按入口点优先：先遍历入口点，每个入口点铺开它所有能用的落地节点
//     效果：香港 01-香港优化, 香港 02-香港优化, 台湾 01-香港优化...
const SORT_MODE = 1;

// ── 8. 是否跳过 Cloudflare 节点 ──
// true  = server 地址里含"cf"的节点不参与入口点收集和中转生成（CF 节点通常不能中转）
const SKIP_CF = true;

// ── 9. "跳过"标记 ──
// ENTRY_NODE_TEXT 里若写了这些值，表示该节点只能走原始线路、没有中转入口 → 跳过
const SKIP_MARKERS = new Set([
  "仅原始线路",
  "仅支持原始线路",
  "暂无可选接入点"
]);

// ── 10. "不参与中转"的节点名标记 ──
// 名字里带这些词的节点，无论能否识别区域，都原样保留、不参与中转生成。
// 依据：页面显示【基础】节点"仅支持原始线路（原始线路）"，无法作为落地节点做中转
const UNTOUCHED_NAME_MARKERS = ["基础"];

// ── 11. 手动指定入口机地址（可选覆盖） ──
// 某些入口点在订阅里找不到对应节点（没有节点正在使用它），就采集不到入口机地址。
// 这时可以在这里手动填写，格式： "入口点名": "入口机域名或IP"
// 填了就以这里为准，优先级最高
const MANUAL_ENTRY_SERVERS = {
  // "新加坡优化": "sg-opt.example.com",
};

// ── 12. 入口机缺失时的兜底规则 ──
// 若某个入口点没采集到入口机，且它的名字是"XX优化"形式，则自动借用"XX 01"节点的 server 兜底。
// 典型场景：机场把"新加坡 01"的接入点改成了 日本AWS，导致没有任何节点在使用"新加坡优化"，
//           于是"新加坡优化"这个入口点采集不到地址 → 用"新加坡 01"的 server 顶上。
// 想严格禁用兜底就把它设为 false（那样缺失的入口点会被直接跳过，不生成对应列）
const ENABLE_ENTRY_SERVER_FALLBACK = true;


// ── 工具函数区 ─────────────────────────────────────────────
// 下面这些是脚本内部用的辅助函数，一般不需要改

// 解析 ENTRY_NODE_TEXT → JS 对象
// 输入: "香港 01:香港优化\n香港 02:新加坡GCP\n..."
// 输出: { "香港 01": "香港优化", "香港 02": "新加坡GCP", ... }
function parseEntryNodes(text) {
  const map = {};
  text.split("\n")
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

// 转义正则特殊字符（别名里的括号等需要转义）
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── 预编译区域匹配正则 ──
// 每个区域编译两个正则：
//   testRe：判断节点名是否属于该区域（如含"香港"+数字 → 香港区域）
//   numRe ：提取编号（"日本 02" → 2）
const REGION_PATTERNS = REGION_ORDER.map(region => {
  const aliases = (REGION_ALIASES[region] || []).map(escapeRegExp);
  const alt = aliases.join("|");
  return {
    region,
    testRe: new RegExp(`(${alt})\\s*\\d+(?=\\s|$)`),
    numRe:  new RegExp(`(${alt})\\s*(\\d+)(?=\\s|$)`)
  };
});

// 从节点名中提取区域： "【高级】香港 01" → "香港"
function getRegionFromName(name) {
  if (!name) return null;
  const text = String(name);
  for (const p of REGION_PATTERNS) {
    if (p.testRe.test(text)) return p.region;
  }
  return null;
}

// 从节点名中提取编号： "日本 02" → 2
function getNodeNumber(name) {
  if (!name) return null;
  const text = String(name);
  for (const p of REGION_PATTERNS) {
    const m = text.match(p.numRe);
    if (m) return parseInt(m[2], 10);
  }
  return null;
}

// 生成节点唯一键： "【高级】香港 01" → "香港 01"
function getNodeKey(name) {
  const region = getRegionFromName(name);
  if (!region) return null;
  const number = getNodeNumber(name);
  if (number === null) return null;
  return `${region} ${String(number).padStart(2, "0")}`;
}

// 判断是否为 Cloudflare 节点（server 含 "cf"）
function isCF(proxy) {
  return !!proxy && !!proxy.server &&
    String(proxy.server).toLowerCase().includes("cf");
}

// 判断节点是否"不参与中转"（基础节点等）
function isUntouchedByName(name) {
  if (!name) return false;
  const text = String(name);
  return UNTOUCHED_NAME_MARKERS.some(marker => text.includes(marker));
}

// ── 每个区域的完整入口点列表（默认优化入口排在第一位）──
const REGION_ENTRY_LISTS = {};
for (const region of REGION_ORDER) {
  const def = REGION_DEFAULT_ENTRY[region];
  const group = REGION_ACCESS_GROUP[region];
  const shared = SHARED_ENTRY_GROUPS[group] || [];
  const list = [];
  if (def && !list.includes(def)) list.push(def);
  for (const ap of shared) {
    if (!list.includes(ap)) list.push(ap);
  }
  REGION_ENTRY_LISTS[region] = list;
}

// 区域 → Set（O(1) 判断某区域是否支持某入口点）
const REGION_AP_SETS = {};
for (const region of REGION_ORDER) {
  REGION_AP_SETS[region] = new Set(REGION_ENTRY_LISTS[region]);
}

function regionSupportsAccessPoint(region, ap) {
  return REGION_AP_SETS[region]?.has(ap) ?? false;
}

// 全量入口点顺序表（用于节点名后缀剥离 + 跨区域排序兜底）
// 按"首次出现"顺序去重合并各区域列表
const ACCESS_POINT_ORDER = (() => {
  const out = [];
  for (const region of REGION_ORDER) {
    for (const ap of REGION_ENTRY_LISTS[region]) {
      if (!out.includes(ap)) out.push(ap);
    }
  }
  return out;
})();

// 预构建后缀表，用于剥离节点名末尾的入口点后缀
// 按长度降序，确保 " - (IPv6)日本优化" 先于 " - 日本优化" 匹配
const AP_SUFFIXES = ACCESS_POINT_ORDER
  .map(ap => ({ suffix: ` - ${ap}`, len: ap.length + 3 }))
  .sort((a, b) => b.suffix.length - a.suffix.length);

// 剥离节点名末尾的入口点后缀（可能多层）
// "香港 01 - 香港优化" → "香港 01"
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

// 区域排序索引（Map O(1)）
const REGION_INDEX_MAP = new Map(REGION_ORDER.map((r, i) => [r, i]));
function getRegionIndex(region) {
  const i = REGION_INDEX_MAP.get(region);
  return i === undefined ? 9999 : i;
}


// ── 主逻辑（脚本执行入口）────────────────────────────────
// Sub-Store 注入全局变量 `proxies`（节点数组）后，从这里开始执行

// 第 0 步：解析映射表
const ENTRY_NODE_MAP = parseEntryNodes(ENTRY_NODE_TEXT);

// 节点元数据缓存（每个节点只算一次）
const proxyMetaCache = new Map();
function getProxyMeta(proxy) {
  let meta = proxyMetaCache.get(proxy);
  if (meta === undefined) {
    const baseName = getBaseName(proxy.name);
    const region = getRegionFromName(baseName);
    let nodeKey = baseName;
    let number = 0;
    if (region) {
      const rawKey = getNodeKey(baseName);
      if (rawKey) nodeKey = rawKey;
      number = getNodeNumber(baseName) ?? 0;
    }
    meta = {
      baseName, region, number, nodeKey,
      cf: SKIP_CF ? isCF(proxy) : false,
      untouched: isUntouchedByName(baseName)
    };
    proxyMetaCache.set(proxy, meta);
  }
  return meta;
}

// ── 第 1+2 步（合并单轮遍历）：收集入口机 & 节点分类 ──
const ENTRY_SERVERS = {};
const targetNodes = [];
const untouchedNodes = [];

for (const proxy of proxies) {
  if (!proxy) continue;
  if (!proxy.name) { untouchedNodes.push(proxy); continue; }
  const meta = getProxyMeta(proxy);

  // ── 入口机收集 ──
  const ap = ENTRY_NODE_MAP[meta.nodeKey];
  if (ap
      && !SKIP_MARKERS.has(ap)
      && !meta.cf
      && !meta.untouched
      && proxy.server) {
    // ★ 入口机 = 地址 + 端口 + 完整 proxy（pbk/sni 必须匹配入口机）
    if (!ENTRY_SERVERS[ap]) {
      ENTRY_SERVERS[ap] = { server: proxy.server, port: proxy.port, proxy: proxy };
    }
  }

  // ── 节点分类 ──
  if (!meta.region || !REGION_AP_SETS[meta.region] || meta.cf || meta.untouched) {
    untouchedNodes.push(proxy);
    continue;
  }
  targetNodes.push({ proxy, region: meta.region, number: meta.number, baseName: meta.baseName, nodeKey: meta.nodeKey });
}

// ── 第 2.5 步：解析每个入口点的入口机地址（手动 > 采集 > 兜底）──
// 兜底：入口点名为"XX优化"且找不到入口机时，借用"XX 01"节点的 server
const nodeKeyServerMap = new Map();   // "香港 01" → { server, port }
for (const item of targetNodes) {
  const key = item.nodeKey;
  if (key && item.proxy.server && !nodeKeyServerMap.has(key)) {
    nodeKeyServerMap.set(key, { server: item.proxy.server, port: item.proxy.port });
  }
}

function resolveEntryServer(ap) {
  // ① 手动指定优先
  if (MANUAL_ENTRY_SERVERS[ap]) {
    const v = MANUAL_ENTRY_SERVERS[ap];
    return typeof v === "string" ? { server: v, port: null } : v;
  }
  // ② 从订阅采集（含端口）
  if (ENTRY_SERVERS[ap]) return ENTRY_SERVERS[ap];
  // ③ 兜底： "XX优化" → 借 "XX 01" 的 server+port
  if (ENABLE_ENTRY_SERVER_FALLBACK) {
    const m = /^(.+?)优化$/.exec(ap);
    if (m) {
      const regionName = m[1];
      const fallback = nodeKeyServerMap.get(`${regionName} 01`);
      if (fallback) return fallback;
    }
  }
  return null;
}

// 预解析所有入口点的最终入口机（server + port）
const RESOLVED_ENTRY_SERVERS = {};
for (const ap of ACCESS_POINT_ORDER) {
  const ep = resolveEntryServer(ap);
  if (ep && ep.server) RESOLVED_ENTRY_SERVERS[ap] = ep;
}

// ── 第 3 步：目标节点排序（区域顺序 → 编号）──
targetNodes.sort((a, b) =>
  getRegionIndex(a.region) - getRegionIndex(b.region) ||
  a.number - b.number
);

// ── 第 4 步：交叉组合生成新节点 ──
// 新节点：server 换成入口机地址，名字 = "原节点名 - 入口点名"
const generatedNodes = [];

if (SORT_MODE !== 1 && SORT_MODE !== 2) {
  throw new Error(`SORT_MODE 必须是 1 或 2，当前值：${SORT_MODE}`);
}

// ★ 中转机制（已验证入口机不转发未识别TLS）：
//   入口机是独立的 VLESS/Reality 服务，只接受自己的 pbk/sid。
//   若客户端用落地节点的 pbk/sid 连接入口机，入口机不认识 → 回退到真实网站。
//   因此：中转节点必须使用入口机的全部参数（server/port/pbk/sid/sni），
//   只是名字上标注落地节点 + 入口点，用于组织和选择。
//   这是"入口机全参数复制"方案：功能上等同于直接用入口机节点，但名字更清晰。
function cloneProxyWithRelay(proxy, entry, name) {
  // ★ 以入口机为基础，全参数复制（server/port/pbk/sid/sni 都来自入口机）
  const np = { ...entry.proxy };                         // ★ 复制入口机的完整代理对象
  np.name = name;                                        // ★ 只改名字，标注落地节点 + 入口点
  return np;
}

// SORT_MODE=1：节点优先
function generateForNode(item) {
  const { proxy, region, baseName } = item;
  const list = REGION_ENTRY_LISTS[region];
  for (let i = 0, len = list.length; i < len; i++) {
    const ap = list[i];
    const entry = RESOLVED_ENTRY_SERVERS[ap];
    if (!entry) continue;
    generatedNodes.push(cloneProxyWithRelay(proxy, entry, `${baseName} - ${ap}`));
  }
}

// SORT_MODE=2：入口点优先
function generateForAccessPoint(ap) {
  const entry = RESOLVED_ENTRY_SERVERS[ap];
  if (!entry) return;
  const len = targetNodes.length;
  for (let i = 0; i < len; i++) {
    const item = targetNodes[i];
    if (!REGION_AP_SETS[item.region]?.has(ap)) continue;
    generatedNodes.push(cloneProxyWithRelay(item.proxy, entry, `${item.baseName} - ${ap}`));
  }
}

if (SORT_MODE === 1) {
  for (const item of targetNodes) generateForNode(item);
} else {
  // 入口点优先：按全量入口顺序遍历一次（避免多区域共享入口导致重复生成）
  for (const ap of ACCESS_POINT_ORDER) generateForAccessPoint(ap);
}

// ── 第 5 步：输出（中转节点在前，保留节点在后）──
return [...generatedNodes, ...untouchedNodes];
