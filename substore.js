// ============================================================
// Sub-Store Script Operator —— 中转节点生成脚本
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
//   4. 原来没有区域归属的节点（如基础版、CF 节点）原样保留，排到最后
//
// 【举例】
//   落地节点"香港 01"（server: 152.175.13.85:57422）
//   入口点"新加坡AWS"对应的入口机地址是 aws-sg.domestic.nowhere-backend.xyz:57422
//   → 生成新节点：名字="香港 01 - 新加坡AWS"，server=aws-sg那台
//   你连这个新节点时，流量先进 aws-sg 入口机，再转发到香港 01 的落地机
//
// 【运行环境】
//   Sub-Store 脚本操作器（Script Operator）
//   Sub-Store 会把订阅里解析出的节点数组注入到全局变量 `proxies`
//   脚本最后 `return` 一个新数组，Sub-Store 用它替换原订阅输出
//
// 【后续改动指引】
//   ┌─ 改入口点文本      → 修改 ACCESS_POINT_NODES_TEXT
//   ├─ 改入口点排列顺序  → 修改 ACCESS_POINT_ORDER
//   ├─ 改区域别名        → 修改 REGION_ALIASES
//   ├─ 改区域→入口组映射  → 修改 REGION_ACCESS_GROUP
//   ├─ 改入口组定义      → 修改 ACCESS_POINTS_HK_TW_SG / ZJ
//   ├─ 改区域排列顺序    → 修改 REGION_ORDER
//   ├─ 改排序模式        → 修改 SORT_MODE
//   └─ 改 CF 节点跳过    → 修改 SKIP_CF
//
// ============================================================


// ── 配置区 ─────────────────────────────────────────────────
// 下面全是你可以改的配置项，改完不需要动后面的代码逻辑

// ── 1. 节点→入口点映射表 ──
// 这是整个脚本的核心数据源。
// 左边"香港 01"是订阅里实际存在的落地节点名
// 右边"香港优化"是官网接入点切换页面上这个节点当前选中的入口点名
//
// 脚本会拿这个表做两件事：
//   ① 找到这个落地节点的 server 地址 → 存为这个入口点的中转入口地址
//      比如官网说"香港 01 → 香港优化"，脚本就把"香港 01"的 server 记下来
//      当作"香港优化"这个入口点的入口机地址
//   ② 后面生成中转节点时，所有落地节点都可以从"香港优化"入口进去
//
// 如果某个节点的入口点是"仅原始线路"或"暂无可选接入点"，
//   → 脚本不收集它的 server，它也不参与中转生成（等于跳过）
//
// 多个节点映射到同一个入口点时（如"新加坡 02"和"新加坡 03"都是"香港优化"），
//   → 只有第一个出现的节点 server 会被记录，后面不覆盖
//   → 也就是说两个节点 host 一样的话，用哪个都无所谓
//
const ACCESS_POINT_NODES_TEXT = `
香港 01:香港优化
香港 02:新加坡GCP
香港 03:新加坡AWS

台湾 01:(实验性)特殊入口
台湾 02:(IPv6)日本优化
台湾 03:(IPv6)日本AWS

新加坡 01:(IPv6)新加坡AWS
新加坡 02:香港优化
新加坡 03:香港优化

日本 01:日本优化
日本 02:日本GCP
日本 03:日本AWS

美国 01:日本优化
美国 02:日本优化
美国 03:日本优化

印度 01:日本优化
泰国 01:日本优化
澳大利亚 01:日本优化
墨西哥 01:日本优化
巴西 01:日本优化

实验 香港:台湾HiNet
实验 新加坡:香港优化
实验 日本:日本软银
实验 美国:日本优化
`;

// ── 2. 入口点排列顺序 ──
// 决定生成新节点时，入口点名出现在节点名里的先后顺序
// 比如这里第一个是"香港优化"，那"香港 01 - 香港优化"会排在"香港 01 - 新加坡GCP"前面
// 注意：名字必须和上面 ACCESS_POINT_NODES_TEXT 冒号右边的一致
const ACCESS_POINT_ORDER = [
  // HK_TW_SG 组
  "香港优化", "新加坡GCP", "新加坡AWS", "台湾HiNet",
  "(实验性)特殊入口",
  // IPv6 入口（两组共享）
  "(IPv6)日本优化", "(IPv6)日本AWS", "(IPv6)新加坡AWS",
  // ZJ 组
  "日本优化",
  "日本GCP", "日本AWS", "日本软银"
];

