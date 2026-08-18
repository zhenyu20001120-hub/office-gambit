// 质量回归模拟：Proxy 假 DOM 桩加载 web|docs 的 tuning/cards/game，自动驱动完整 12 天对局。
// 统计：崩溃数 / 是否走到结局 / 各层级被投出率 / factionTrust 是否出现非零变化 / 每局联席会议次数。
// 用法：node tools/quality_sim.js [web|docs] [每组局数]
const fs = require("fs");
const path = require("path");

const WHICH = process.argv[2] || "web";
const N = parseInt(process.argv[3] || "200", 10);
const ROOT = path.resolve(__dirname, "..", WHICH);

/* ---- Proxy 假 DOM：任意属性/调用都返回自身，让 initApp 能安全跑完 ---- */
function makeStub() {
  const el = new Proxy(function () {}, {
    get: (t, k) => {
      if (k === "readyState") return "complete";
      if (k === "value") return "";
      if (k === Symbol.toPrimitive) return () => "";
      if (k === "length") return 0;
      return el;
    },
    set: () => true,
    apply: () => el,
    construct: () => el,
    has: () => true,
  });
  return el;
}
const stub = makeStub();

let code = fs.readFileSync(path.join(ROOT, "tuning.js"), "utf8") + "\n"
  + fs.readFileSync(path.join(ROOT, "cards.js"), "utf8") + "\n"
  + fs.readFileSync(path.join(ROOT, "game.js"), "utf8") + "\n";
// 去掉浏览器末尾的 module.exports 块（Node 下会引用 module，干扰 Function 作用域）
const mi = code.indexOf("if (typeof module");
if (mi >= 0) code = code.slice(0, mi);
code += `
// 暴露内部符号 + 允许把 phaseAssembly 包一层用于计数（函数声明绑定可重写）
globalThis.__api = { runGame, setupWorld, RandomController, FACTIONS, TUNING };
globalThis.__hookAssembly = (fn) => {
  const orig = phaseAssembly;
  phaseAssembly = async function (s, c) { fn(s); return orig(s, c); };
};
`;
// document/window/alert/console 由参数注入，模拟浏览器全局
new Function("document", "window", "alert", "requestAnimationFrame", "setTimeout", code)(
  stub, stub, () => {}, (f) => f && f(), (f) => f && f()
);

const api = globalThis.__api;
const VOTE_CAUSE = "优化名单（联席会议投票出局）";

// 调参用：QS_TTW="employee,mid,senior" 覆盖 vote_threat_weight（仅本进程内，不写文件）
if (process.env.QS_TTW) {
  const [e, m, s] = process.env.QS_TTW.split(",").map(Number);
  api.TUNING.TIER_MODS.employee.vote_threat_weight = e;
  api.TUNING.TIER_MODS.mid.vote_threat_weight = m;
  api.TUNING.TIER_MODS.senior.vote_threat_weight = s;
  console.log(`[override] vote_threat_weight = ${e} / ${m} / ${s}`);
}

let assemblyCount = 0;
globalThis.__hookAssembly(() => { assemblyCount += 1; });

// 采样 factionTrust：每张牌结算后记录绝对值最大值
class ProbeController extends api.RandomController {
  constructor() { super(); this.ftMaxAbs = 0; this.ftSamples = 0; }
  afterCard(state) {
    this.ftSamples += 1;
    for (const f of api.FACTIONS) {
      this.ftMaxAbs = Math.max(this.ftMaxAbs, Math.abs(state.factionTrust[f] || 0));
    }
  }
}

(async () => {
  const diffs = ["easy", "medium", "hard"];
  const tiers = ["employee", "mid", "senior"];
  const rows = [];
  let crashes = 0, games = 0, noResult = 0, ftChangedGames = 0;
  const asmHist = {};

  for (const d of diffs) {
    for (const t of tiers) {
      let voteOut = 0, done = 0, ftChanged = 0, ftPeak = 0;
      for (let i = 0; i < N; i++) {
        assemblyCount = 0;
        const ctrl = new ProbeController();
        games += 1;
        try {
          const res = await api.runGame(d, api.TUNING.NUM_ACTORS, t, ctrl, 90001 + i * 7);
          if (!res || !res.outcome) noResult += 1; else done += 1;
          const me = res.reveal[0];
          if (!me.alive && me.outCause === VOTE_CAUSE) voteOut += 1;
          if (ctrl.ftMaxAbs > 0) { ftChanged += 1; ftChangedGames += 1; }
          ftPeak = Math.max(ftPeak, ctrl.ftMaxAbs);
          asmHist[assemblyCount] = (asmHist[assemblyCount] || 0) + 1;
        } catch (e) {
          crashes += 1;
          if (crashes <= 2) console.log("CRASH:", String((e && e.stack) || e).slice(0, 500));
        }
      }
      rows.push({ d, t, voteOutRate: voteOut / N, done, ftChangedRate: ftChanged / N, ftPeak });
    }
  }

  console.log(`\n== ${WHICH}/ 每组 ${N} 局，共 ${games} 局 ==`);
  console.log("难度    层级        被投出率   走到结局  factionTrust有变化  峰值|ft|");
  for (const r of rows) {
    console.log(
      `${r.d.padEnd(7)} ${r.t.padEnd(11)} ${(r.voteOutRate * 100).toFixed(1).padStart(6)}%  ` +
      `${String(r.done).padStart(6)}/${N}  ${(r.ftChangedRate * 100).toFixed(1).padStart(9)}%  ` +
      `${r.ftPeak.toFixed(0).padStart(7)}`
    );
  }
  const seniorRates = rows.filter((r) => r.t === "senior").map((r) => r.voteOutRate);
  const avgSenior = seniorRates.reduce((a, b) => a + b, 0) / seniorRates.length;
  console.log(`\n高层(senior)平均被投出率: ${(avgSenior * 100).toFixed(1)}%`);
  for (const t of tiers) {
    const rs = rows.filter((r) => r.t === t).map((r) => r.voteOutRate);
    console.log(`  ${t}: ${(rs.reduce((a, b) => a + b, 0) / rs.length * 100).toFixed(1)}%`);
  }
  console.log(`崩溃: ${crashes}/${games}  无结局: ${noResult}`);
  console.log(`factionTrust 出现非零变化的局数: ${ftChangedGames}/${games - crashes}`);
  console.log(`每局联席会议次数分布: ${JSON.stringify(asmHist)}`);
})();
