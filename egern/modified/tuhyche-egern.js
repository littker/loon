/**
 * 途虎养车积分签到 —— Egern 原生移植版
 *
 * 原脚本(Quantumult X / Loon / Surge):
 *   https://raw.githubusercontent.com/Crazy-Z7/Task/refs/heads/main/Tuhyche.js
 * 本次改动: 把 Surge/Loon/QX 的 Env 适配层换成 Egern 原生 ctx API; 签到逻辑与原脚本一致。
 *
 * @Author: Zoo (Crazy-Z7)
 *
 * ===== 用法(Egern, 同一个脚本注册两次) =====
 * 1) 抓凭证 —— 作为 http_request 脚本, match:
 *      ^https://api\.tuhu\.cn/User/GetUserCurrentAndNextGradeInfo
 *    需要 MITM: api.tuhu.cn。用户在微信「途虎」小程序打开积分页面时自动抓到 Authorization + blackbox。
 * 2) 签到 —— 作为 schedule 脚本, cron "40 8 * * *", 每天 08:40 用凭证签到(小程序 + App 两个渠道)并查积分。
 */

export default async function (ctx) {
  // ===== Egern 适配层(替代原 Surge/Loon/QX 的 Env 类) =====
  function Env(name, c) {
    const log = (...a) => console.log(a.join("\n"));
    const getdata = (k) => c.storage.get(k);
    const setdata = (v, k) => { c.storage.set(k, v == null ? "" : String(v)); return true; };
    const toStr = (o) => { try { return JSON.stringify(o); } catch (e) { return String(o); } };
    // setTimeout 在 Egern 环境未必存在, 加保护: 有则延时, 无则立即放行(仅用于签到之间的礼貌间隔)
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
  // 读取请求头(兼容 Headers 对象和普通对象, 大小写不敏感)
  const getHeader = (name) => {
    const h = ctx.request && ctx.request.headers;
    if (!h) return "";
    if (typeof h.get === "function") return h.get(name) || "";
    const lname = name.toLowerCase();
    for (const k in h) if (k.toLowerCase() === lname) return String(h[k]);
    return "";
  };

  // ===== 模式 1: 抓凭证(http_request 脚本) =====
  if (ctx.request) {
    const session = {
      url: ctx.request.url || "",
      token: getHeader("authorization"),
      blackbox: getHeader("blackbox"),
    };
    $.setdata(JSON.stringify(session), signKeyTU);
    if (session.token) {
      ctx.notify({ title: "途虎养车", subtitle: "获取会话: 成功!", body: "authorization 已抓到，可去运行签到" });
    } else {
      ctx.notify({ title: "途虎养车", subtitle: "获取会话: 未抓到", body: "没读到 authorization，请确认已在途虎小程序登录并打开积分页面" });
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
          resolve({ title: `${name}签到结果: ${res.message || "签到失败"}`, details: res.data ? $.toStr(res.data) : "" });
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