// ── 3. 区域别名表 ──
// 用来从节点名里识别"这个节点属于哪个区域"
// 比如订阅里可能写"香港 01"也可能写"【高级】香港 01"，
// 只要名字里包含"香港"两字，就能匹配到"香港"区域
// 一个区域可以配多个别名（如澳大利亚可以匹配"澳大"或"澳洲"）
// 注意：别名之间不能互相包含（别同时配"澳大"和"澳大利亚"，否则正则有歧义）
const REGION_ALIASES = {
  "香港": ["香港"],
  "台湾": ["台湾"],
  "新加坡": ["新加坡"],
  "日本": ["日本"],
  "美国": ["美国"],
  "印度": ["印度"],
  "泰国": ["泰国"],
  "澳大利亚": ["澳大利亚", "澳大", "澳洲"],
  "巴西": ["巴西"],
  "墨西哥": ["墨西哥"],
  "实验 香港": ["[实验] 香港", "[实验]香港", "实验 香港", "实验.香港", "实验-香港"],
  "实验 新加坡": ["[实验] 新加坡", "[实验]新加坡", "实验 新加坡", "实验.新加坡", "实验-新加坡"],
  "实验 日本": ["[实验] 日本", "[实验]日本", "实验 日本", "实验.日本", "实验-日本"],
  "实验 美国": ["[实验] 美国", "[实验]美国", "实验 美国", "实验.美国", "实验-美国"]
};

// ── 4. 无编号区域 ──
// "实验 香港""实验 新加坡"等节点没有编号（不带 01 02 03）
// 匹配时不要求名字里出现数字，只要名字里有区域关键词就行
const NO_NUMBER_REGIONS = new Set(["实验 香港", "实验 新加坡", "实验 日本", "实验 美国"]);

// ── 5. 实验区域→基础区域名映射 ──
// "实验 香港"包含"香港"两字，所以当节点名里同时出现"实验"和"香港"时
// 就认定它属于"实验 香港"区域（而不是普通"香港"区域）
const EXP_REGION_BASE = {
  "实验 香港": "香港",
  "实验 新加坡": "新加坡",
  "实验 日本": "日本",
  "实验 美国": "美国"
};

// ── 6. 入口组定义 ──
// 不是所有区域都能用所有入口点。
// 比如香港节点可以走"香港优化"入口，但日本节点不能走"香港优化"入口
// 所以分了两组：
//   HK_TW_SG 组：香港/台湾/新加坡 用的入口点列表
//   ZJ 组      ：日本/美国/远程地区 用的入口点列表
// 两组有重叠的 IPv6 入口（如"(IPv6)日本优化"两组都能用）
const ACCESS_POINTS_HK_TW_SG = [
  "香港优化", "新加坡GCP", "新加坡AWS", "台湾HiNet",
  "(实验性)特殊入口",
  "(IPv6)日本优化", "(IPv6)日本AWS", "(IPv6)新加坡AWS"
];
const ACCESS_POINTS_ZJ = [
  "日本优化", "日本GCP", "日本AWS", "日本软银",
  "(IPv6)日本优化", "(IPv6)日本AWS", "(IPv6)新加坡AWS"
];
const ACCESS_POINT_GROUPS = {
  HK_TW_SG: ACCESS_POINTS_HK_TW_SG,
  ZJ: ACCESS_POINTS_ZJ
};

// ── 7. 区域→入口组映射 ──
// 告诉脚本每个区域该用哪组入口点
// 比如香港→HK_TW_SG组，日本→ZJ组
const REGION_ACCESS_GROUP = {
  "香港": "HK_TW_SG", "台湾": "HK_TW_SG", "新加坡": "HK_TW_SG",
  "日本": "ZJ", "美国": "ZJ",
  "印度": "ZJ", "泰国": "ZJ",
  "澳大利亚": "ZJ", "巴西": "ZJ", "墨西哥": "ZJ",
  "实验 香港": "HK_TW_SG", "实验 新加坡": "HK_TW_SG",
  "实验 日本": "ZJ", "实验 美国": "ZJ"
};

// ── 8. 区域排列顺序 ──
// 决定最终输出节点列表里各区域的先后
// 比如这里"香港"在第一个，所以所有香港节点排在最前面
const REGION_ORDER = [
  "香港", "日本", "台湾", "新加坡", "美国",
  "印度", "泰国", "澳大利亚", "墨西哥", "巴西",
  "实验 香港", "实验 新加坡", "实验 日本", "实验 美国"
];

