/* 机制覆盖统计：多结局 / 三难度 / 三层级 / 淘汰原因 / 联席会议次数 / 派系目标档 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "web");
let code = fs.readFileSync(path.join(ROOT, "tuning.js"), "utf8") + "\n"
  + fs.readFileSync(path.join(ROOT, "cards.js"), "utf8") + "\n"
  + fs.readFileSync(path.join(ROOT, "game.js"), "utf8") + "\n";
code = code.slice(0, code.indexOf("if (typeof module"));
code += "\nglobalThis.__api={runGame,RandomController,setupWorld,TUNING};\n";
new Function(code)();
const { runGame, RandomController, TUNING } = globalThis.__api;

(async () => {
  const ratings = {}, outcomes = {}, causes = {}, tiers = {}, facTier = {}, byFac = {};
  let crashes = 0, assemblyOuts = 0, games = 0, dayNot12 = 0;
  for (const d of ["easy", "medium", "hard"]) {
    for (const t of ["employee", "mid", "senior"]) {
      for (let i = 0; i < 60; i++) {
        games++;
        try {
          const r = await runGame(d, TUNING.NUM_ACTORS, t, new RandomController(), 100000 + i * 7 + d.length);
          ratings[r.rating] = (ratings[r.rating] || 0) + 1;
          outcomes[r.outcome] = (outcomes[r.outcome] || 0) + 1;
          tiers[r.playerTier] = (tiers[r.playerTier] || 0) + 1;
          facTier[r.factionTier] = (facTier[r.factionTier] || 0) + 1;
          byFac[r.factionAlias] = (byFac[r.factionAlias] || 0) + 1;
          if (r.day !== 12) dayNot12++;
          for (const rv of r.reveal) {
            if (rv.outCause) {
              const key = rv.outCause.replace(/（.*/, "");
              causes[key] = (causes[key] || 0) + 1;
              if (rv.outCause.includes("联席会议")) assemblyOuts++;
            }
          }
        } catch (e) { crashes++; console.log("CRASH", e && e.stack); }
      }
    }
  }
  console.log("局数:", games, "崩溃:", crashes, "| 未跑满12天的局数:", dayNot12);
  console.log("评级分布 (7 档):", JSON.stringify(ratings));
  console.log("结局分布:", JSON.stringify(outcomes));
  console.log("派系目标档:", JSON.stringify(facTier));
  console.log("玩家派系分布:", JSON.stringify(byFac));
  console.log("淘汰原因:", JSON.stringify(causes));
  console.log("平均每局联席会议出局人数:", (assemblyOuts / games).toFixed(2), "（4 次会议上限 4）");
  const need = ["S", "A", "A-", "B", "B-", "C", "D"];
  const missing = need.filter((r) => !ratings[r]);
  console.log(missing.length ? "!! 未覆盖评级: " + missing.join(",") : "7 档评级全部覆盖");
  const needFac = ["full", "bare", "fail", "disaster"];
  console.log("目标档缺失:", needFac.filter((k) => !facTier[k]).join(",") || "无（full/bare/fail/disaster 均出现）");
  if (crashes) process.exitCode = 1;
})();
