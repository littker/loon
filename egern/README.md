# Egern 脚本

> 三个签到脚本的原生版与修改版。**Egern 原生兼容 Surge/Loon 脚本 API，直接用 originals/ 里的原版即可，无需移植。**

## 目录说明

### originals/（原生脚本，推荐直接用）

| 文件 | 应用 | 来源 |
|---|---|---|
| `sgcc.js` | 网上国网积分签到 | MaYIHEI/paperclip |
| `Tuhyche.js` | 途虎养车积分签到 | Crazy-Z7/Task |
| `qqmusic.js` | QQ音乐每日任务/金币/红包雨 | MaYIHEI/paperclip |
| `baidunetdisk.js` | 百度网盘会员签到+答题 | MaYIHEI/paperclip |
| `dreame.js` | 追觅商城每日签到 | MaYIHEI/paperclip |
| `youpin.js` | 小米有品每日签到红包 | MaYIHEI/paperclip |

### modified/（修改版）

| 文件 | 说明 | 状态 |
|---|---|---|
| `tuhyche-fixed.js` | 途虎安全版：抓凭证时只在读到 authorization 才保存，防被无鉴权请求覆盖 | ✅ 推荐 |
| `sgcc-egern.js` | 网上国网 ctx 移植版 | 已过时（用原版即可） |
| `tuhyche-egern.js` / `-v2.js` | 途虎 ctx 移植版 | 已过时 |
| `qqmusic-egern.js` / `-v2.js` | QQ音乐 ctx 移植版 | 已过时 |

## 关键经验（2026-11）

1. **Egern 原生支持 Surge/Loon 脚本**（`$httpClient`/`$persistentStore`/`$done`/`$request`），官方文档只写了 `ctx` API，实际原脚本直接挂 URL 就能跑。
2. **抓包 match 别太精确**：老脚本的接口 URL 可能已变，抓不到时放宽 match（如途虎放宽到 `^https://(api|cl-gateway)\.tuhu\.cn/`）。
3. **MITM + CA 证书信任**是抓包前提：装证书后还要去「设置 → 通用 → 关于 → 证书信任设置」开启完全信任。