// ── 9. 排序模式 ──
// 1 = 按节点优先：先遍历落地节点，每个节点铺开它所有能用的入口点
//     效果：香港 01-香港优化, 香港 01-新加坡GCP, 香港 01-新加坡AWS, 香港 02-香港优化, 香港 02-新加坡GCP...
// 2 = 按入口点优先：先遍历入口点，每个入口点铺开它所有能用的落地节点
//     效果：香港 01-香港优化, 香港 02-香港优化, 香港 03-香港优化, 台湾 01-香港优化...（如果台湾支持的话）
const SORT_MODE = 1;

// ── 10. 是否跳过 Cloudflare 节点 ──
// true  = server 地址里含"cf"的节点不参与入口点收集和中转生成（CF 节点通常不能中转）
// false = 不跳过，全部参与
const SKIP_CF = true;

// ── 11. "跳过"标记 ──
// 在 ACCESS_POINT_NODES_TEXT 中，如果某个节点的入口点值是这两个之一
// 说明该节点只能走原始线路、没有中转入口点可用 → 跳过，不收集 server，不参与生成
const SKIP_MARKERS = new Set([
  "仅原始线路",
  "暂无可选接入点"
]);


// ── 工具函数区 ─────────────────────────────────────────────
// 下面这些是脚本内部用的辅助函数，一般不需要改

// 解析 ACCESS_POINT_NODES_TEXT 文本 → JS 对象（映射表）
// 输入: "香港 01:香港优化\n香港 02:新加坡GCP\n..."
// 输出: { "香港 01": "香港优化", "香港 02": "新加坡GCP", ... }
// 遇到没有冒号的行直接跳过
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

// 转义正则特殊字符
// 比如别名里如果有"(实验)"，括号在正则里有特殊含义，需要转义成 "\(实验\)"
// 否则正则引擎会把括号当成分组符号，导致匹配出错
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── 预编译区域匹配正则 ──
// 为每个区域预先编译好两个正则，避免每次匹配节点名时都重新生成正则（性能优化）
//   testRe：判断节点名是否属于该区域（如名字含"香港"+数字 → 是香港区域）
//   numRe ：从节点名中提取编号（如"日本 02" → 提取出数字 2）
// 无编号区域（实验类）只编译 testRe，不需要 numRe
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

// 从节点名中提取区域
// 比如传入"【高级】香港 01" → 返回"香港"
// 比如传入"【实验】香港" → 返回"实验 香港"
// 匹配不到任何区域 → 返回 null
//
// 优先级：
//   1) 先看是不是实验区域（名字含"实验"且含基础区域名如"香港"）
//   2) 再看是不是常规区域（用正则匹配"区域名+编号"）
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

// 从节点名中提取编号
// 比如传入"日本 02" → 返回 2
// 比如传入"实验 香港" → 返回 null（无编号区域没有编号）
// 用于排序时同一区域内按编号大小排列
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

// 生成节点唯一键（用于在 ACCESS_POINT_NODE_MAP 中查找对应入口点）
// 比如传入"【高级】香港 01" → 先识别区域"香港"，再提取编号 1 → 输出"香港 01"
// 然后用"香港 01"去映射表里查 → 找到"香港优化"
// 无编号区域（如"实验 香港"）直接用区域名作为键
function getNodeKey(name) {
  const region = getRegionFromName(name);
  if (!region) return null;
  // 无编号区域直接用区域名作为键
  if (NO_NUMBER_REGIONS.has(region)) return region;
  const number = getNodeNumber(name);
  if (number === null) return null;
  return `${region} ${String(number).padStart(2, "0")}`;
}

// 判断一个节点是不是 Cloudflare 节点
// 判断依据：server 地址里是否含"cf"（不区分大小写）
// CF 节点通常不支持中转，所以需要跳过
function isCF(proxy) {
  return !!proxy && !!proxy.server &&
    String(proxy.server).toLowerCase().includes("cf");
}

// 从映射表中提取所有不重复的入口点名（排除跳过标记）
// 用于后面构建后缀清理表
const ALL_ACCESS_POINTS = [
  ...new Set(Object.values(parseAccessPointNodes(ACCESS_POINT_NODES_TEXT)))
].filter(ap => !SKIP_MARKERS.has(ap));

