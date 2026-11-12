/**
 * 途虎养车积分签到 —— Egern 原生移植版 v2
 *
 * v2 修复(v1 的坑):
 *   1) 抓凭证只在读到 authorization 时才保存; 没读到则保留已有凭证, 不再用空值覆盖(这会导致"抓到了又没了")。
 *   2) 凭证无变化时静默更新, 不再重复弹通知。
 *   3) "未抓到" 通知 10 分钟内只弹一次, 不再刷屏。
 *   4) 新增 debug 开关: 打开后打印命中的 URL 与全部请求头, 用于排查实际带的是哪个头。
 *   5) match 放宽为整个 api.tuhu.cn(不只盯单个接口), 更容易抓到 token。
 *
 * 原脚本(Quantumult X / Loon / Surge):
 *   https://raw.githubusercontent.com/Crazy-Z7/Task/refs/heads/main/Tuhyche.js
 * @Author: Zoo (Crazy-Z7)
 *
 * ===== 用法(Egern, 同一个脚本注册两次) =====
 * 1) 抓凭证 —— http_request 脚本, match: ^https://api\.tuhu\.cn/  需要 MITM: api.tuhu.cn
 * 2) 签到 —— schedule 脚本, cron "40 8 * * *"
 */

export default async function (ctx) {
  // ===== Egern 适配层 =====
  function Env(name, c) {
    const log = (...a) => console.log(a.join("\n"));
    const getdata = (k) => c.storage.get(k);
    const setdata = (v, k) => { c.storage.set(k, v == null ? "" : String(v)); return true; };
    const toStr = (o) => { try { return JSON.stringify(o); } catch (e) { return String(o); } };
    const wait = (ms) => new Promise((r) => { if (typeof setTimeout === "function") setTimeout(r, ms); else r(); });
    function req(opt, method, cb) {
      const o = (typeof opt === "string") ? { url: opt } : (opt || {});
      const opts = { headers: o.headers || {}, timeout: 30000, redirect: "follow" };
      if (o.policy) opts.policy = o.policy;
      if (o.body != null) opts.body = o.body;
      const p = (method === "POST") ? c.http.post(o.url, opts) : c.http.get(o.url, opts);
      p.then(async (resp) => {
        let text = "";
        try { text = await resp.text(); } catch (e) {}
        cb(null, { status: resp.status, statusCode: resp.status, headers: resp.headers, body: text }, text);
      }).catch((err) => cb(err, null, null));
    }
    const get = (opt, cb) => req(opt, "GET", cb);
    const post = (opt, cb) => req(opt, "POST", cb);
    const msg = (title, subtitle, body, opt) => {
      const n = { title: title, subtitle: subtitle || "", body: body || "" };
      if (opt && opt.url) n.action = { type: "openUrl", url: opt.url };
      c.notify(n);
    };
    const logErr = (e) => console.log("[ERROR]", e && (e.stack || e.message || e));
    const done = () => {};
    return { name: name, log: log, logErr: logErr, getdata: getdata, setdata: setdata, toStr: toStr, wait: wait, get: get, post: post, msg: msg, done: done };
  }
  const $ = new Env("途虎养车", ctx);
  const signKeyTU = "TU_usersignKeyTU";

  const safeJSONParse = (str) => {
    if (typeof str !== "string") return null;
    const s = str.trim();
    if (!s) return null;
    try { return JSON.parse(s); } catch (e) { return null; }
  };
  const getHeader = (name) => {
    const h = ctx.request && ctx.request.headers;
    if (!h) return "";
    if (typeof h.get === "function") return h.get(name) || "";
    const lname = name.toLowerCase();
    for (const k in h) if (k.toLowerCase() === lname) return String(h[k]);
    return "";
  };
  const debug = !!(ctx.env && ctx.env.debug === "true");

  // ===== 模式 1: 抓凭证(http_request 脚本) =====
  if (ctx.request) {
    const token = getHeader("authorization");
    const blackbox = getHeader("blackbox");

    if (debug) {
      console.log("[DEBUG] 命中 URL:", ctx.request.url);
      console.log("[DEBUG] authorization =", JSON.stringify(token));
      console.log("[DEBUG] blackbox =", JSON.stringify(blackbox));
      const h = ctx.request.headers;
      console.log("[DEBUG] 全部请求头:");
      if (h && typeof h.get === "function") {
        try { h.forEach((v, k) => console.log("   " + k + ": " + v)); } catch (e) { console.log("   (Headers 无法遍历)"); }
      } else {
        console.log("   ", JSON.stringify(h));
      }
    }

    const existing = safeJSONParse($.getdata(signKeyTU) || "") || {};

    if (token) {
      // 关键修复: 只在有 token 时才写, 避免空值覆盖
      const changed = existing.token !== token || existing.blackbox !== blackbox;
      $.setdata(JSON.stringify({ url: ctx.request.url || "", token: token, blackbox: blackbox }), signKeyTU);
      if (changed) {
        console.log("[INFO] 抓凭证成功, 已保存");
        ctx.notify({ title: "途虎养车", subtitle: "获取会话: 成功!", body: "" });
      } else {
        console.log("[INFO] 凭证无变化, 静默更新");
      }
    } else {
      console.log("[INFO] 命中请求但无 authorization(保留已有凭证, 当前已有=" + !!(existing && existing.token) + ")");
      // 未抓到且本机也没有凭证时, 10 分钟内只弹一次, 避免刷屏
      const now = Date.now();
      const lastFail = Number($.getdata("tuhu_last_fail_ts") || "0") || 0;
      if (!(existing && existing.token) && now - lastFail > 10 * 60 * 1000) {
        $.setdata(String(now), "tuhu_last_fail_ts");
        ctx.notify({
          title: "途虎养车", subtitle: "获取会话: 未抓到",
          body: "没读到 authorization 头。请逐项确认:\n1) 已生成并安装 Egern 的 CA 证书, 且在「设置→通用→关于→证书信任设置」里开启信任;\n2) 模块 MITM 含 api.tuhu.cn;\n3) 打开 debug 开关后把日志发我, 排查实际带的是哪个请求头。",
        });
      }
    }
    return;
  }

  // ===== 模式 2: 签到(schedule 脚本) =====
  async function sign(channel, name) {
    return new Promise((resolve) => {
      const session = safeJSONParse($.getdata(signKeyTU) || "") || {};
      const req = {
        url: "https://cl-gateway.tuhu.cn/cl-common-api/api/dailyCheckIn/userCheckIn",
        headers: {
          "Authorization": session.token || "",
          "Content-Type": "application/json",
          "authType": "oauth",
          "blackbox": session.blackbox || "",
          "Host": "cl-gateway.tuhu.cn",
          "api_level": "2",
          "channel": "iOS",
          "version": "7.40.0",
          "needErrorCode": "true",
        },
        body: JSON.stringify({ channel: channel }),
      };
      $.post(req, (err, resp, data) => {
        if (err) {
          return resolve({ title: `${name}签到结果: 请求错误`, details: String(err) });
        }
        const res = safeJSONParse(data);
        if (!res) {
          return resolve({ title: `${name}签到结果: JSON解析失败`, details: `status=${resp && resp.statusCode}\n${String(data).slice(0, 200)}` });
        }
        const add = res.data && res.data.rewardIntegral;
        const days = res.data && res.data.continuousDays;
        if (add !== undefined) {
          resolve({ title: `${name}签到结果: 签到成功`, details: `积分增加:${add}\n已连续签到:${days != null ? days : "-"}/7天` });
        } else {
          const msg = res.message || res.msg || "签到失败";
          const authHint = /登录|鉴权|token|过期|失效|401|403|未登录/i.test(msg) ? "\n(提示: 凭证可能已过期, 请重新进入途虎小程序抓取)" : "";
          resolve({ title: `${name}签到结果: ${msg}`, details: (res.data ? $.toStr(res.data) : "") + authHint });
        }
      });
    });
  }

  async function getPoints() {
    return new Promise((resolve) => {
      const session = safeJSONParse($.getdata(signKeyTU) || "") || {};
      const req = {
        url: "https://api.tuhu.cn/User/GetPersonalCenterQuantity",
        headers: { "Authorization": session.token || "", "Content-Type": "application/json" },
        body: "",
      };
      $.post(req, (err, resp, data) => {
        if (err) return resolve(`❌积分查询失败 - 请求错误: ${String(err)}`);
        const res = safeJSONParse(data);
        if (!res) return resolve(`❌积分查询失败 - JSON解析异常\nstatus=${resp && resp.statusCode}\n${String(data).slice(0, 200)}`);
        if (res.Code == 1) {
          resolve(`🎉当前积分: ${res.IntegralNumber}分 可抵现💰:${res.IntegralNumber / 100}元`);
        } else {
          resolve(`❌积分查询失败`);
        }
      });
    });
  }

  async function main() {
    const session = safeJSONParse($.getdata(signKeyTU) || "") || {};
    if (!session.token) {
      const hint = "还没抓到登录凭证。请先在微信打开「途虎」小程序 → 进入积分页面，让抓凭证脚本拿到授权，再运行签到。";
      console.log(hint);
      $.msg("途虎养车签到", "未抓到凭证", hint);
      return;
    }
    const signResult1 = await sign("wxapp", "小程序");
    await $.wait(1000);
    const signResult2 = await sign("app", "App");
    await $.wait(1000);
    const pointsResult = await getPoints();

    const notificationMessage = [
      signResult1.title, signResult1.details,
      signResult2.title, signResult2.details,
      pointsResult,
    ].filter(Boolean).join("\n");

    console.log(notificationMessage);
    $.msg("途虎养车签到结果", "", notificationMessage);
  }

  await main().catch((e) => { $.logErr(e); });
}
