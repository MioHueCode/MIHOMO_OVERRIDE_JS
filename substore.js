// Sub-Store Script Operator —— 最小化中转节点生成脚本
// 只保留核心逻辑：入口机全参数复制

// 1. 节点 → 接入点映射表
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
新加坡 02:(IPv6)日本优化
新加坡 03:日本AWS
美国 01:美国优化
美国 02:日本软银
美国 03:(IPv6)新加坡AWS
意大利 01:香港优化
印泰澳洲墨巴 01:日本优化
`;

// 2. 解析映射表
const entryMap = {};
const entryServers = {};
ENTRY_NODE_TEXT.trim().split('\n').forEach(line => {
  const [nodeName, entryPoint] = line.trim().split(':');
  if (!nodeName || !entryPoint) return;
  entryMap[nodeName.trim()] = entryPoint.trim();
});

// 3. 获取代理元数据
function getMeta(proxy) {
  const name = proxy.name || '';
  // 移除 [高级]/[基础] 前缀和国旗emoji，提取纯净节点名
  const baseName = name.replace(/\[.*?\]\s*/, '').replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]\s*/, '').trim();
  return { baseName, isAdvanced: name.includes('[高级]'), isBasic: name.includes('[基础]') };
}

// 4. 主处理
const result = [];
const relayNodes = [];
const originalNodes = [];

// 收集入口机地址
proxies.forEach(proxy => {
  const meta = getMeta(proxy);
  if (meta.isAdvanced) {
    const entryPoint = entryMap[meta.baseName];
    if (entryPoint) {
      if (!entryServers[entryPoint]) {
        entryServers[entryPoint] = proxy;
      }
    }
  }
});

// 生成中转节点
proxies.forEach(proxy => {
  const meta = getMeta(proxy);
  
  if (meta.isAdvanced) {
    // 为每个高级节点生成中转节点
    const entryPoints = [
      '香港优化', '台湾优化', '新加坡优化', '日本优化', '美国优化',
      '新加坡GCP', '新加坡AWS', '台湾HiNet', '(实验性)特殊入口',
      '日本AWS', '日本软银', '日本GCP A', '日本GCP B',
      '(IPv6)日本优化', '(IPv6)日本AWS', '(IPv6)新加坡AWS'
    ];
    
    entryPoints.forEach(entryPoint => {
      const entryServer = entryServers[entryPoint];
      if (!entryServer) return;
      
      // 复制入口机的全部参数，只改名字
      const relay = { ...entryServer };
      relay.name = `${meta.baseName} - ${entryPoint}`;
      relayNodes.push(relay);
    });
  } else if (meta.isBasic) {
    // 基础节点原样保留
    originalNodes.push(proxy);
  }
});

// 按区域排序
result.push(...relayNodes, ...originalNodes);

return result;