// 预构建后缀→长度表，用于 getBaseName 函数
// 比如入口点"香港优化" → 后缀是" - 香港优化"（长度=3+4=7）
// 按长度降序排列，确保最长的后缀先被匹配（否则" - 日本优化"会先匹配掉" - (IPv6)日本优化"中的部分）
const AP_SUFFIXES = ALL_ACCESS_POINTS
  .map(ap => ({ suffix: ` - ${ap}`, len: ap.length + 3 }))
  .sort((a, b) => b.suffix.length - a.suffix.length);

// 去除节点名末尾的入口点后缀
// 为什么要这个函数？因为如果订阅更新后节点名已经带了入口点后缀（如"香港 01 - 香港优化"）
// 需要先去掉后缀还原成"香港 01"，才能正确匹配映射表
// 循环处理是为了防止多次拼接的情况（如"香港 01 - 香港优化 - 新加坡GCP"）
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

// 获取一个节点的区域（先去掉入口点后缀，再从干净的名字里识别区域）
// 比如传入节点名"【高级】香港 01 - 新加坡AWS" → 去后缀 → "【高级】香港 01" → 识别区域 → "香港"
function getBaseRegion(proxy) {
  return proxy?.name ? getRegionFromName(getBaseName(proxy.name)) : null;
}

// 获取区域在 REGION_ORDER 中的位置索引，用于排序
// 比如香港在 REGION_ORDER 里排第 0 位 → 返回 0
// 如果某个区域不在 REGION_ORDER 里 → 返回 9999（排到最后）
function getRegionIndex(region) {
  const i = REGION_ORDER.indexOf(region);
  return i === -1 ? 9999 : i;
}

// 预计算每个区域可用的入口点集合（转成 Set，后续查找 O(1)）
// 比如香港→HK_TW_SG组的入口点列表 → 转成 Set 存起来
// 后面判断"香港能不能用新加坡AWS入口"时直接 Set.has() 查找，很快
const REGION_AP_SETS = {};
for (const region of REGION_ORDER) {
  const group = REGION_ACCESS_GROUP[region];
  const list = group ? (ACCESS_POINT_GROUPS[group] || []) : [];
  REGION_AP_SETS[region] = new Set(list);
}

// 判断某个区域是否支持某个入口点
// 比如香港是否支持"新加坡AWS" → 查 HK_TW_SG 组里有没有 → 有 → true
// 比如日本是否支持"香港优化" → 查 ZJ 组里有没有 → 没有 → false
function regionSupportsAccessPoint(region, ap) {
  return REGION_AP_SETS[region]?.has(ap) ?? false;
}


// ── 主逻辑（脚本执行入口）────────────────────────────────
// Sub-Store 注入全局变量 `proxies`（节点数组）后，从这里开始执行

// 第 0 步：把 ACCESS_POINT_NODES_TEXT 文本解析成映射表对象
// 结果形如：{ "香港 01": "香港优化", "香港 02": "新加坡GCP", ... }
const ACCESS_POINT_NODE_MAP = parseAccessPointNodes(ACCESS_POINT_NODES_TEXT);

// ── 第 1 步：收集各入口点的 server 地址（入口机地址）──
// 遍历所有节点，通过节点名匹配映射表：
//   如果"香港 01"在映射表里对应"香港优化"，
//   就把"香港 01"的 server 地址记下来，当作"香港优化"入口点的入口机地址
//
// 结果存入 ACCESS_POINT_SERVERS，形如：
//   { "香港优化": "152.175.13.85", "新加坡GCP": "34.126.136.25", ... }
//
// 注意：同一个入口点只记录第一次出现的 server（不覆盖）
//   比如新加坡 02 和 03 都映射到"香港优化"，只有 02 的 server 会被记录
const ACCESS_POINT_SERVERS = {};
for (const proxy of proxies) {
  if (!proxy?.name) continue;
  // 先去掉节点名里可能已有的入口点后缀
  const baseName = getBaseName(proxy.name);
  // 尝试用"区域+编号"格式匹配映射表（如"香港 01"）
  let nodeKey = getNodeKey(baseName);
  // 如果没匹配上，用去掉后缀的名字直接匹配（用于"实验 美国"这种无编号节点）
  if (!nodeKey) nodeKey = baseName;
  // 在映射表里查这个节点对应哪个入口点
  const ap = ACCESS_POINT_NODE_MAP[nodeKey];
  if (!ap) continue;                    // 不在映射表里 → 跳过
  if (SKIP_MARKERS.has(ap)) continue;   // 标记为"仅原始线路"等 → 跳过
  if (SKIP_CF && isCF(proxy)) continue; // CF 节点 → 跳过
  if (!proxy.server) continue;          // 没有 server → 跳过
  // 第一次出现才记录，后面不覆盖
  if (!ACCESS_POINT_SERVERS[ap]) {
    ACCESS_POINT_SERVERS[ap] = proxy.server;
  }
}

