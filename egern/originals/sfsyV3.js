/*
------------------------------------------
@Date: 2026.02.22
@Description: 顺丰速运
------------------------------------------
new Env("顺丰速运");
cron 9 11 * * *  sfsyV3.js

@Description:
脚本兼容：Surge、QuantumultX、Loon、Shadowrocket，不支持青龙

[rewrite_local]
https:\/\/ccsp-egmas.sf-express.com\/cx-app-member\/member\/app\/user\/universalSign url script-request-body https://gist.githubusercontent.com/Sliverkiss/94d6cc7f528acfe895e9df6c6ce0d039/raw/sfsyV3.js

[MITM]
hostname = ccsp-egmas.sf-express.com

⚠️【免责声明】
------------------------------------------
1、此脚本仅用于学习研究，不保证其合法性、准确性、有效性，请根据情况自行判断，本人对此不承担任何保证责任。
2、由于此脚本仅用于学习研究，您必须在下载后 24 小时内将所有内容从您的计算机或手机或任何存储设备中完全删除，若违反规定引起任何事件本人对此均不负责。
3、请勿将此脚本用于任何商业或非法目的，若违反规定请自行对此负责。
4、此脚本涉及应用与本人无关，本人对因此引起的任何隐私泄漏或其他后果不承担任何责任。
5、本人对任何脚本引发的问题概不负责，包括但不限于由脚本错误引起的任何损失和损害。
6、如果任何单位或个人认为此脚本可能涉嫌侵犯其权利，应及时通知并提供身份证明，所有权证明，我们将在收到认证文件确认后删除此脚本。
7、所有直接或间接使用、查看此脚本的人均应该仔细阅读此声明。本人保留随时更改或补充此声明的权利。一旦您使用或复制了此脚本，即视为您已接受此免责声明。
*/
const $ = new Env("顺丰速运");
//notify
const notify = $.isNode() ? require('./sendNotify') : '';
const ckName = "sfsy_data";
// --- 开始：青龙面板兼容性改造 ---
let userCookie = [];
let rawData = $.isNode() ? (process.env[ckName] || "") : ($.getdata(ckName) || "");

if (rawData) {
    try {
        // 先尝试正常解析
        userCookie = JSON.parse(rawData);
        if (!Array.isArray(userCookie)) userCookie = [userCookie];
    } catch (e) {
        // 兼容青龙：自动处理带 & 拼接或带换行符、中文说明的“脏数据”
        console.log("检测到非标准JSON格式，正在自动清洗和提取账号数据...");
        let parts = rawData.split(/&|@|\n/);
        for (let part of parts) {
            if (!part.trim()) continue;
            try {
                let parsed = JSON.parse(part.trim());
                if (Array.isArray(parsed)) {
                    userCookie.push(...parsed);
                } else if (parsed && typeof parsed === 'object') {
                    userCookie.push(parsed);
                }
            } catch (err) {
                // 遇到无法解析的中文废话直接忽略，不报错
            }
        }
    }
}
// --- 结束：青龙面板兼容性改造 ---


