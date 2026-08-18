/* 针对本轮修复的单元级校验：买票生效 / 抽牌类目多样性 / 夜间信念归属 / 信任与信念取值域 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "web");
let code = fs.readFileSync(path.join(ROOT, "tuning.js"), "utf8") + "\n"
  + fs.readFileSync(path.join(ROOT, "cards.js"), "utf8") + "\n"
  + fs.readFileSync(path.join(ROOT, "game.js"), "utf8") + "\n";
code = code.slice(0, code.indexOf("if (typeof module"));
code += "\nglobalThis.__api={setupWorld,aiVoteScore,drawDayCards,aiNight,CATEGORY_ORDER};\n";
new Function(code)();
const { setupWorld, aiVoteScore, drawDayCards, aiNight, CATEGORY_ORDER } = globalThis.__api;

let pass = 0, fail = 0;
const t = (name, ok, extra) => {
  (ok ? pass++ : fail++);
  console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : ""));
};

/* 1. 买票是否真的降低 AI 投玩家的分数（修复前 `in` 判定恒为 false，机制完全失效） */
{
  const st = setupWorld("medium", 9, "mid", 424242);
  const p = st.player(), ai = st.actors[1];
  st.assembly = { accused: null, deflect: false, bribes: 2, playerBribed: [], defend: false };
  const realU = st.rng.uniform.bind(st.rng);
  st.rng.uniform = () => 0;                       // 固定噪声便于对比
  const sNo = aiVoteScore(ai, p, st);
  st.assembly.playerBribed = [ai.idx];
  const sYes = aiVoteScore(ai, p, st);
  st.rng.uniform = realU;
  const delta = sYes - sNo;
  t("买票降低 AI 投票倾向", Math.abs(delta + 2) < 1e-9,
    "delta=" + delta.toFixed(3) + "（期望 -2.000）");
}

/* 2. 抽牌：12 类都可达（修复前只有当日 DAY_CURVE 里的 3~4 类可达） */
{
  const seen = new Set();
  for (let s = 0; s < 60; s++) {
    const st = setupWorld("medium", 9, "mid", 9000 + s);
    for (let d = 1; d <= 12; d++) for (const c of drawDayCards(st, d, d > 2 ? 3 : 2)) seen.add(c.category);
  }
  t("12 个类目均可抽到", seen.size === CATEGORY_ORDER.length, "覆盖 " + seen.size + "/12");
}

/* 3. 抽牌：同一天的牌必须来自不同类目，且张数符合 2/2/3 递增 */
{
  let dup = 0, cnt = 0, wrongN = 0;
  for (let s = 0; s < 200; s++) {
    const st = setupWorld("medium", 9, "mid", 7000 + s);
    for (let d = 1; d <= 12; d++) {
      const want = d > 2 ? 3 : 2;
      const drawn = drawDayCards(st, d, want);
      if (drawn.length !== want) wrongN++;
      if (new Set(drawn.map((c) => c.category)).size !== drawn.length) dup++;
      cnt += drawn.length;
    }
  }
  t("同日不同类目", dup === 0, "重复 " + dup + " 次");
  t("每日张数 2/2/3（全局 34 张/局）", wrongN === 0 && cnt === 200 * 34, "总抽 " + cnt);
}

/* 4. aiNight「调阅背景」应更新行动者自己的 belief（修复前错写为 target.belief[target.idx]） */
{
  const st = setupWorld("medium", 9, "employee", 31337);
  const sen = st.actors.find((a) => a.tier === "senior" && !a.isPlayer);
  const snapshot = JSON.stringify(st.actors.map((a) => a.belief));
  let msg = null;
  for (let k = 0; k < 60 && !(msg || "").includes("背景资料"); k++) msg = aiNight(sen, st);
  const own = JSON.parse(snapshot)[sen.idx];
  t("夜间调阅背景更新行动者自身 belief",
    (msg || "").includes("背景资料") && JSON.stringify(sen.belief) !== JSON.stringify(own));
}

/* 5. 信任矩阵 [-100,100]、belief 4 维且 [0,1] */
{
  let ok = true;
  for (const d of ["easy", "medium", "hard"]) {
    const st = setupWorld(d, 9, null, 555);
    for (let day = 1; day <= 12; day++) for (const c of drawDayCards(st, day, 3)) { /* 制造状态推进 */ }
    for (const a of st.actors) {
      for (const k in a.trust) if (a.trust[k] < -100 || a.trust[k] > 100) ok = false;
      for (const k in a.belief) {
        const b = a.belief[k];
        if (!Array.isArray(b) || b.length !== 4) ok = false;
        for (const x of b) if (!(x >= 0 && x <= 1)) ok = false;
      }
    }
  }
  t("信任∈[-100,100]、belief 4 维∈[0,1]", ok);
}

console.log(`\n合计 PASS=${pass} FAIL=${fail}`);
if (fail) process.exitCode = 1;
