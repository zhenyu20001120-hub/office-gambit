// 一次性数据转换器：把 tuning.json / cards.json 转成浏览器可用的 <script src> 常量。
// 用法：node tools/convert_to_web.js
// 卡片归一化严格复刻 src/cards_data.py 的 load_cards()。
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WEB = path.join(ROOT, "web");

function main() {
  if (!fs.existsSync(WEB)) fs.mkdirSync(WEB, { recursive: true });

  // ---- tuning.json -> web/tuning.js ----
  const tuning = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "tuning.json"), "utf8"));
  fs.writeFileSync(
    path.join(WEB, "tuning.js"),
    "// 自动生成自 config/tuning.json —— 引擎全部数值外置，键名与 tuning.json 一致。\n" +
      "const TUNING = " + JSON.stringify(tuning, null, 2) + ";\n"
  );

  // ---- cards.json -> web/cards.js ----
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "design", "cards", "cards.json"), "utf8"));
  const FACTIONS = ["FV_A", "FV_B", "FV_C", "FV_D"];
  const cards = [];
  for (const c of data.cards || []) {
    const norm = {
      id: c.id,
      title: c.title || "",
      tier: c.tier || "any",
      category: c.category || "",
      text: c.text || "",
      flavor: c.flavor || "",   // 潜台词 / 内心独白（由 tools/gen_flavor.js 写入 cards.json）
      tags: c.tags || [],
      choices: [],
    };
    for (const ch of c.choices || []) {
      const eff = ch.effects || {};
      const pl = eff.player || {};
      norm.choices.push({
        id: ch.id,
        label: ch.label || "",
        arch: ch.arch || "hedge",
        player: {
          influence: Number(pl.influence || 0),
          stress: Number(pl.stress || 0),
          cash: Number(pl.cash || 0),
          // Reigns 四表盘层：业绩 / 人脉（与 GDD §3.3 批量增补一致）
          performance: Number(pl.performance || 0),
          network: Number(pl.network || 0),
        },
        faction_trust: Object.fromEntries(
          FACTIONS.map((f) => [f, Number((eff.faction_trust || {})[f] || 0)])
        ),
      });
    }
    // Reigns 左右二选一预计算（由 design/cards/cards.json 的 card.reigns 透传，杜绝双端分歧）
    if (c.reigns && c.reigns.left && c.reigns.right) {
      norm.reigns = { left: c.reigns.left, right: c.reigns.right };
    } else {
      norm.reigns = null;
    }
    cards.push(norm);
  }
  const meta = data.meta || {};
  // 每牌选项数最小的也需 >=4（UI 要求）。此处仅校验并报告。
  const minChoices = cards.reduce((m, c) => Math.min(m, c.choices.length), Infinity);
  const below4 = cards.filter((c) => c.choices.length < 4).length;
  console.log(`cards: ${cards.length} 张，最少选项 ${minChoices} 张，<4 选项的 ${below4} 张`);

  fs.writeFileSync(
    path.join(WEB, "cards.js"),
    "// 自动生成自 design/cards/cards.json —— 已按 cards_data.load_cards 归一化。\n" +
      "// CARDS 直接供 game.js 消费（choice 已展平为 player{influence,stress,cash} / faction_trust{FV_A..FV_D}）。\n" +
      "const CARDS = " + JSON.stringify(cards, null, 2) + ";\n" +
      "const CARD_META = " + JSON.stringify(meta, null, 2) + ";\n"
  );

  console.log("已写出 web/tuning.js 与 web/cards.js");
}

main();
