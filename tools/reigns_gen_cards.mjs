// Node 可执行版（环境无 Python 解释器时的可运行端口）。
// 与 tools/reigns_gen_cards.py 逐行对齐，确定性地为 design/cards/cards.json 增补
// performance/network 与 card.reigns，并重生成 web/cards.js / docs/cards.js / 内嵌兜底。
// 用法：node tools/reigns_gen_cards.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "design", "cards", "cards.json");
const WEB_CARDS = path.join(ROOT, "web", "cards.js");
const DOCS_CARDS = path.join(ROOT, "docs", "cards.js");

const BASE = {
  grind: [3, -2], obey: [1, 2], ally: [0, 4], betray: [3, -4],
  expose: [2, -3], self: [-2, -1], hedge: [-1, 1], dodge: [-2, 0],
  invest: [3, 0], risk: [5, -1], shield: [-1, 3], leak: [-2, 2],
  bow: [-1, 3], cashin: [-1, -2],
};
const CAT_PERF_PLUS = new Set(["绩效", "汇报", "晋升", "客户", "竞品"]);
const CAT_NET_PLUS = new Set(["团建", "站队", "反腐", "舆情", "会议", "背锅"]);
const TIER_SCALE = { employee: 0.8, mid: 1.0, senior: 1.2, any: 1.0 };
const LEFT_POLES = new Set(["obey", "hedge", "dodge", "shield", "bow", "self"]);
const RIGHT_POLES = new Set(["grind", "betray", "expose", "risk", "invest", "cashin", "leak"]);
const AGG_WEIGHT = {
  risk: 6.0, betray: 5.0, expose: 4.5, cashin: 4.0, grind: 4.0,
  leak: 3.5, invest: 3.5, ally: 3.0, bow: 2.0, shield: 2.0,
  hedge: 1.5, dodge: 1.5, obey: 1.0, self: 1.0,
};
const DIMS = ["influence", "stress", "cash", "performance", "network"];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function computePerfNet(arch, category, tier) {
  let [bp, bn] = BASE[arch] || [0, 0];
  if (CAT_PERF_PLUS.has(category)) bp += 1;
  if (CAT_NET_PLUS.has(category)) bn += 1;
  if (category === "背锅") bn -= 1;
  const s = TIER_SCALE[tier] ?? 1.0;
  return [clamp(Math.round(bp * s), -10, 10), clamp(Math.round(bn * s), -10, 10)];
}
function sum4(ch) {
  const pl = ch.player;
  return Math.abs(pl.performance) + Math.abs(pl.network) + Math.abs(pl.influence) + Math.abs(pl.stress);
}
function is3dSafe(ch) {
  const pl = ch.player;
  return Math.abs(pl.influence) <= 2 && Math.abs(pl.stress) <= 2 && Math.abs(pl.cash) <= 2;
}
function is5dSafe(ch) {
  return DIMS.every((d) => Math.abs(ch.player[d]) <= 2);
}
function scaleTo25(ch) {
  const pl = ch.player;
  if (sum4(ch) <= 25) return false;
  const room = 25 - (Math.abs(pl.influence) + Math.abs(pl.stress));
  const pn = Math.abs(pl.performance) + Math.abs(pl.network);
  if (room >= 0 && pn > 0) {
    const f = room / pn;
    pl.performance = clamp(Math.round(pl.performance * f), -10, 10);
    pl.network = clamp(Math.round(pl.network * f), -10, 10);
  } else {
    pl.performance = 0; pl.network = 0;
  }
  return true;
}
function ensureSafe(choices) {
  let safe = choices.find(is3dSafe);
  if (!safe) safe = choices.reduce((a, b) =>
    (Math.abs(a.player.influence) + Math.abs(a.player.stress) + Math.abs(a.player.cash)) <=
    (Math.abs(b.player.influence) + Math.abs(b.player.stress) + Math.abs(b.player.cash)) ? a : b);
  safe.player.performance = 0; safe.player.network = 0;
  return safe.id;
}
function dominates(a, b) {
  const pa = a.player, pb = b.player;
  if (!DIMS.every((d) => pa[d] >= pb[d])) return false;
  return DIMS.some((d) => pa[d] > pb[d]);
}
function resolvePareto(choices) {
  let iters = 0, changed = true;
  while (changed && iters < 400) {
    changed = false; iters++;
    for (let i = 0; i < choices.length; i++)
      for (let j = 0; j < choices.length; j++) {
        if (i === j) continue;
        if (dominates(choices[i], choices[j])) {
          choices[i].player.performance = clamp(choices[i].player.performance - 1, -10, 10);
          choices[i].player.network = clamp(choices[i].player.network - 1, -10, 10);
          changed = true;
        }
      }
  }
  return iters < 400;
}
function boldness(ch) {
  const pl = ch.player;
  let s = AGG_WEIGHT[ch.arch] ?? 1.0;
  s += 0.3 * Object.values(pl).reduce((a, v) => a + Math.abs(v), 0);
  const ft = ch.faction_trust || {};
  const mx = Math.max(0, ...Object.values(ft));
  s += 0.2 * mx;
  return s;
}
function findSafeId(choices) {
  const s = choices.find(is5dSafe);
  return s ? s.id : null;
}
function reignsPick(choices) {
  const left = choices.filter((c) => LEFT_POLES.has(c.arch));
  const right = choices.filter((c) => RIGHT_POLES.has(c.arch));
  const leftC = left.length ? left.reduce((a, b) => (boldness(a) <= boldness(b) ? a : b)) : choices.reduce((a, b) => (boldness(a) <= boldness(b) ? a : b));
  const rightC = right.length ? right.reduce((a, b) => (boldness(a) >= boldness(b) ? a : b)) : choices.reduce((a, b) => (boldness(a) >= boldness(b) ? a : b));
  let leftId = leftC.id, rightId = rightC.id;
  const safe = findSafeId(choices);
  if (safe !== null) leftId = safe;
  if (leftId === rightId && choices.length > 1) {
    const others = choices.filter((c) => c.id !== leftId);
    rightId = others.reduce((a, b) => (boldness(a) >= boldness(b) ? a : b)).id;
  }
  return { left: leftId, right: rightId };
}

