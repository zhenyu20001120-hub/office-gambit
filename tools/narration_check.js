// 局势旁白单测：按 design/gdd/narration-spec.md §C 校验 narrationFor 的形态 / 长度 / 全局派系口径。
// 加载方式与 headless_check.js 一致（模拟浏览器 <script src> 共享全局），额外导出 narrationFor。
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", process.argv[2] === "docs" ? "docs" : "web");
let code = fs.readFileSync(path.join(ROOT, "tuning.js"), "utf8") + "\n"
  + fs.readFileSync(path.join(ROOT, "cards.js"), "utf8") + "\n"
  + fs.readFileSync(path.join(ROOT, "game.js"), "utf8") + "\n";
const idx = code.indexOf("if (typeof module");
if (idx >= 0) code = code.slice(0, idx);
code += "\nglobalThis.__api = { narrationFor, monthLabel, factionAlias, FACTIONS, runGame, RandomController, NARR_MAX_LEN };\n";
new Function(code)();
const { narrationFor, monthLabel, runGame, RandomController, NARR_MAX_LEN } = globalThis.__api;

// 长度口径：下界 = §C.5 纯兜底句长度；上界与 game.js 的 NARR_MAX_LEN 对齐（主理人拍板 42→48）。
const MIN = 25, MAX = 48;
const SIDE = { FV_A: "抢单派", FV_B: "维稳派", FV_C: "上位派", FV_D: "降压派" };
let checks = 0, fails = [];

function assert(cond, msg) { checks++; if (!cond) fails.push(msg); }

// 防漂移：单测上界必须等于 game.js 里的 NARR_MAX_LEN，避免日后改了常量而断言没跟上。
assert(MAX === NARR_MAX_LEN, `单测上界 MAX=${MAX} 与 game.js 的 NARR_MAX_LEN=${NARR_MAX_LEN} 不一致`);

// 构造 state：alarmMask 位 0..3 = perf/net/inf/energy 告急；deltas 为本次增量；lead 为全局领先派系
function mkCase({ deltas = {}, lead = null, leadVal = 5, alarmMask = 0, month = 12 }) {
  const p = {
    performance: (alarmMask & 1) ? 12 : 55,
    network: (alarmMask & 2) ? 12 : 55,
    influence: (alarmMask & 4) ? 12 : 55,
    stress: (alarmMask & 8) ? 90 : 30,
  };
  const prev = {
    performance: p.performance - (deltas.performance || 0),
    network: p.network - (deltas.network || 0),
    influence: p.influence - (deltas.influence || 0),
    // dEnergy = (100-stress) - (100-prev.stress) = prev.stress - stress
    stress: p.stress + (deltas.energy || 0),
  };
  const factionTrust = { FV_A: 0, FV_B: 0, FV_C: 0, FV_D: 0 };
  if (lead) factionTrust[lead] = leadVal;
  const state = { month, factionTrust, player: () => p };
  return { state, prev };
}

// 反向诱饵：choice 本地 faction_trust 指向与全局领先派系【不同】的派系，
// 用于证明旁白的派系词来自全局 state.factionTrust，而非 choice.faction_trust。
function decoyChoice(globalLead) {
  const other = ["FV_A", "FV_B", "FV_C", "FV_D"].find((f) => f !== globalLead) || "FV_B";
  const ft = { FV_A: -9, FV_B: -9, FV_C: -9, FV_D: -9 };
  ft[other] = 99;
  return { arch: "grind", faction_trust: ft, player: {} };
}

function checkShape(out, tag) {
  assert(typeof out === "string" && out.length > 0, `${tag} 输出为空`);
  assert(!/[;；]/.test(out), `${tag} 含分号：${out}`);
  assert(out.endsWith("。"), `${tag} 未以句号结尾：${out}`);
  assert((out.match(/。/g) || []).length === 1, `${tag} 句号不止一个（非一句话）：${out}`);
  assert(!/[!！?？\n]/.test(out), `${tag} 含叹号/问号/换行：${out}`);
  assert(!/，，|，。/.test(out), `${tag} 空段落导致标点相连：${out}`);
  assert(out.length >= MIN && out.length <= MAX, `${tag} 长度 ${out.length} 越界[${MIN},${MAX}]：${out}`);
}

