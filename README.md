# MIHOMO_OVERRIDE_JS

Mihomo（Clash.Meta）覆写脚本集合：一份 JavaScript 覆写，让任意订阅瞬间获得完整的分组、DNS、规则与图标体系。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Mihomo](https://img.shields.io/badge/内核-Mihomo%20%2F%20Clash.Meta-red)
![Smart](https://img.shields.io/badge/支持-Smart%20内核(LightGBM)-orange)

---

## 📚 分支结构

| 分支 | 定位 | 内容 |
|---|---|---|
| [`main`](https://github.com/MioHueCode/MIHOMO_OVERRIDE_JS/tree/main) | **通用覆写**（不绑定机场） | `Clash.mini.smart.js` / `Clash.mini.normal.js` |
| [`个人关联覆写`](https://github.com/MioHueCode/MIHOMO_OVERRIDE_JS/tree/%E4%B8%AA%E4%BA%BA%E5%85%B3%E8%81%94%E8%A6%86%E5%86%99) | **个人定制** | [Nowhere Network](https://dashboard.nowhere.best/#/register?code=tZ5csUst) 机场专用 + [MilkCloud 奶云](https://www.naiyun.vip/i/J8Ulk0cL) 前置中转 |

> 两分支脚本互不通用，按需取用即可。

---

## 🚀 main 分支：Clash.mini 系列

工程化全功能覆写，DNS / 规则 / 分组三位一体联动，基于业务语义的分流与自动选路。同源双版本，图标体系（Qure / mini Color）完全一致：

| 脚本 | 选路引擎 | 适合人群 | 直链 |
|---|---|---|---|
| **Clash.mini.smart.js** | LightGBM 智能选路（vernesong Smart 内核） | 少手动干预，"开了就用" | [raw](https://raw.githubusercontent.com/MioHueCode/MIHOMO_OVERRIDE_JS/main/Clash.mini.smart.js) |
| **Clash.mini.normal.js** | url-test / fallback 传统组合 | 偏好手动切换节点 | [raw](https://raw.githubusercontent.com/MioHueCode/MIHOMO_OVERRIDE_JS/main/Clash.mini.normal.js) |

### 核心能力

- **智能分组体系**：地区组、家宽组（🏡 全球/地区双层）、倍率组（🐎高倍率 / 🐢低倍率）、运营商优化组、流媒体业务组
- **DNS 三位一体**：`default-nameserver` 纯 IP 自举 → 国内直连 DoH → 代理域名走 ECS 精准解析，杜绝 DNS 泄漏与解析死锁
- **规则联动**：GFW / 国内直连 / 局域网 / 流媒体规则集自动装配，`MATCH` 兜底
- **图标统一**：Qure IconSet + Orz-3 mini Color 双源，客户端面板一眼可辨

---

## 🔧 个人关联覆写分支

### nowhere_override.js / substore.js — Nowhere Network 机场专用

> 适配机场：**[Nowhere Network](https://dashboard.nowhere.best/#/register?code=tZ5csUst)**（注册邀请码 `tZ5csUst`）

### nowhere_override.js — Nowhere all-in-one（Smart 内核）

一个脚本搞定全部：**节点生成 → 分组重建 → DNS → 规则注入**，覆写到原订阅配置上使用。

- **交叉中转生成**：37 落地节点 × 多入口机 → 200+ 中转节点（幂等，重复运行不叠加）
- **统一分组结构**（策略组零真实节点）：

  ```
  Proxies → 智能选择 → 最低延迟 → HK/JP/…/BR 11 地区组
        → 高级.线路 / 基础.线路 → 16 个入口组
  ```

- **命名规范**：`节点 - 入口名`（中转）/ `节点 - 原始`（直连原节点）/ `组名.入口` / `层级.线路` 后缀
- **规则注入**：Telegram 官方 IP 段（RULE-SET + GEOIP 双保险）、GFW 外部规则集 → Final、国内直连、进程规则（YouTube / Morphe / Telegram / AyuGram / exteraGram / Turrit / TikTok / rezvorck plugin）
- **DNS**：`default-nameserver` 纯 IP 自举、`proxy-server-nameserver` 通用公共 DoH 直连、私有域名严格走机场私有 DoH

> 直链：[raw](https://raw.githubusercontent.com/MioHueCode/MIHOMO_OVERRIDE_JS/%E4%B8%AA%E4%BA%BA%E5%85%B3%E8%81%94%E8%A6%86%E5%86%99/nowhere_override.js)

### mihomo_smart_tier.js / mihomo_normal_tier.js — 分级策略覆写

Smart / Normal 双版本分级组覆写（地区 → 层级 → 家宽 → 倍率四级结构），节点全量写入 `proxies`，组用显式节点列表引用，家宽/倍率图标与 Clash.mini 系列同源对齐。

> ⚠️ **与 nowhere_override.js 互斥**：两者同时挂载会互相覆盖分组结构，二选一。

### substore.js — Sub-Store 中转节点生成器

**Nowhere Network 专用**的 Sub-Store Script Operator / Mihomo 覆写两用脚本：把订阅里的落地节点按入口机映射表批量生成 `落地 - 入口` 中转节点。**只管节点生成，DNS 与分组由覆写脚本负责。**

### Clash.mini.*（前置中转版）— MilkCloud 奶云专用

> 适配机场：**[MilkCloud 奶云](https://www.naiyun.vip/i/J8Ulk0cL)**（¥9.9/年）

mini 系列的变体：在 mini 全功能基础上额外接入奶云前置中转节点生成逻辑，适合链式代理场景。

### Clash.mini.*（前置中转版）


---

## 📥 使用方法

以 [Mihomo Party](https://github.com/mihomo-party-org/mihomo-party) / [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) 为例：

1. **订阅管理** → 添加你的机场订阅
2. **覆写** → 新建 JavaScript 覆写，粘贴目标脚本内容（或填 raw 直链）
3. 在订阅的「覆写」里勾选该脚本，**只挂一个**（多脚本叠加会互相覆盖分组）
4. 保存后**重启内核**生效

<details>
<summary><b>常见问题</b></summary>

**Q：更新脚本后界面没变化？**
覆写在内核启动时执行，改完必须重启内核（不是重新选择节点）。客户端对本地覆写文件有内容缓存，必要时删除覆写重新添加。

**Q：Proxies 组出现重复节点 / `not found` 报错？**
升级到最新版脚本；若仍复现，携带内核日志提 issue。

**Q：进程规则（PROCESS-NAME）不生效？**
进程匹配需要客户端以 TUN 模式（或 Root）运行。

</details>

---

## 🧾 脚本规范

- 所有脚本纯 ES5/ES6 子集编写，兼容 Mihomo Party / Clash Verge Rev 的 JS 引擎（Boa / QuickJS）
- 外部资源（图标、规则集、DoH）全部集中在文件头部「配置区」，换源只改一处
- 版本号写在文件头部注释，语义化提交（feat / fix / style / chore）

## License

[MIT](LICENSE)