//用户多账号配置
$.userIdx = 0, $.userList = [], $.notifyMsg = [];
//成功个数
$.succCount = 0;
//debug
$.is_debug = ($.isNode() ? process.env.IS_DEDUG : $.getdata('is_debug')) || 'false';
$.unTaskList = ["完成连签7天", "参与积分活动", "每月累计寄件", "完成每月任务", "与好友微信分享会员福利", "去新增一个收件偏好", "用行业模板寄件下单", "用积分兑任意礼品", "设置你的顺丰ID"]
//------------------------------------------
async function main() {
    for (let user of $.userList) {
        $.log(`\n------------- 账号${user.index} -------------\n`)
        //$.notifyMsg = [], $.title = "";
        try {
            let sign = await user?.login();
            await user?.refresh_cookie(sign);
            if (user.ckStatus) {
                let pointF = await user.getPoint() ?? {};
                await user.signin();
                let taskList = await user?.getTaskList();
                for (let item of taskList) {
                    switch (item?.status) {
                        case 2:
                            if (/生活特权/.test(item?.title)) {
                                let coupomList = await user?.getCoupomList();
                                for (let goods of coupomList) {
                                    const exchangeStatus = goods?.exchangeStatus ?? -1;
                                    const exchangeMemLevel = goods?.exchangeMemLevel ?? -1;

                                    if (exchangeStatus < 2 && exchangeMemLevel == 0) {
                                        let goodsNo = goods.goodsNo;
                                        let coupomResult = await user.getCoupom(item, goodsNo);
                                        if (coupomResult) {
                                            $.info(`[${user.userName || user.index}] 当前选择券号：${goodsNo}`);
                                            $.info(`[${user.userName || user.index}] 领券结果：${coupomResult}`);
                                        }
                                        break;
                                    }
                                }
                            } else {
                                await user?.finishTask(item);
                            }
                        case 1:
                            await user?.reportTask(item);
                            await user?.reviceReward(item);
                            break;

                    }
                }
                let pointE = await user.getPoint() ?? {};
                $.notifyMsg.push(`[${user.userName}] 积分:${pointF}${pointE >= pointF ? "+" : ""}${pointE - 0 - pointF}`);
                $.succCount++;

            } else {
                $.error(`[${user?.userName}] ck已失效，用户需要去登录`);
                $.notifyMsg.push(`[${user?.userName}] 积分:ck已失效，用户需要去登录`);
            }
        } catch (e) {
            throw e
        }
    }
    $.title = `共${$.userList.length}个账号,成功${$.succCount}个,失败${$.userList.length - 0 - $.succCount}个`
    //notify
    await sendMsg($.notifyMsg.join("\n"), { $media: $.avatar });
}



