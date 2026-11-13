# mihomo-overwrite-lab

Mihomo（Clash.Meta）覆写脚本集合：一份 JavaScript 覆写，让任意订阅瞬间获得完整的分组、DNS、规则与图标体系。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Mihomo](https://img.shields.io/badge/内核-Mihomo%20%2F%20Clash.Meta-red)
![Smart](https://img.shields.io/badge/支持-Smart%20内核(LightGBM)-orange)

---

## 📚 分支结构

| 分支 | 定位 | 内容 |
|---|---|---|
| [`main`](https://github.com/MioHueCode/mihomo-overwrite-lab/tree/main) | **通用覆写**（不绑定机场） | `Clash.mini.smart.js` / `Clash.mini.normal.js` |
| [`个人关联覆写`](https://github.com/MioHueCode/mihomo-overwrite-lab/tree/个人关联覆写) | **个人定制** | [Nowhere Network](https://dashboard.nowhere.best/#/register?code=tZ5csUst) 机场专用 + [MilkCloud 奶云](https://www.naiyun.vip/i/J8Ulk0cL) 前置中转 |

> 两分支脚本互不通用，按需取用即可。

---
## 📋 Raw 直链速查（点击复制即用）

> 所有链接均为 `raw.githubusercontent.com` 纯文本直链。正确脚本第一行是 `/**`——看到 `<` 说明拿成了网页。

### main 分支 · Clash.mini 通用覆写

**智能版（Smart 内核 LightGBM 选路）：**

```
https://raw.githubusercontent.com/MioHueCode/mihomo-overwrite-lab/main/Clash.mini.smart.js
```

**标准版（url-test/fallback，任意内核兼容）：**

```
https://raw.githubusercontent.com/MioHueCode/mihomo-overwrite-lab/main/Clash.mini.normal.js
```

### 个人关联覆写分支 · Nowhere Network 专用

```
https://raw.githubusercontent.com/MioHueCode/mihomo-overwrite-lab/refs/heads/个人关联覆写/nowhere_override.js
```

```
https://raw.githubusercontent.com/MioHueCode/mihomo-overwrite-lab/refs/heads/个人关联覆写/substore.js
```

### 个人关联覆写分支 · 分级策略精简（适配任意机场，echs-top/proxy 改编）

**智能版：**

```
https://raw.githubusercontent.com/MioHueCode/mihomo-overwrite-lab/refs/heads/个人关联覆写/mihomo_smart_tier.js
```

**标准版：**

```
https://raw.githubusercontent.com/MioHueCode/mihomo-overwrite-lab/refs/heads/个人关联覆写/mihomo_normal_tier.js
```

### 个人关联覆写分支 · MilkCloud 奶云前置中转（¥9.9/年）

**智能版：**

```
https://raw.githubusercontent.com/MioHueCode/mihomo-overwrite-lab/refs/heads/个人关联覆写/Clash.mini.smart%28%E5%89%8D%E7%BD%AE%E4%B8%AD%E8%BD%AC%29.js
```

**标准版：**

```
https://raw.githubusercontent.com/MioHueCode/mihomo-overwrite-lab/refs/heads/个人关联覆写/Clash.mini.normal%28%E5%89%8D%E7%BD%AE%E4%B8%AD%E8%BD%AC%29.js
```

### 个人关联覆写分支 · mini 通用版（与 main 同源）

**智能版：**

```
https://raw.githubusercontent.com/MioHueCode/mihomo-overwrite-lab/refs/heads/个人关联覆写/Clash.mini.smart.js
```

**标准版：**

```
https://raw.githubusercontent.com/MioHueCode/mihomo-overwrite-lab/refs/heads/个人关联覆写/Clash.mini.normal.js
```

> 💡 **FlClash 用户注意**：扩展脚本请粘贴 raw 链接打开后的纯文本内容，第一行必须是 `/**`。若填 GitHub 网页地址（github.com/blob/...）会下载到 HTML，报 `unexpected token '<'`。
> 💡 个人分支 raw 链接中的 `%E4%B8%AA...` 是中文分支名的 URL 编码，直接复制整行使用即可。

---

## 🚀 main 分支：Clash.mini 系列

工程化全功能覆写，DNS / 规则 / 分组三位一体联动，基于业务语义的分流与自动选路。同源双版本，图标体系（Qure / mini Color）完全一致：

| 脚本 | 选路引擎 | 适合人群 | 直链 |
|---|---|---|---|
| **Clash.mini.smart.js** | LightGBM 智能选路（vernesong Smart 内核） | 少手动干预，"开了就用" | [raw](https://raw.githubusercontent.com/MioHueCode/mihomo-overwrite-lab/main/Clash.mini.smart.js) |
| **Clash.mini.normal.js** | url-test / fallback 传统组合 | 偏好手动切换节点 | [raw](https://raw.githubusercontent.com/MioHueCode/mihomo-overwrite-lab/main/Clash.mini.normal.js) |

### 核心能力

- **智能分组体系**：地区组、家宽组（🏡 全球/地区双层）、倍率组（🐎高倍率 / 🐢低倍率）、运营商优化组、流媒体业务组
- **DNS 三位一体**：`default-nameserver` 纯 IP 自举 → 国内直连 DoH → 代理域名走 ECS 精准解析，杜绝 DNS 泄漏与解析死锁
- **规则联动**：GFW / 国内直连 / 局域网 / 流媒体规则集自动装配，`MATCH` 兜底
- **图标统一**：Qure IconSet + Orz-3 mini Color 双源，客户端面板一眼可辨

---

## 🔧 个人关联覆写分支

### nowhere_override.js / substore.js — Nowhere Network 机场专用

> 适配机场：**[Nowhere Network](https://dashboard.nowhere.best/#/register?code=tZ5csUst)**（¥18/年，注册邀请码 `tZ5csUst`）

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

> 直链：[raw](https://raw.githubusercontent.com/MioHueCode/mihomo-overwrite-lab/个人关联覆写/nowhere_override.js)

### mihomo_smart_tier.js（智能版）/ mihomo_normal_tier.js（标准版）— 分级策略精简覆写

基于 [echs-top/proxy](https://github.com/echs-top/proxy) 的思路精简改编：保留 **地区 → 层级 → 家宽 → 倍率** 四级分组结构与 DNS 三位一体联动，砍掉冗余规则，节点全量写入 `proxies`，组用显式节点列表引用，家宽/倍率图标与 Clash.mini 系列同源对齐。**适配任意机场，非机场专用。**

**智能版（mihomo_smart_tier.js）**：Smart 内核 LightGBM 智能选路，懒人一键。

**标准版（mihomo_normal_tier.js）**：url-test/fallback 传统组合，兼容任意内核。

> ⚠️ **与 nowhere_override.js 互斥**：两者同时挂载会互相覆盖分组结构，二选一。

**智能版 raw 直链（点击复制）：**

```
https://raw.githubusercontent.com/MioHueCode/mihomo-overwrite-lab/refs/heads/个人关联覆写/mihomo_smart_tier.js
```

**标准版 raw 直链（点击复制）：**

```
https://raw.githubusercontent.com/MioHueCode/mihomo-overwrite-lab/refs/heads/个人关联覆写/mihomo_normal_tier.js
```

### substore.js — Sub-Store 中转节点生成器

**Nowhere Network 专用**的 Sub-Store Script Operator / Mihomo 覆写两用脚本：把订阅里的落地节点按入口机映射表批量生成 `落地 - 入口` 中转节点。**只管节点生成，DNS 与分组由覆写脚本负责。**

### Clash.mini.*（前置中转版）— MilkCloud 奶云专用

> 适配机场：**[MilkCloud 奶云](https://www.naiyun.vip/i/J8Ulk0cL)**（¥9.9/年）

mini 系列的变体：在 mini 全功能基础上额外接入奶云前置中转节点生成逻辑，适合链式代理场景。同样分双版本：

**智能版（Clash.mini.smart 前置中转版）raw 直链（点击复制）：**

```
https://raw.githubusercontent.com/MioHueCode/mihomo-overwrite-lab/refs/heads/个人关联覆写/Clash.mini.smart%28%E5%89%8D%E7%BD%AE%E4%B8%AD%E8%BD%AC%29.js
```

**标准版（Clash.mini.normal 前置中转版）raw 直链（点击复制）：**

```
https://raw.githubusercontent.com/MioHueCode/mihomo-overwrite-lab/refs/heads/个人关联覆写/Clash.mini.normal%28%E5%89%8D%E7%BD%AE%E4%B8%AD%E8%BD%AC%29.js
```

---

## 📥 使用方法

以 [Mihomo Party](https://github.com/mihomo-party-org/mihomo-party) / [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) 为例：

1. **订阅管理** → 添加你的机场订阅
2. **覆写** → 新建 JavaScript 覆写，粘贴目标脚本内容（或填 raw 直链）
3. 在订阅的「覆写」里勾选该脚本，**只挂一个**（多脚本叠加会互相覆盖分组）
4. 保存后**重启内核**生效

### 推荐客户端

- **[Bettbox](https://github.com/appshubcc/Bettbox)** — Android 端 Mihomo 客户端，界面清爽，对覆写脚本支持完善
- **[Diodos-Android](https://github.com/Devi766/Diodos-Android)** — Android 端轻量客户端，内核切换灵活

桌面端推荐 [Mihomo Party](https://github.com/mihomo-party-org/mihomo-party) 或 [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev)。

> ⚠️ **FlClash 用户**：扩展脚本粘贴的是 raw 链接打开后的**纯文本内容**，第一行必须是 `/**`。若误填 `github.com/blob/...` 网页地址会下载到 HTML，报 `unexpected token '<'`。

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

## 📦 发行版（Releases）

最新 **[v11.0.0 · 全脚本合集](https://github.com/MioHueCode/mihomo-overwrite-lab/releases/tag/v11.0.0)** 一次性打包全部 8 个脚本，按需下载：

| 类别 | 文件 | 版本 |
|---|---|---|
| Clash.mini 通用 | `Clash.mini.smart.js` / `Clash.mini.normal.js` | 智能版 / 标准版 |
| 分级策略精简（echs-top/proxy 改编） | `mihomo_smart_tier.js` / `mihomo_normal_tier.js` | 智能版 / 标准版 |
| Nowhere Network 专用 | `nowhere_override.js` / `substore.js` | — |
| MilkCloud 奶云前置中转 | `Clash.mini.smart_qianzhi.js` / `Clash.mini.normal_qianzhi.js` | 智能版 / 标准版 |

> 前置中转版在 Release 附件中文件名用 `_qianzhi` 代替 `(前置中转)`（GitHub 附件名限制），内容一致。

## 🧾 脚本规范

- 所有脚本纯 ES5/ES6 子集编写，兼容 Mihomo Party / Clash Verge Rev 的 JS 引擎（Boa / QuickJS）
- 外部资源（图标、规则集、DoH）全部集中在文件头部「配置区」，换源只改一处
- 版本号写在文件头部注释，语义化提交（feat / fix / style / chore）

## License

[MIT](LICENSE)