// ── 第 2 步：把节点分成两类 ──
// targetNodes   = 能参与中转生成的节点（有区域归属、有入口组、不是CF）
// untouchedNodes = 不能参与中转的节点（如基础版、CF节点、未识别区域的节点）
//   这些节点原样保留，最后追加到输出列表末尾
const targetNodes = [];
const untouchedNodes = [];

for (const proxy of proxies) {
  if (!proxy) continue;
  const region = getBaseRegion(proxy);  // 识别这个节点属于哪个区域
  if (!region || !REGION_AP_SETS[region] ||
      (SKIP_CF && isCF(proxy))) {
    // 区域识别不了 / 该区域没有入口组配置 / 是CF节点 → 不参与中转
    untouchedNodes.push(proxy);
    continue;
  }
  // 参与中转：记录节点对象、区域、编号（编号用于排序）
  targetNodes.push({
    proxy, region,
    number: getNodeNumber(getBaseName(proxy.name)) ?? 0
  });
}

// ── 第 3 步：对目标节点排序 ──
// 先按区域在 REGION_ORDER 里的顺序排（香港→日本→台湾→新加坡→美国→...）
// 同一区域内再按编号排（01 在前 02 在后）
targetNodes.sort((a, b) =>
  getRegionIndex(a.region) - getRegionIndex(b.region) ||
  a.number - b.number
);

// ── 第 4 步：交叉组合生成新节点 ──
// 这就是脚本的核心动作：
//   遍历每个目标节点 × 遍历它能用的每个入口点 → 生成一个新节点
//   新节点的 server 改成入口机地址，名字是"原节点名 - 入口点名"
//
// 比如：香港 01（落地机 152.175.13.85）× 新加坡AWS（入口机 aws-sg...）
//   → 新节点：名字="香港 01 - 新加坡AWS"，server=aws-sg...
//   你连这个节点时，流量先进 aws-sg 入口机，再转发到香港 01 落地机
const generatedNodes = [];

// 安全检查：SORT_MODE 只能是 1 或 2
if (SORT_MODE !== 1 && SORT_MODE !== 2) {
  throw new Error(`SORT_MODE 必须是 1 或 2，当前值：${SORT_MODE}`);
}

// SORT_MODE=1：按节点优先生成
// 外层遍历排序后的目标节点，内层遍历该节点所在区域可用的入口点
// 效果：香港01-入口A, 香港01-入口B, 香港02-入口A, 香港02-入口B...
function generateForNode(item) {
  const { proxy, region } = item;
  const baseName = getBaseName(proxy.name);  // 去掉可能已有的后缀，拿到干净节点名
  for (const ap of ACCESS_POINT_ORDER) {      // 遍历所有入口点（按配置顺序）
    if (!regionSupportsAccessPoint(region, ap)) continue;  // 该区域不支持这个入口 → 跳过
    const server = ACCESS_POINT_SERVERS[ap];                 // 拿到这个入口点的入口机地址
    if (!server) continue;                                   // 没有入口机地址 → 跳过（可能源节点不存在）
    // 深拷贝原节点，改 server 和名字
    const np = JSON.parse(JSON.stringify(proxy));
    np.server = server;                      // ★ 关键：把 server 换成入口机地址
    np.name = `${baseName} - ${ap}`;         // ★ 关键：名字加上入口点后缀
    generatedNodes.push(np);
  }
}

// SORT_MODE=2：按入口点优先生成
// 外层遍历入口点，内层遍历目标节点
// 效果：香港01-入口A, 香港02-入口A, 台湾01-入口A...香港01-入口B, 香港02-入口B...
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

// 根据排序模式选择生成方式
if (SORT_MODE === 1) {
  for (const item of targetNodes) generateForNode(item);
} else {
  for (const ap of ACCESS_POINT_ORDER) generateForAccessPoint(ap);
}

// ── 第 5 步：输出最终结果 ──
// 把生成的中转节点放前面，原样保留的节点放后面
// Sub-Store 用这个数组替换原订阅输出
return [...generatedNodes, ...untouchedNodes];