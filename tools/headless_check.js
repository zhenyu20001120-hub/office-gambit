// 无头跑测：模拟浏览器 <script src> 共享全局，加载 tuning/cards/game，跑满 60 个月（372 张嵌套卡）确认不崩。
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "web");
let code = fs.readFileSync(path.join(ROOT, "tuning.js"), "utf8") + "\n"
  + fs.readFileSync(path.join(ROOT, "cards.js"), "utf8") + "\n"
  + fs.readFileSync(path.join(ROOT, "game.js"), "utf8") + "\n";
// 去掉浏览器末尾的 module.exports 块（Node 下该块会引用 module，干扰 eval 作用域）
const idx = code.indexOf("if (typeof module");
if (idx >= 0) code = code.slice(0, idx);
code += "\nglobalThis.__api = { runHeadless, setupWorld, runGame, RandomController, finalJudge };\n";
new Function(code)();

const api = globalThis.__api;
(async () => {
  const diffs = ["easy", "medium", "hard"];
  const tiers = [null, "employee", "mid", "senior"];
  let tc = 0, tg = 0;
  // 单局示例：确认能跑到第 60 月并产出 result
  const ex = await api.runGame("medium", 9, "mid", new api.RandomController(), 777);
  console.log(`示例单局：month=${ex.month} outcome=${ex.outcome} rating=${ex.rating} faction=${ex.factionAlias}/${ex.factionTier} subOk=${ex.subOk}`);
  console.log("reveal 行数:", ex.reveal.length, "log 行数:", ex.log.length);
  for (const d of diffs) for (const t of tiers) {
    const r = await api.runHeadless(20, d, 9, t, 12345);
    tc += r.crashes; tg += r.numGames;
    console.log(`diff=${d} tier=${t} crashes=${r.crashes}/${r.numGames} out=${JSON.stringify(r.outcomes)} rate=${JSON.stringify(r.ratings)}`);
    if (r.crashes > 0) console.log("ERR:", JSON.stringify(r.examples.filter((e) => e.error).slice(0, 2)));
  }
  console.log("TOTAL crashes=" + tc + "/" + tg);
})();
