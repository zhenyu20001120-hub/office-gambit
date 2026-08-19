/* =====================================================================
 * smoke_web.js —— 真实可玩性冒烟测试
 * 用 Proxy + 轻量假 DOM 伪造 document/window，让 web/game.js 在 Node 中
 * 走「浏览器 GUI 路径」（initApp -> onStart -> GUIController），
 * 然后由自动玩家点击按钮，驱动完整 12 天对局直到结局屏出现。
 *
 * 用法: node tools/smoke_web.js [seed] [difficulty] [tier]
 * ===================================================================== */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..", "web");
const SEED = process.argv[2] !== undefined ? Number(process.argv[2]) : 20260817;
const DIFF = process.argv[3] || "medium";
const TIER = process.argv[4] || "mid";

/* ---------- 万能 Proxy 兜底桩：任何未实现的属性访问/调用都不炸 ---------- */
function anyStub(name) {
  const f = function () { return f; };
  return new Proxy(f, {
    get: (t, k) => {
      if (k === Symbol.toPrimitive || k === "toString") return () => `[stub ${name}]`;
      if (k === "then") return undefined;            // 不能被误当作 Promise
      if (k === Symbol.iterator) return undefined;
      if (k === "length") return 0;
      return anyStub(name + "." + String(k));
    },
    set: () => true,
    apply: () => anyStub(name + "()"),
    has: () => true,
  });
}

