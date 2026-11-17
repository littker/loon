/**
 * ikuuu.co 每日签到 —— Egern 模块脚本
 *
 * 用途：每天定时调用 ikuuu 的签到接口，领取免费流量。
 *   签到接口：POST https://ikuuu.co/user/checkin
 *   成功返回：{"msg":"你获得了 XX MB流量","ret":1}
 *   重复返回：{"msg":"您似乎已经签到过了...","ret":0}
 *
 * 使用前：在 Egern 里打开本模块的设置页，把登录 ikuuu.co 后从浏览器
 *         请求头（Request Headers）复制的「完整 Cookie」填进去。
 *         Cookie 约 7 天过期，失效后（提示“登录失效”）需重新登录并更新。
 *
 * 注意：脚本默认 policy 为 DIRECT（直连）。若签到报“网络错误”，
 *       把下面 policy: "DIRECT" 这一行删掉，改走代理再试。
 */

export default async function (ctx) {
  const cookie = (ctx.env && ctx.env.cookie) || "";
  const debug = !!(ctx.env && ctx.env.debug === "true");

  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const log = (...a) => console.log(a.join("\n"));

  if (!cookie) {
    const hint = "还没有配置 Cookie。请在 Egern 里打开本模块的设置页，把登录 ikuuu.co 后复制的完整 Cookie 填进去。";
    log(hint);
    ctx.notify({ title: "ikuuu每日签到", subtitle: "未配置 Cookie", body: hint });
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
      body = "Cookie 已过期或无效，请重新登录 ikuuu.co 并更新模块里的 Cookie。(HTTP " + status + ")";
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
      body: String(err).slice(0, 300) + "\n\n若提示网络/证书错误，可能是直连不到 ikuuu.co，试试删掉脚本里的 policy: \"DIRECT\" 那行改走代理。",
    });
  }
}