/* ---------- 1) 穷举：17 主变化形态 × 5 派系局势 × 16 告急组合 × 60 月 ---------- */
const mains = [{ tag: "无显著变化", deltas: {} }];
for (const dim of ["performance", "network", "influence", "energy"]) {
  for (const mag of [9, 6, -6, -9]) mains.push({ tag: `${dim}${mag}`, deltas: { [dim]: mag } });
}
const leads = [null, "FV_A", "FV_B", "FV_C", "FV_D"];
let total = 0, lenMin = 999, lenMax = 0, fallbackHits = 0, sample = {};
for (const mn of mains) {
  for (const lead of leads) {
    for (let mask = 0; mask < 16; mask++) {
      for (let month = 1; month <= 60; month++) {
        const { state, prev } = mkCase({ deltas: mn.deltas, lead, alarmMask: mask, month });
        const out = narrationFor(decoyChoice(lead), prev, state);
        total++;
        lenMin = Math.min(lenMin, out.length); lenMax = Math.max(lenMax, out.length);
        checkShape(out, `[${mn.tag}|${lead || "拉锯"}|mask${mask}|m${month}]`);
        // 全局派系口径：明确领先（leadVal=5，spread=5>=3）时必须出现该派系名，且不得出现诱饵派系名
        if (lead) {
          const decoy = SIDE[["FV_A", "FV_B", "FV_C", "FV_D"].find((f) => f !== lead)];
          assert(out.includes(SIDE[lead]), `派系词错误（应含${SIDE[lead]}）：${out}`);
          assert(!out.includes(decoy), `混入 choice 本地派系词 ${decoy}：${out}`);
        }
        if (out.endsWith("站稳脚跟。") || out.endsWith("谁在落子。") || out.endsWith("谁占上风。")) fallbackHits++;
        const key = `${mn.tag}|${lead || "拉锯"}|mask${mask}`;
        if (!sample[key]) sample[key] = out;
      }
    }
  }
}

/* ---------- 2) 定向场景（主理人指定必覆盖的三例） ---------- */
const scenarios = [];
// A. 业绩强涨(+9) + 抢单派(FV_A)领先 + 无告急 + 过半(month 33)
scenarios.push(["业绩强涨+抢单派领先+无告急+过半",
  mkCase({ deltas: { performance: 9 }, lead: "FV_A", alarmMask: 0, month: 33 }), "FV_A"]);
// B. 精力透支(-9) + 势均力敌 + 业绩告急 + 初期(month 1)
scenarios.push(["精力强透支+势均力敌+业绩告急+初期",
  mkCase({ deltas: { energy: -9 }, lead: null, alarmMask: 1, month: 1 }), null]);
// C. 纯兜底：无显著变化 + 无领先 + 无告急
for (const mm of [3, 4, 5]) {
  scenarios.push([`纯兜底 month=${mm}(month%3=${mm % 3})`,
    mkCase({ deltas: {}, lead: null, alarmMask: 0, month: mm }), null]);
}
// 补充：声望中涨 + 上位派 + 末段 / 人脉强跌 + 降压派 + 精力告急 / 中档阈值边界 / 四灯全亮
scenarios.push(["声望中涨+上位派领先+无告急+末段",
  mkCase({ deltas: { influence: 6 }, lead: "FV_C", alarmMask: 0, month: 60 }), "FV_C"]);
scenarios.push(["人脉强跌+降压派领先+精力告急+发展期",
  mkCase({ deltas: { network: -9 }, lead: "FV_D", alarmMask: 8, month: 15 }), "FV_D"]);
scenarios.push(["阈值下界 |d|=5（中档）+维稳派领先",
  mkCase({ deltas: { performance: 5 }, lead: "FV_B", alarmMask: 0, month: 25 }), "FV_B"]);
scenarios.push(["|d|=4（不显著）+无领先+有告急→中性句",
  mkCase({ deltas: { performance: 4 }, lead: null, alarmMask: 2, month: 8 }), null]);
