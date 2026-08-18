/* 连续两局回归：结局屏 -> 点「重新开始」-> 再点「进入第 1 天」，确认第二局同样能跑到结局。 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..", "web");
let NODE_SEQ = 0;
class FakeEl {
  constructor(tag) {
    this.tagName = String(tag || "div").toUpperCase(); this._id = ++NODE_SEQ;
    this.className = ""; this.children = []; this.handlers = {}; this.attributes = {};
    this._text = ""; this.hidden = false; this.value = "";
    this.style = new Proxy({}, { get: (t, k) => (k in t ? t[k] : ""), set: (t, k, v) => { t[k] = v; return true; } });
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text || this.children.map((c) => c.textContent).join(""); }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get innerHTML() { return this._html || ""; }
  appendChild(c) { if (c && typeof c === "object") this.children.push(c); return c; }
  addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); }
  removeEventListener() {}
  setAttribute(k, v) { this.attributes[k] = v; if (k === "class") this.className = v; }
  getAttribute(k) { return this.attributes[k]; }
  click() { for (const fn of this.handlers.click || []) fn({ preventDefault() {} }); }
  querySelectorAll(sel) {
    const cls = String(sel).replace(/^\./, ""); const out = [];
    (function walk(n) { for (const c of n.children) { if (c.className && c.className.split(/\s+/).includes(cls)) out.push(c); walk(c); } })(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
const byId = new Map();
const getEl = (id) => { if (!byId.has(id)) byId.set(id, new FakeEl("div")); return byId.get(id); };
const ALERTS = [];
const ctx = {
  console, setTimeout, clearTimeout, setImmediate, Promise, Math, JSON, Date, Number, String,
  Object, Array, Set, Map, BigInt, Error, isNaN, parseInt, parseFloat,
  alert: (m) => ALERTS.push(String(m)),
  document: {
    readyState: "complete", body: new FakeEl("body"),
    createElement: (t) => new FakeEl(t),
    createTextNode: (t) => { const e = new FakeEl("#text"); e._text = String(t); return e; },
    getElementById: getEl, addEventListener: () => {},
    querySelector: (s) => (/difficulty/.test(s) ? { value: "medium" } : /tier/.test(s) ? { value: "mid" } : null),
    querySelectorAll: () => [],
  },
};
ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
const code = fs.readFileSync(path.join(ROOT, "tuning.js"), "utf8") + "\n"
  + fs.readFileSync(path.join(ROOT, "cards.js"), "utf8") + "\n"
  + fs.readFileSync(path.join(ROOT, "game.js"), "utf8") + "\n"
  + "\n;globalThis.__peek=()=>({STATE,DOM});\n";
vm.runInContext(code, ctx, { filename: "bundle.js" });

const tick = () => new Promise((r) => setImmediate(r));
const stage = getEl("stage"), endS = getEl("end-screen"), startS = getEl("start-screen");
let rnd = 13579;
const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

async function playOne(label) {
  getEl("seed-input").value = String(Math.floor(rand() * 1e6));
  getEl("start-btn").click();
  await tick();
  let g = 0;
  while (g++ < 20000) {
    if (endS.hidden === false) break;
    let list = stage.querySelectorAll(".opt-btn");
    if (!list.length) list = stage.querySelectorAll(".continue-btn");
    if (!list.length) { await tick(); continue; }
    list[Math.floor(rand() * list.length)].click();
    await tick();
  }
  const res = ctx.__peek().STATE && ctx.__peek().STATE.result;
  console.log(`${label}: day=${res && res.day} outcome=${res && res.outcome} rating=${res && res.rating} 结局屏=${endS.hidden === false}`);
  return !!res && endS.hidden === false;
}

(async () => {
  const ok1 = await playOne("第 1 局");
  // 点「重新开始」
  const restart = endS.querySelectorAll(".continue-btn");
  if (!restart.length) { console.log("FAIL 结局屏没有「重新开始」按钮"); process.exitCode = 1; return; }
  restart[0].click();
  console.log(`点重新开始后：start-screen hidden=${startS.hidden} end-screen hidden=${endS.hidden}`);
  const ok2 = await playOne("第 2 局");
  if (ALERTS.length) console.log("!! alert:", ALERTS);
  console.log(ok1 && ok2 && !ALERTS.length ? "\nPASS 连续两局均跑到结局" : "\nFAIL 连续两局回归");
  if (!(ok1 && ok2) || ALERTS.length) process.exitCode = 1;
})().catch((e) => { console.error("CRASH:", e && e.stack || e); process.exitCode = 1; });
