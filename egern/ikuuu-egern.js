/**
 * ikuuu.co 每日签到 —— Egern 模块脚本（自动抓 Cookie 版）
 *
 * 同一个脚本注册两次：
 *   1) http_request：你手动签到（点 ikuuu 的「签到」按钮）时，自动抓取登录 Cookie 并保存
 *   2) schedule：每天定时用已保存的 Cookie 自动签到领流量
 *
 * 前置：需要 MITM 拦截 ikuuu.co（见模块 yaml），并在 iPhone 上生成/安装
 *       Egern 的 CA 证书并开启信任，否则抓不到 Cookie。
 *
 * 开关：模块设置里的「自动抓取 Cookie」= on/off（默认 on，选 off 才关闭抓取）。
 */

export default async function (ctx) {
  const debug = !!(ctx.env && ctx.env.debug === "true");
  const log = (...a) => console.log(a.join("\n"));

  // 读请求头（兼容 Headers 对象 / 普通对象）
  const getHeader = (name) => {
    const h = ctx.request && ctx.request.headers;
    if (!h) return "";
    if (typeof h.get === "function") return h.get(name) || "";
    const lname = name.toLowerCase();
    for (const k in h) if (k.toLowerCase() === lname) return String(h[k]);
    return "";
  };

  // ===== 模式 1：抓 Cookie（http_request）=====
  if (ctx.request) {
    // 默认开启，只有开关切到 false 才关闭
    const captureOn = !(ctx.env && (ctx.env.auto_capture === "false" || ctx.env.auto_capture === "off"));
    if (!captureOn) {
      if (debug) log("[DEBUG] 自动抓取已关闭，跳过");
      return;
    }

    const cookie = getHeader("cookie");
    if (debug) log("[DEBUG] 命中:", ctx.request.url, "\n[DEBUG] cookie 长度:", cookie.length);

    // 只有同时带 uid（数字）和 key（长十六进制）的完整登录 Cookie 才保存，
    // 避免被不带鉴权的请求把好 Cookie 冲掉
    if (cookie && /uid=\d+/.test(cookie) && /key=[0-9a-f]{32,}/i.test(cookie)) {
      const c = cookie.trim();
      const existing = (ctx.storage.get("ikuuu_cookie") || "").trim();
      if (existing !== c) {
        ctx.storage.set("ikuuu_cookie", c);
        log("[INFO] 已抓取并保存 Cookie");
        ctx.notify({ title: "ikuuu每日签到", subtitle: "已获取 Cookie ✅", body: "手动签到时已自动保存 Cookie，之后每天会自动签到。" });
      } else if (debug) {
        log("[DEBUG] Cookie 无变化，跳过");
      }
    } else if (debug) {
      log("[DEBUG] 该请求没有有效登录 Cookie（未同时含 uid 和 key），跳过");
    }
    return;
  }

  // ===== 模式 2：签到（schedule）=====
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  // 优先用自动抓到的 Cookie，抓不到再退回手动填的备用 Cookie
  const cookie = (ctx.storage.get("ikuuu_cookie") || "").trim() || ((ctx.env && ctx.env.cookie) || "").trim();

  if (!cookie) {
    const hint = "还没有 Cookie。请先：\n1) 确认模块「自动抓取 Cookie」是 on；\n2) 在 Egern 接管流量 + 已装证书的前提下，用浏览器打开 ikuuu.co 手动签到一次，让脚本抓到 Cookie。\n（或直接在模块设置里手动粘贴 Cookie 作备用。）";
    log(hint);
    ctx.notify({ title: "ikuuu每日签到", subtitle: "无 Cookie", body: hint });
    return;
  }

  try {
    if (debug) log("[DEBUG] 开始签到，Cookie 长度 =", cookie.length);

    const resp = await ctx.http.post("https://ikuuu.co/user/checkin", {
      headers: {
        "User-Agent": UA,
        "Cookie": cookie,
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://ikuuu.co/user",
        "Accept": "application/json, text/javascript, */*; q=0.01",
      },
      policy: "DIRECT", // 直连；若签到报“网络错误”，删掉这行改走代理
      timeout: 30000,
      redirect: "follow",
    });

    const status = resp.status;
    const text = await resp.text();
    if (debug) { log("[DEBUG] HTTP", status); log("[DEBUG] body", text); }

    let subtitle, body;

    if (status === 200) {
      let msg = text;
      let ret = null;
      try { const d = JSON.parse(text); if (d && d.msg) msg = d.msg; if (d && d.ret !== undefined) ret = d.ret; } catch (e) {}
      msg = String(msg);

      if (/已经签到|已签到|签到过/.test(msg)) {
        subtitle = "今天已签到过";
        body = msg;
      } else if (ret === 1 || /流量|获得|MB|GB/.test(msg)) {
        subtitle = "签到成功 🎉";
        body = msg;
      } else {
        subtitle = "签到结果";
        body = msg;
      }
    } else if (status === 401 || status === 403) {
      subtitle = "登录失效";
      body = "Cookie 已过期或无效。请用浏览器重新登录 ikuuu.co 并手动签到一次（会自动抓到新 Cookie）。(HTTP " + status + ")";
    } else {
      subtitle = "请求失败";
      body = "HTTP " + status + "\n" + text.slice(0, 200);
    }

    log(subtitle + "\n" + body);
    ctx.notify({ title: "ikuuu每日签到", subtitle: subtitle, body: body });
  } catch (e) {
    const err = (e && (e.stack || e.message)) || String(e);
    log("[ERROR] " + err);
    ctx.notify({
      title: "ikuuu每日签到",
      subtitle: "签到出错",
      body: String(err).slice(0, 300) + "\n\n若提示网络/证书错误，可能是直连不到 ikuuu.co，试试删掉脚本里 policy: \"DIRECT\" 那行改走代理。",
    });
  }
}