scenarios.push(["四灯全亮+抢单派领先+业绩强跌",
  mkCase({ deltas: { performance: -12 }, lead: "FV_A", alarmMask: 15, month: 48 }), "FV_A"]);
scenarios.push(["同幅同大→定序取 performance",
  mkCase({ deltas: { performance: 9, network: 9 }, lead: null, alarmMask: 0, month: 30 }), null]);
scenarios.push(["领先但 spread<3（FV_A=2）→势均力敌",
  mkCase({ deltas: { performance: 9 }, lead: "FV_A", leadVal: 2, alarmMask: 0, month: 30 }), null]);

console.log("=== 定向场景输出 ===");
for (const [tag, c, lead] of scenarios) {
  const out = narrationFor(decoyChoice(lead), c.prev, c.state);
  checkShape(out, `场景「${tag}」`);
  if (lead) assert(out.includes(SIDE[lead]), `场景「${tag}」缺派系词 ${SIDE[lead]}`);
  console.log(`  [${String(out.length).padStart(2)}字] ${tag}\n        ${out}`);
}

/* ---------- 2b) 抽查：NARR_MAX_LEN=48 后，四段全满时月进度句应为【完整形态】而非裸 label ---------- */
console.log("\n=== 抽查：四段全满的月进度完整形态（NARR_MAX_LEN=" + NARR_MAX_LEN + "）===");
{
  // 四区间各取一例：业绩强涨 + 明确领先派系 + 无告急，验证四种完整形态尾句均常驻
  const full = [
    [3, "你才刚进场"], [15, "棋局渐明"], [33, "进度过半"], [55, "收尾在即"],
  ];
  for (const [mm, tailWord] of full) {
    const c = mkCase({ deltas: { performance: 9 }, lead: "FV_A", alarmMask: 0, month: mm });
    const out = narrationFor(decoyChoice("FV_A"), c.prev, c.state);
    checkShape(out, `抽查 month=${mm}`);
    assert(out.includes(tailWord), `month=${mm} 月进度未取完整形态（缺「${tailWord}」）：${out}`);
    assert(out.includes(monthLabel(mm).label), `month=${mm} 缺 monthLabel：${out}`);
    // 完整形态 = label 后仍带修饰词，故不应以「label。」直接收尾（裸 label 形态的特征）
    assert(!out.endsWith(monthLabel(mm).label + "。"), `month=${mm} 仍是裸 label 形态：${out}`);
    console.log(`  [${out.length}字] month=${mm}｜${out}`);
  }
}

/* ---------- 3) 确定性：同 state 连续调用输出一致 ---------- */
{
  const c = mkCase({ deltas: { performance: 9 }, lead: "FV_A", alarmMask: 0, month: 33 });
  const a = narrationFor(decoyChoice("FV_A"), c.prev, c.state);
  const b = narrationFor(decoyChoice("FV_A"), c.prev, c.state);
  assert(a === b, "同 state 两次调用输出不一致（存在随机）");
}
/* ---------- 4) 兜底三句按 month%3 确定性轮换 ---------- */
{
  const outs = [3, 4, 5].map((mm) => {
    const c = mkCase({ deltas: {}, lead: null, alarmMask: 0, month: mm });
    return narrationFor(decoyChoice(null), c.prev, c.state);
  });
  assert(new Set(outs).size === 3, `兜底三句未按 month%3 轮换：${JSON.stringify(outs)}`);
}
/* ---------- 5) 月进度分段（label 必须来自 monthLabel） ---------- */
for (const mm of [1, 6, 7, 24, 25, 48, 49, 60]) {
  const c = mkCase({ deltas: { performance: 6 }, lead: "FV_A", alarmMask: 0, month: mm });
  const out = narrationFor(decoyChoice("FV_A"), c.prev, c.state);
  assert(out.includes(monthLabel(mm).label), `month=${mm} 未含 monthLabel 标签 ${monthLabel(mm).label}：${out}`);
}
/* ---------- 6) 健壮性：缺字段 / 越界月 不抛异常 ---------- */
try {
  const p = { performance: 50, network: 50, influence: 50, stress: 30 };
  narrationFor({}, {}, { month: 0, factionTrust: null, player: () => p });
  narrationFor({}, undefined, { month: 999, player: () => p });
  narrationFor({}, {}, { month: 12, factionTrust: {}, player: () => null });
  checks++;
} catch (e) { fails.push("健壮性用例抛异常：" + e.message); }

