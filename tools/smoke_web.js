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
  click() { for (const fn of this.handlers.click || []) fn({ preventDefault() {} }); }
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
  // 只支持 ".cls" 形式（game.js 仅用 .opt-btn）
  querySelectorAll(sel) {
    const cls = String(sel).replace(/^\./, "");
    const out = [];
    (function walk(n) {
      for (const c of n.children) {
        if (c.className && c.className.split(/\s+/).includes(cls)) out.push(c);
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
const tick = () => new Promise((r) => setImmediate(r));

/* ---------- 自动玩家：从 stage 里找按钮并点击 ---------- */
function clickables(stage) {
  const opts = stage.querySelectorAll(".opt-btn");
  if (opts.length) return { kind: "opt", list: opts };
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
  const MAX = 20000;
  let rnd = 987654321;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  while (guard++ < MAX) {
    if (endScreen.hidden === false) break;              // 结局屏出现 = 跑通
    const st = peek().STATE;
    if (st) {
      report.days.add(st.day);
      report.phases[st.phase] = (report.phases[st.phase] || 0) + 1;
    }
    const { kind, list } = clickables(stage);
    if (kind === "none") { await tick(); continue; }
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
  console.log(`结局: day=${res.day} outcome=${res.outcome} rating=${res.rating} title=${res.title}`);
  console.log(`派系=${res.factionAlias} 目标档=${res.factionTier} 副目标=${res.subOk} 权力分=${res.powerScore}`);
  console.log(`夺客户=${res.clientsTaken} 失客户=${res.clientsLost} 冲突度=${res.chaos}`);
  console.log("出局记录:", st.actors.filter((a) => !a.alive).map((a) => `${a.name}@D${a.outDay}:${a.outCause}`).join(" | ") || "无");
  console.log("在场:", st.aliveActors().length + "/" + st.numActors, "| 结局屏 hidden=" + endScreen.hidden);
  const usedCats = new Set();
  console.log("已用卡数:", st.usedCards.size);
  console.log("=====================================");
  if (res.day !== 12 && !st.endedEarly) { console.log("!! 未跑满 12 天"); process.exitCode = 1; }
})().catch((e) => { console.error("CRASH:", e && e.stack || e); process.exitCode = 1; });