//用户
class UserInfo {
    constructor(user) {
        //-------------------------- 固定不动区域 ---------------------------------
        this.index = ++$.userIdx;
        this.avatar = user.avatar;
        this.ckStatus = true;
        this.userId = "" || user.userId;
        this.phone = user.phone;
        this.userName = user?.userName || this?.phone || this.userId || this.index;
        this.token = "" || user.token || user;
        //-------------------------- 请求封装区域 ---------------------------------
        //请求封装
        this.baseUrl = `https://userone.angelgroup.com.cn`;
        this.headers = {
            'content-type': `application/json`,
        };
        //
        return createProxy(this, this.handleError); // 使用 Proxy 包装实例
    }
    //-------------------------- 工具函数区域 ---------------------------------
    // 通用错误处理方法
    handleError(error) {
        this.ckStatus = false;
        $.error(`[${this.userName}] 发生错误：${error.message}`);
    }
    // 通用请求方法
    async fetch(o) {
        const options = typeof o === 'string' ? { url: o } : o;
        const url = new URL(options.url || '', this.baseUrl).href;

        let res = await Request({
            ...options,
            headers: options.headers || this.headers,
            url: url
        });
        //$.info(`[${this.userName}] 等待3秒,避免风控...`)

        debug(res, url.replace(/\/+$/, '').substring(url.lastIndexOf('/') + 1));
        //if (res?.msg && /请重新登录/.test(res.msg)) throw new Error(`登录错误: ${res.msg}`);
        return res;
    }
    //-------------------------- 脚本函数区域 ---------------------------------
    // 登录
    async login() {
        delete this.token.headers.cookie;
        const opts = {
            "url": this.token?.url,
            "type": "post",
            "dataType": "json",
            "headers": this.token?.headers,
            "body": this.token?.body,
        }
        let res = await this.fetch(opts);
        return res?.obj?.sign;
    }
    //获取登录token
    async refresh_cookie(sign) {
        await this.fetch({
            url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/share/app/shareRedirect?sign=${encodeURIComponent(sign)}&source=SFAPP&bizCode=647@RnlvejM1R3VTSVZ6d3BNaXJxRFpOUVVtQkp0ZnFpNDBKdytobm5TQWxMeHpVUXVrVzVGMHVmTU5BVFA1bXlwcw==`,
            type: "get",
            "followRedirect": false
        });;
    }
    //查询用户积分信息
    async getPoint() {
        const opts = {
            url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberIntegral~userInfoService~queryUserInfo`,
            type: "post",
            dataType: "json",
            body: {
                sysCode: "ESG-CEMP-CORE",
                optionalColumns: ["usablePoint", "cycleSub", "leavePoint"],
                token: "zeTLTYeG0bLetfRk"
            }
        }
        let res = await this.fetch(opts);
        $.info(`[${this.userName}] 当前积分:${res?.obj?.usablePoint}`)
        return res?.obj?.usablePoint;
    }
    // 签到
    async signin() {
        const opts = {
            url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~integralTaskSignPlusService~automaticSignFetchPackage`,
            type: "post",
            dataType: "json",
            body: {
                comeFrom: "vioin",
                channelFrom: "SFAPP"
            }
        }
        let res = await this.fetch(opts);
        $.info(`[${this.userName}] 签到:${res?.errorMessage || res?.success}`)
    }
    // 获取任务列表
    async getTaskList(channelType) {
        const opts = {
            url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~integralTaskStrategyService~queryPointTaskAndSignFromES`,
            type: "post",
            dataType: "json",
            body: {
                channelType: channelType || "1"
            }
        }
        let res = await this.fetch(opts);
        let taskList = res?.obj?.taskTitleLevels.filter(e => !$.unTaskList.includes(e.title));
        taskList.forEach(e => {
            if (!e?.taskCode) {
                const [, taskId] = decodeURIComponent($.toStr(e?.buttonRedirect)).match(/"taskId"\s*:\s*"([^"]+)"/);
                e.taskCode = taskId;
            }
        })
        return taskList;
    }
    // 完成任务
    async finishTask(task, obj = {}) {
        const opts = {
            url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonRoutePost/memberEs/taskRecord/finishTask`,
            type: "post",
            dataType: "json",
            body: {
                taskCode: task.taskCode,
                ...obj
            }
        }
        let res = await this.fetch(opts);
        $.info(`[${this.userName}] 完成[${task.title}]任务:${res.success}`);
    }
    // 领取奖励
    async reviceReward(task) {
        const opts = {
            url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~integralTaskStrategyService~fetchIntegral`,
            type: "post",
            dataType: "json",
            body: {
                strategyId: task.strategyId,
                taskId: task.taskId,
                taskCode: task.taskCode,
                channelType: "1"
            }
        }
        let res = await this.fetch(opts);
        $.info(`[${this.userName}] 领取[${task.title}]奖励:${res.success}`);
    }
    // 上报任务完成情况
    async reportTask(task) {
        const opts = {
            url: `https://ccsp-egmas.sf-express.com/cx-app-member/member/app/memberActivity/reportTask`,
            type: "post",
            dataType: "json",
            body: {
                mobile: this.userName,
                taskCode: task.taskCode,
            }
        }
        let res = await this.fetch(opts);
        $.info(`[${this.userName}] 上报[${task.title}]任务:${res.success}`);
    }
    // 获取生活权益列表
    async getCoupomList() {
        const opts = {
            url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberGoods~mallGoodsLifeService~list`,
            type: "post",
            dataType: "json",
            body: { "memGrade": 3, "categoryCode": "SHTQ" }
        }
        let res = await this.fetch(opts);
        let goodsList = [];

        for (const category of res.obj) {
            goodsList.push(...(category.goodsList || []));
        }
        return goodsList.filter(goods => (goods?.currentStore ?? 0) > 0);
    }
    // 领取生活权益
    async getCoupom(task, goodsNo) {
        const opts = {
            url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberGoods~pointMallService~createOrder`,
            type: "post",
            dataType: "json",
            body: { "from": "Point_Mall", "orderSource": "POINT_MALL_EXCHANGE", "goodsNo": goodsNo, "quantity": 1, "taskCode": task.taskCode }
        }
        let res = await this.fetch(opts);
        return res?.obj?.orderNo;
    }
}