console.log("\n=== 穷举统计 ===");
console.log(`  组合数=${total}  断言数=${checks}  长度区间=[${lenMin},${lenMax}]  纯兜底命中=${fallbackHits}`);
console.log(`  形态样例（四段全满）：${sample["performance9|FV_A|mask0"]}`);
console.log(`  形态样例（中性句）  ：${sample["无显著变化|FV_A|mask0"]}`);
console.log(`  形态样例（多灯）    ：${sample["performance-9|拉锯|mask15"]}`);

/* ---------- 7) 真实对局回归：走真实调用点（controller.showNarration），用真实 state 校验 ---------- */
(async () => {
  const NUM_GAMES = 40;
  const live = { n: 0, lens: [], lead: 0, tie: 0, fb: 0, alarm: 0, byLead: {}, longest: "", shortest: "x".repeat(99) };
  for (let g = 0; g < NUM_GAMES; g++) {
    const ctrl = new RandomController();
    ctrl.showNarration = async (state, narr) => {
      live.n++;
      checkShape(narr, `实战局${g}月${state.month}`);
      live.lens.push(narr.length);
      if (narr.length > live.longest.length) live.longest = narr;
      if (narr.length < live.shortest.length) live.shortest = narr;
      if (/势头最盛|占上风(?!，)/.test(narr) && !narr.endsWith("谁占上风。")) {
        live.lead++;
        for (const [f, s] of Object.entries(SIDE)) if (narr.includes(s)) live.byLead[f] = (live.byLead[f] || 0) + 1;
        // 交叉校验：旁白点名的派系必须等于该时刻全局 factionTrust 的 argmax
        const ft = state.factionTrust;
        let arg = null, mx = -Infinity;
        for (const f of ["FV_A", "FV_B", "FV_C", "FV_D"]) if (ft[f] > mx) { mx = ft[f]; arg = f; }
        assert(narr.includes(SIDE[arg]), `实战：旁白派系 ≠ 全局 argmax(${arg}=${mx.toFixed(2)})：${narr}`);
      } else if (narr.includes("拉锯")) live.tie++;
      if (/已亮红灯|红灯一片/.test(narr)) live.alarm++;
      if (narr.endsWith("站稳脚跟。") || narr.endsWith("谁在落子。") || narr.endsWith("谁占上风。")) live.fb++;
    };
    try {
      await runGame("medium", 9, "mid", ctrl, 40000 + g);
    } catch (e) { fails.push(`实战局${g}抛异常：${e.message}`); }
  }
  const avg = live.lens.reduce((a, b) => a + b, 0) / (live.lens.length || 1);
  console.log("\n=== 真实对局回归（40 局，走 controller.showNarration 真实调用点）===");
  console.log(`  旁白条数=${live.n}  平均长度=${avg.toFixed(1)}字  区间=[${Math.min(...live.lens)},${Math.max(...live.lens)}]`);
  console.log(`  明确领先=${live.lead}（${(100 * live.lead / live.n).toFixed(1)}%）  势均力敌=${live.tie}  含告急=${live.alarm}  纯兜底=${live.fb}`);
  console.log(`  领先派系分布=${JSON.stringify(live.byLead)}`);
  console.log(`  最长：${live.longest}`);
  console.log(`  最短：${live.shortest}`);

  if (fails.length) {
    console.log(`\n!!! FAIL ${fails.length} 项（前 10 条）：`);
    for (const f of fails.slice(0, 10)) console.log("  - " + f);
    process.exit(1);
  }
  console.log(`\nALL PASS：${checks} 项断言全部通过（源目录 ${path.basename(ROOT)}）。`);
})();