/* ---------- 轻量假 DOM：需要真实结构以便模拟点击 ---------- */
let NODE_SEQ = 0;
// 解析 ".a.b:not(.c):not(.d)" 形式的复合类选择器 -> { must:[], not:[] }
function parseSel(sel) {
  const s = String(sel);
  const must = [], not = [];
  const re = /\.([A-Za-z0-9_-]+)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (s.slice(Math.max(0, m.index - 5), m.index) === ":not(") not.push(m[1]);
    else must.push(m[1]);
  }
  return { must, not };
}
function matchesSel(el, parsed) {
  if (!el.className) return false;
  const cs = el.className.split(/\s+/);
  for (const c of parsed.must) if (!cs.includes(c)) return false;
  for (const c of parsed.not) if (cs.includes(c)) return false;
  return true;
}
class FakeEl {
  constructor(tag) {
    this.tagName = String(tag || "div").toUpperCase();
    this._id = ++NODE_SEQ;
    this.className = "";
    this.children = [];
    this.parentNode = null;
    this.handlers = {};
    this.attributes = {};
    this._text = "";
    this.hidden = false;
    this.value = "";
    this.style = new Proxy({}, { get: (t, k) => (k in t ? t[k] : ""), set: (t, k, v) => { t[k] = v; return true; } });
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text || this.children.map((c) => c.textContent).join(""); }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get innerHTML() { return this._html || ""; }
  appendChild(c) {
    if (c && typeof c === "object") { c.parentNode = this; this.children.push(c); }
    if (this._onAppend) this._onAppend(c);
    return c;
  }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); }
  removeEventListener(ev, fn) { this.handlers[ev] = (this.handlers[ev] || []).filter((f) => f !== fn); }
  setAttribute(k, v) { this.attributes[k] = v; if (k === "class") this.className = v; }
  getAttribute(k) { return this.attributes[k]; }
  click() {
    for (const fn of this.handlers.click || []) fn({ preventDefault() {} });
  }
  contains() { return false; }
  focus() {}
  get classList() {
    const self = this;
    return {
      add(c) { if (!self.className.split(/\s+/).includes(c)) self.className = (self.className + " " + c).trim(); },
      remove(c) { self.className = self.className.split(/\s+/).filter((x) => x !== c).join(" "); },
      contains(c) { return self.className.split(/\s+/).includes(c); },
    };
  }
  // 支持复合类选择器，如 ".a.b:not(.c):not(.d)"（解析为 must / not 两组类名）
  querySelectorAll(sel) {
    const parsed = parseSel(sel);
    const out = [];
    (function walk(n) {
      for (const c of n.children) {
        if (matchesSel(c, parsed)) out.push(c);
        walk(c);
      }
    })(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

const byId = new Map();
function getEl(id) {
  if (!byId.has(id)) { const e = new FakeEl("div"); e.attributes.id = id; byId.set(id, e); }
  return byId.get(id);
}
// 起始屏单选项 & 种子输入
getEl("seed-input").value = String(SEED);

const documentStub = {
  readyState: "complete",
  body: new FakeEl("body"),
  documentElement: new FakeEl("html"),
  createElement: (t) => new FakeEl(t),
  createTextNode: (t) => { const e = new FakeEl("#text"); e._text = String(t); return e; },
  createElementNS: (ns, t) => new FakeEl(t),
  getElementById: (id) => getEl(id),
  addEventListener: () => {},
  removeEventListener: () => {},
  querySelector: (sel) => {
    if (/difficulty/.test(sel)) return { value: DIFF };
    if (/tier/.test(sel)) return { value: TIER };
    return null;
  },
  querySelectorAll: () => [],
};

const ALERTS = [];
process.on("unhandledRejection", (e) => { console.error("[unhandledRejection]", e && e.stack || e); });
const ctx = {
  console,
  document: documentStub,
  setTimeout, clearTimeout, setInterval, clearInterval, setImmediate,
  Promise, Math, JSON, Date, Number, String, Object, Array, Set, Map, BigInt, Error, isNaN, parseInt, parseFloat,
  alert: (m) => ALERTS.push(String(m)),
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  localStorage: anyStub("localStorage"),
  navigator: anyStub("navigator"),
};
ctx.window = ctx;
ctx.globalThis = ctx;
const _origAlert = ctx.alert;
ctx.alert = (m) => { console.error("[alert]", m); _origAlert(m); };
vm.createContext(ctx);

/* ---------- 载入三个脚本（模拟 <script src> 共享全局） ---------- */
const code = fs.readFileSync(path.join(ROOT, "tuning.js"), "utf8") + "\n"
  + fs.readFileSync(path.join(ROOT, "cards.js"), "utf8") + "\n"
  + fs.readFileSync(path.join(ROOT, "game.js"), "utf8") + "\n"
  + `\n;globalThis.__peek = () => ({ STATE, DOM, TUNING, CARDS });
     globalThis.__onStart = onStart;
     globalThis.__runHeadless = runHeadless;
     globalThis.__runGame = runGame;
     globalThis.__RandomController = RandomController;\n`;
vm.runInContext(code, ctx, { filename: "web-bundle.js" });

const peek = ctx.__peek;
// 点击有可点元素时用 setImmediate 快速推进；
// 无可点元素（如 choose 后 200ms 换牌过渡期）用真实定时器让出事件循环，
// 否则会比 200ms 过渡更快耗尽守卫而误判卡死。
const tick = () => new Promise((r) => setImmediate(r));
const waitReal = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 自动玩家：从 stage 里找按钮并点击 ---------- */
// 注意：危机弹层（showCrisisModal）挂在独立的 DOM.crisisModal 上、不在 stage 内，
// 且它是「阻塞式覆盖层」——出现时必须优先点掉，否则背后舞台仍残留旧面板
// （如未清的夜间行动·目标面板），冒烟会反复点旧面板（已 resolve 的 no-op）而永远够不到弹层按钮，卡死。
// 故危机弹层优先级最高，其次才是 stage 内的 opt / quad / continue。
function clickables(stage) {
  const modal = getEl("crisis-modal");
  if (modal && modal.hidden === false) {
    const contM = modal.querySelectorAll(".continue-btn");
    if (contM.length) return { kind: "cont", list: contM };
    const optM = modal.querySelectorAll(".opt-btn");
    if (optM.length) return { kind: "opt", list: optM };
  }
  const opts = stage.querySelectorAll(".opt-btn");
  if (opts.length) return { kind: "opt", list: opts };
  // 四象限网格：点击任意未置灰、未选中、未淡出的格。
  // choose(q) 选中后会把其余格加 .dimmed、选中格加 .chosen（但不再加 .disabled），
  // 200ms 后才换下一张；冒烟循环用 setImmediate 远快于 200ms，
  // 若只排除 .disabled 会重复点旧格致游戏卡死。故一并排除 .dimmed / .chosen。
  const quad = stage.querySelectorAll(".quad-cell:not(.disabled):not(.dimmed):not(.chosen)");
  if (quad.length) return { kind: "quad", list: quad };
  const cont = stage.querySelectorAll(".continue-btn");
  if (cont.length) return { kind: "cont", list: cont };
  return { kind: "none", list: [] };
}

(async () => {
  const report = { days: new Set(), phases: {}, assemblies: 0, clicks: 0, eliminations: [], errors: [] };
  const startBtn = getEl("start-btn");
  if (!(startBtn.handlers.click || []).length) throw new Error("start-btn 未绑定 click（initApp 没跑）");

  startBtn.click();                 // 等价于玩家点「开始」
  await tick();

  const stage = getEl("stage");
  const endScreen = getEl("end-screen");
  let guard = 0;
  const MAX = Number(process.argv[5]) || 20000;
  let rnd = 987654321;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  while (guard++ < MAX) {
    if (endScreen.hidden === false) break;              // 结局屏出现 = 跑通
    const st = peek().STATE;
    if (st) {
      report.days.add(st.month);
      report.phases[st.phase] = (report.phases[st.phase] || 0) + 1;
    }
    const { kind, list } = clickables(stage);
    if (kind === "none") { await waitReal(5); continue; }   // 过渡期让出真实时间，等待下一张卡
    const btn = kind === "opt" ? list[Math.floor(rand() * list.length)] : list[0];
    btn.click();
    report.clicks++;
    await tick();
  }

  const st = peek().STATE;
  const res = st && st.result;
  console.log("========== GUI 路径冒烟测试 ==========");
  console.log(`seed=${SEED} difficulty=${DIFF} tier=${TIER}`);
  console.log("点击次数:", report.clicks, "| 循环守卫:", guard, "/", MAX);
  console.log("到达过的天数:", [...report.days].sort((a, b) => a - b).join(","));
  console.log("各阶段出现次数:", JSON.stringify(report.phases));
  if (ALERTS.length) console.log("!! alert(运行时错误):", ALERTS);
  if (!res) { console.log("!! 未产出 result —— 未走到结局"); process.exitCode = 1; return; }
  console.log(`结局: month=${res.month} outcome=${res.outcome} rating=${res.rating} title=${res.title}`);
  console.log(`派系=${res.factionAlias} 目标档=${res.factionTier} 副目标=${res.subOk} 权力分=${res.powerScore}`);
  console.log(`夺客户=${res.clientsTaken} 失客户=${res.clientsLost} 冲突度=${res.chaos}`);
  console.log("出局记录:", st.actors.filter((a) => !a.alive).map((a) => `${a.name}@D${a.outMonth}:${a.outCause}`).join(" | ") || "无");
  console.log("在场:", st.aliveActors().length + "/" + st.numActors, "| 结局屏 hidden=" + endScreen.hidden);
  console.log("已用卡数:", st.usedCards.size);
  console.log("=====================================");
  if (res.month !== 12 && !st.endedEarly) { console.log("!! 未跑满 12 天"); process.exitCode = 1; }
})().catch((e) => { console.error("CRASH:", e && e.stack || e); process.exitCode = 1; });