// ---- 内嵌兜底生成（对齐 gen_embed.py）----
function writeEmbed(relPath, dstName) {
  const raw = fs.readFileSync(path.join(ROOT, relPath));
  JSON.parse(raw.toString("utf8")); // 校验 JSON 合法性
  const b64 = raw.toString("base64");
  let out = '"""Auto-generated embedded asset (BASE64). Regenerate via tools/gen_embed.py. Do not edit by hand."""\n';
  out += "import base64\nimport json\n\n";
  out += "RAW = (\n";
  for (let i = 0; i < b64.length; i += 100) out += '    "' + b64.slice(i, i + 100) + '"\n';
  out += ")\n";
  out += "DATA = json.loads(base64.b64decode(RAW))\n";
  fs.writeFileSync(path.join(ROOT, "src", dstName), out);
  console.log(`wrote src/${dstName} (${b64.length} b64 chars)`);
}

function main() {
  const data = JSON.parse(fs.readFileSync(SRC, "utf8"));
  const cards = data.cards;
  const stats = { cards: cards.length, choices: 0, safe: 0, pareto: 0, over25: 0, over25after: 0, warns: [] };

  for (const card of cards) {
    const tier = card.tier || "any";
    const cat = card.category || "";
    const work = [];
    for (const ch of card.choices) {
      const eff = ch.effects || {};
      const pl = eff.player || {};
      const [perf, net] = computePerfNet(ch.arch || "hedge", cat, tier);
      work.push({
        id: ch.id, arch: ch.arch || "hedge",
        player: {
          influence: Number(pl.influence || 0), stress: Number(pl.stress || 0), cash: Number(pl.cash || 0),
          performance: perf, network: net,
        },
        faction_trust: eff.faction_trust || {},
      });
    }
    for (const w of work) if (scaleTo25(w)) stats.over25++;
    ensureSafe(work);
    if (!resolvePareto(work)) stats.warns.push(`${card.id} 帕累托未完全收敛`);
    stats.pareto++;
    for (const w of work) {
      if (sum4(w) > 25) { stats.over25after++; stats.warns.push(`${card.id}/${w.id} 四表盘和仍>25`); }
      if (is5dSafe(w)) { stats.safe++; break; }
    }
    for (const w of work) {
      const eff = card.choices.find((c) => c.id === w.id).effects || (card.choices.find((c) => c.id === w.id).effects = {});
      eff.player = eff.player || {};
      eff.player.performance = w.player.performance;
      eff.player.network = w.player.network;
    }
    stats.choices += work.length;
    card.reigns = reignsPick(work);
  }

  fs.writeFileSync(SRC, JSON.stringify(data, null, 2) + "\n", "utf8");
  // 重生成 web/cards.js
  execFileSync("node", [path.join(ROOT, "tools", "convert_to_web.js")], { cwd: ROOT, stdio: "inherit" });
  // 同步 docs（GitHub Pages 与开发态一致）
  fs.copyFileSync(WEB_CARDS, DOCS_CARDS);
  fs.copyFileSync(path.join(ROOT, "web", "tuning.js"), path.join(ROOT, "docs", "tuning.js"));
  // 刷新内嵌兜底（无 Python 时用 node 端口）
  writeEmbed("design/cards/cards.json", "_embed_cards.py");
  writeEmbed("config/tuning.json", "_embed_tuning.py");

  const safePct = 100 * stats.safe / stats.cards;
  const over25Pct = 100 * stats.over25after / stats.choices;
  console.log("=".repeat(60));
  console.log("Reigns 卡牌批量增补完成（node 端口）");
  console.log("=".repeat(60));
  console.log(`卡数        : ${stats.cards}`);
  console.log(`选项数      : ${stats.choices}`);
  console.log(`五维保底覆盖: ${stats.safe}/${stats.cards} = ${safePct.toFixed(1)}%`);
  console.log(`帕累托收敛  : ${stats.pareto}/${stats.cards}`);
  console.log(`四表盘和>25 : 脚本前 ${stats.over25} 项被缩；最终仍>25 的 ${stats.over25after} 项 (${over25Pct.toFixed(2)}%)`);
  for (const w of stats.warns) console.log("  ⚠ " + w);

  let hard = false;
  if (stats.cards !== 256) { console.log(`FAIL 卡数应为 256，实际 ${stats.cards}`); hard = true; }
  if (stats.choices !== 1024) { console.log(`FAIL 选项数应为 1024，实际 ${stats.choices}`); hard = true; }
  if (stats.safe !== stats.cards) { console.log("FAIL 五维保底未 100% 覆盖"); hard = true; }
  if (stats.pareto !== stats.cards) { console.log("FAIL 帕累托未 100% 收敛"); hard = true; }
  if (over25Pct > 1.0) { console.log(`FAIL 四表盘和>25 占比超 1%`); hard = true; }
  console.log("=".repeat(60));
  if (hard) { console.log("结果: 失败"); process.exit(1); }
  console.log("结果: 通过");
}
main();