// 远程通知
async function getNotice() {
    const urls = [
        "https://fastly.jsdelivr.net/gh/Sliverkiss/GoodNight@main/notice.json",
        "https://fastly.jsdelivr.net/gh/Sliverkiss/GoodNight@main/tip.json"
    ];

    try {
        const responses = await Promise.all(urls.map(url => Request(url)));
        responses.map(result => $.log(result?.notice || "获取通知失败"));
        if (responses[0]?.notice) return true;
    } catch (error) {
        console.log(`❌获取通知时发生错误：${error}`);
    }
}

function maskString(input) {
    try {
        if (input?.length <= 6) {
            return input;  // 如果字符串长度小于等于6，直接返回
        }

        // 获取前三位和后三位
        let start = input.slice(0, 3);
        let end = input.slice(-3);

        // 返回处理后的字符串
        return `${start}****${end}`;
    } catch (e) {
        return input
    }
}

function generateRandomString(len = 1) {
    const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
    let result = "";
    for (let i = 0; i < len; i++) {
        const idx = Math.floor(Math.random() * chars.length);
        result += chars[idx];
    }
    return result;
}



function phone_num(phone_num) { if (phone_num.length == 11) { let data = phone_num.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2"); return data; } else { return phone_num; } }

// 获取Cookie
async function getCookie() {
    try {
        if ($request && $request.method === 'OPTIONS') return;

        //const headers = ObjectKeys2LowerCase($request.headers);
        const Body = $.toObj($request.body);

        const userId = Body?.userId;
        const token = {
            "url": $request.url,
            "headers": ObjectKeys2LowerCase($request.headers),
            "body": $request?.body
        };
        const userName = Body?.mobile;

        if (!(userId && token && userName)) throw new Error("获取token失败！参数缺失");

        const newData = {
            "userId": userId,
            "token": token,
            "userName": userName
        }
        const index = userCookie.findIndex(e => e.userId == newData.userId);

        userCookie[index] ? userCookie[index] = newData : userCookie.push(newData);

        $.setjson(userCookie, ckName);
        $.msg($.name, `🎉账号[${newData.userName}]更新token成功!`, ``);
    } catch (e) {
        throw e;
    }
}

//处理node
function getEnvByNode() {
    ckList = ($.isNode() ? process.env[ckName] : $.getdata(ckName)) || "";
    ckList = ckList.split("&");
    ckList = ckList.map(e => {
        let newData = {
            "phone": e
        }
        return newData
    });
    return ckList;
}

//主程序执行入口
!(async () => {
    if (typeof $request != "undefined") {
        await getCookie();
    } else {
        if (!(await getNotice())) throw new Error("网络状况不好，请重新尝试~")
        await checkEnv();
        await main();
    }
})()
    .catch((e) => { $.logErr(e), $.msg($.name, `⛔️ script run error!`, e.message || e) })
    .finally(() => $.done());

/** ---------------------------------固定不动区域----------------------------------------- */
//prettier-ignore
function createProxy(t, n) { return new Proxy(t, { get(t, r) { const c = t[r]; return "function" == typeof c ? async function (...r) { try { return await c.apply(t, r) } catch (r) { n.call(t, r) } } : c } }) }
async function sendMsg(a, e) { a && ($.isNode() ? await notify.sendNotify($.name, a) : $.msg($.name, $.title || "", a, e)) }
function DoubleLog(o) { o && ($.log(`${o}`), $.notifyMsg.push(`${o}`)) };
async function checkEnv() { try { if (!userCookie?.length) throw new Error("no available accounts found"); $.log(`\n[INFO] 检测到 ${userCookie?.length ?? 0} 个账号\n`), $.userList.push(...userCookie.map((o => new UserInfo(o))).filter(Boolean)) } catch (o) { throw o } }
function debug(g, e = "debug") { "true" === $.is_debug && ($.log(`\n-----------${e}------------\n`), $.log("string" == typeof g ? g : $.toStr(g) || `debug error => t=${g}`), $.log(`\n-----------${e}------------\n`)) }
//From xream's ObjectKeys2LowerCase
function ObjectKeys2LowerCase(obj) { return !obj ? {} : Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v])) };
//From sliverkiss's Request
async function Request(t) { "string" == typeof t && (t = { url: t }); try { if (!t?.url) throw new Error("[URL][ERROR] 缺少 url 参数"); let { url: o, type: e, headers: r = {}, body: s, params: a, dataType: n = "form", resultType: u = "data" } = t; const p = e ? e?.toLowerCase() : "body" in t ? "post" : "get", c = o.concat("post" === p ? "?" + $.queryStr(a) : ""), i = t.timeout ? $.isSurge() ? t.timeout / 1e3 : t.timeout : 1e4; "json" === n && (r["Content-Type"] = "application/json;charset=UTF-8"); const y = "string" == typeof s ? s : (s && "form" == n ? $.queryStr(s) : $.toStr(s)), l = { ...t, ...t?.opts ? t.opts : {}, url: c, headers: r, ..."post" === p && { body: y }, ..."get" === p && a && { params: a }, timeout: i }, m = $.http[p.toLowerCase()](l).then((t => "data" == u ? $.toObj(t.body) || t.body : $.toObj(t) || t)).catch((t => $.log(`[${p.toUpperCase()}][ERROR] ${t}\n`))); return Promise.race([new Promise(((t, o) => setTimeout((() => o("当前请求已超时")), i))), m]) } catch (t) { console.log(`[${p.toUpperCase()}][ERROR] ${t}\n`) } }
//jwt parse tool
function parseJwt(t) { const e = t.split("."); if (3 !== e.length) throw new Error("Invalid JWT token"); const a = JSON.parse(o(e[0])), r = JSON.parse(o(e[1])), n = new Date(1e3 * r.exp), p = new Date(parseInt(r.create_date)); return { header: a, payload: r, expDate: g(n), createDate: g(p) }; function o(t) { let e = t.replace(/-/g, "+").replace(/_/g, "/"), a = e.length % 4; a && (e += "=".repeat(4 - a)); const r = atob(e); return decodeURIComponent(escape(r)) } function g(t) { return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")}` } }
//From chavyleung's Env.js
function Env(t, e) { class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise(((e, i) => { s.call(this, t, ((t, s, o) => { t ? i(t) : e(s) })) })) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.logLevels = { debug: 0, info: 1, warn: 2, error: 3 }, this.logLevelPrefixs = { debug: "[DEBUG] ", info: "[INFO] ", warn: "[WARN] ", error: "[ERROR] " }, this.logLevel = "info", this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.encoding = "utf-8", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } getEnv() { return "undefined" != typeof $environment && $environment["surge-version"] ? "Surge" : "undefined" != typeof $environment && $environment["stash-version"] ? "Stash" : "undefined" != typeof module && module.exports ? "Node.js" : "undefined" != typeof $task ? "Quantumult X" : "undefined" != typeof $loon ? "Loon" : "undefined" != typeof $rocket ? "Shadowrocket" : void 0 } isNode() { return "Node.js" === this.getEnv() } isQuanX() { return "Quantumult X" === this.getEnv() } isSurge() { return "Surge" === this.getEnv() } isLoon() { return "Loon" === this.getEnv() } isShadowrocket() { return "Shadowrocket" === this.getEnv() } isStash() { return "Stash" === this.getEnv() } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null, ...s) { try { return JSON.stringify(t, ...s) } catch { return e } } getjson(t, e) { let s = e; if (this.getdata(t)) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise((e => { this.get({ url: t }, ((t, s, i) => e(i))) })) } runScript(t, e) { return new Promise((s => { let i = this.getdata("@chavy_boxjs_userCfgs.httpapi"); i = i ? i.replace(/\n/g, "").trim() : i; let o = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); o = o ? 1 * o : 20, o = e && e.timeout ? e.timeout : o; const [r, a] = i.split("@"), n = { url: `http://${a}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: o }, headers: { "X-Key": r, Accept: "*/*" }, timeout: o }; this.post(n, ((t, e, i) => s(i))) })).catch((t => this.logErr(t))) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e); if (!s && !i) return {}; { const i = s ? t : e; try { return JSON.parse(this.fs.readFileSync(i)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e), o = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, o) : i ? this.fs.writeFileSync(e, o) : this.fs.writeFileSync(t, o) } } lodash_get(t, e, s) { const i = e.replace(/\[(\d+)\]/g, ".$1").split("."); let o = t; for (const t of i) if (o = Object(o)[t], void 0 === o) return s; return o } lodash_set(t, e, s) { return Object(t) !== t || (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce(((t, s, i) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[i + 1]) >> 0 == +e[i + 1] ? [] : {}), t)[e[e.length - 1]] = s), t } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t), o = s ? this.getval(s) : ""; if (o) try { const t = JSON.parse(o); e = t ? this.lodash_get(t, i, "") : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, i, o] = /^@(.*?)\.(.*?)$/.exec(e), r = this.getval(i), a = i ? "null" === r ? null : r || "{}" : "{}"; try { const e = JSON.parse(a); this.lodash_set(e, o, t), s = this.setval(JSON.stringify(e), i) } catch (e) { const r = {}; this.lodash_set(r, o, t), s = this.setval(JSON.stringify(r), i) } } else s = this.setval(t, e); return s } getval(t) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.read(t); case "Quantumult X": return $prefs.valueForKey(t); case "Node.js": return this.data = this.loaddata(), this.data[t]; default: return this.data && this.data[t] || null } } setval(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.write(t, e); case "Quantumult X": return $prefs.setValueForKey(t, e); case "Node.js": return this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0; default: return this.data && this.data[e] || null } } initGotEnv(t) { this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.cookie && void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar))) } get(t, e = (() => { })) { switch (t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"], delete t.headers["content-type"], delete t.headers["content-length"]), t.params && (t.url += "?" + this.queryStr(t.params)), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, ((t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, i) })); break; case "Quantumult X": this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: i, headers: o, body: r, bodyBytes: a } = t; e(null, { status: s, statusCode: i, headers: o, body: r, bodyBytes: a }, r, a) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let s = require("iconv-lite"); this.initGotEnv(t), this.got(t).on("redirect", ((t, e) => { try { if (t.headers["set-cookie"]) { const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString(); s && this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar } } catch (t) { this.logErr(t) } })).then((t => { const { statusCode: i, statusCode: o, headers: r, rawBody: a } = t, n = s.decode(a, this.encoding); e(null, { status: i, statusCode: o, headers: r, rawBody: a, body: n }, n) }), (t => { const { message: i, response: o } = t; e(i, o, o && s.decode(o.rawBody, this.encoding)) })); break } } post(t, e = (() => { })) { const s = t.method ? t.method.toLocaleLowerCase() : "post"; switch (t.body && t.headers && !t.headers["Content-Type"] && !t.headers["content-type"] && (t.headers["content-type"] = "application/x-www-form-urlencoded"), t.headers && (delete t.headers["Content-Length"], delete t.headers["content-length"]), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient[s](t, ((t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, i) })); break; case "Quantumult X": t.method = s, this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: i, headers: o, body: r, bodyBytes: a } = t; e(null, { status: s, statusCode: i, headers: o, body: r, bodyBytes: a }, r, a) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let i = require("iconv-lite"); this.initGotEnv(t); const { url: o, ...r } = t; this.got[s](o, r).then((t => { const { statusCode: s, statusCode: o, headers: r, rawBody: a } = t, n = i.decode(a, this.encoding); e(null, { status: s, statusCode: o, headers: r, rawBody: a, body: n }, n) }), (t => { const { message: s, response: o } = t; e(s, o, o && i.decode(o.rawBody, this.encoding)) })); break } } time(t, e = null) { const s = e ? new Date(e) : new Date; let i = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in i) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? i[e] : ("00" + i[e]).substr(("" + i[e]).length))); return t } queryStr(t) { let e = ""; for (const s in t) { let i = t[s]; null != i && "" !== i && ("object" == typeof i && (i = JSON.stringify(i)), e += `${s}=${i}&`) } return e = e.substring(0, e.length - 1), e } msg(e = t, s = "", i = "", o = {}) { const r = t => { const { $open: e, $copy: s, $media: i, $mediaMime: o } = t; switch (typeof t) { case void 0: return t; case "string": switch (this.getEnv()) { case "Surge": case "Stash": default: return { url: t }; case "Loon": case "Shadowrocket": return t; case "Quantumult X": return { "open-url": t }; case "Node.js": return }case "object": switch (this.getEnv()) { case "Surge": case "Stash": case "Shadowrocket": default: { const r = {}; let a = t.openUrl || t.url || t["open-url"] || e; a && Object.assign(r, { action: "open-url", url: a }); let n = t["update-pasteboard"] || t.updatePasteboard || s; if (n && Object.assign(r, { action: "clipboard", text: n }), i) { let t, e, s; if (i.startsWith("http")) t = i; else if (i.startsWith("data:")) { const [t] = i.split(";"), [, o] = i.split(","); e = o, s = t.replace("data:", "") } else { e = i, s = (t => { const e = { JVBERi0: "application/pdf", R0lGODdh: "image/gif", R0lGODlh: "image/gif", iVBORw0KGgo: "image/png", "/9j/": "image/jpg" }; for (var s in e) if (0 === t.indexOf(s)) return e[s]; return null })(i) } Object.assign(r, { "media-url": t, "media-base64": e, "media-base64-mime": o ?? s }) } return Object.assign(r, { "auto-dismiss": t["auto-dismiss"], sound: t.sound }), r } case "Loon": { const s = {}; let o = t.openUrl || t.url || t["open-url"] || e; o && Object.assign(s, { openUrl: o }); let r = t.mediaUrl || t["media-url"]; return i?.startsWith("http") && (r = i), r && Object.assign(s, { mediaUrl: r }), console.log(JSON.stringify(s)), s } case "Quantumult X": { const o = {}; let r = t["open-url"] || t.url || t.openUrl || e; r && Object.assign(o, { "open-url": r }); let a = t["media-url"] || t.mediaUrl; i?.startsWith("http") && (a = i), a && Object.assign(o, { "media-url": a }); let n = t["update-pasteboard"] || t.updatePasteboard || s; return n && Object.assign(o, { "update-pasteboard": n }), console.log(JSON.stringify(o)), o } case "Node.js": return }default: return } }; if (!this.isMute) switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: $notification.post(e, s, i, r(o)); break; case "Quantumult X": $notify(e, s, i, r(o)); break; case "Node.js": break }if (!this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), i && t.push(i), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } debug(...t) { this.logLevels[this.logLevel] <= this.logLevels.debug && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.debug}${t.map((t => t ?? String(t))).join(this.logSeparator)}`)) } info(...t) { this.logLevels[this.logLevel] <= this.logLevels.info && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.info}${t.map((t => t ?? String(t))).join(this.logSeparator)}`)) } warn(...t) { this.logLevels[this.logLevel] <= this.logLevels.warn && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.warn}${t.map((t => t ?? String(t))).join(this.logSeparator)}`)) } error(...t) { this.logLevels[this.logLevel] <= this.logLevels.error && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.error}${t.map((t => t ?? String(t))).join(this.logSeparator)}`)) } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.map((t => t ?? String(t))).join(this.logSeparator)) } logErr(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: this.log("", `❗️${this.name}, 错误!`, e, t); break; case "Node.js": this.log("", `❗️${this.name}, 错误!`, e, void 0 !== t.message ? t.message : t, t.stack); break } } wait(t) { return new Promise((e => setTimeout(e, t))) } done(t = {}) { const e = ((new Date).getTime() - this.startTime) / 1e3; switch (this.log("", `🔔${this.name}, 结束! 🕛 ${e} 秒`), this.log(), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: $done(t); break; case "Node.js": process.exit(0) } } }(t, e) }
