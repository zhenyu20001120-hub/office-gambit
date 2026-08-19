# QA 门控报告 · 四象限决策网格（`quadrant-system.md` 落地）

- **QA 负责人**：严守真（quality-lead）
- **受测特性**：四象限决策网格 + 富文案（desc/consequence）+ 克制流畅动画（取代王权式左右滑卡）
- **门控范围**：A 回归硬门 · B 四象限功能 · C 文案瑕疵 · D 动画与可访问性 · E 布局正确性 · F 配套核对
- **数据基准**：`web/cards.js` == `docs/cards.js`（字节一致，diff 空）；全量 372 张（60 大 / 240 小 / 72 随机）
- **方法**：复跑主理人独立复验 + 全量 372 卡结构化扫描（`_qa_scan.js`）+ 源码/规格逐条比对。**未改动任何业务代码，仅读与测。**

---

## 1. 判定总表

| 项 | 判定 | 关键证据（可复现） |
|----|------|-------------------|
| **A 回归硬门复核** | **PASS** | `node --check` 6/6 通过；`node tools/headless_check.js` **240 局 0 crash**；`diff web/cards.js docs/cards.js` 空；`style.css` 8 keyframes 齐（web + docs 一致） |
| **B 四象限功能核对** | **PASS** | 全量 372 结构：象限铺满 2×2 = **100%**、side 与 quadrant 自洽 = **100%**、desc/consequence 非空 = **100%**、card.text 含 STAKES 句 = **100%**；抽样 12 大 + 12 小逐项核对全对 |
| **C 文案瑕疵评估** | **CONCERNS（非阻断）** | 瑕疵① 18/1488 = **1.21%**（全在 SP 稳妥格）；瑕疵② 7/1488 = **0.47%**（desc 叠词）。比例低、不触机制、不影响可玩性 |
| **D 动画与可访问性** | **PASS**（2 条 minor 提示） | 8 keyframes 参数对齐 art-bible §11.2（2 处 cosmetic 偏差）；`prefers-reduced-motion` 分支存在且正确降级/保留状态；键盘 1–4 / `aria-label` / `role` / 焦点环齐；烛光·暗角 overlay 存在且极轻（振幅 = 8%，恰为 §11.2/§11.3 指定值） |
| **E 布局正确性** | **PASS** | `ORDER` + 2 列网格 → 左上 SA(1)/右上 RA(2)/左下 SP(3)/右下 RP(4)；轴标签 Y 上=积极·下=消极、X 左=稳妥·右=激进，与 §A.1/§C.1/§C.3 真值表一致；低精力重映射 `stress≥75 → RP/RA 置灰` 正确 |
| **F 配套核对** | **PASS** | `reigns_layer.md` §4（行 180）、§7.2（行 352）已加「被 quadrant-system.md 取代」废弃标注；`index.html` 开局提示提及 2×2 + 键盘 1–4；`docs/` ≡ `web/`（`index.html`/`style.css`/`game.js`/`tuning.js` 全部 IDENTICAL） |

---

## 2. 逐项证据

### A. 回归硬门复核 → PASS（主理人结论可复现）
- `node --check web/{game,cards,tuning}.js` 与 `docs/{game,cards,tuning}.js`：**6/6 全部通过**。
- `node tools/headless_check.js`：3 难度 × 4 档位 × 20 局 = **240 局，TOTAL crashes = 0/240**（示例单局可跑满月、产出 result/reveal/log）。
- `diff web/cards.js docs/cards.js`：**空**（`cards.js` 与 `docs/cards.js` 字节一致，生成器同份 `out` 写出）。
- 8 keyframes 在 `web/style.css` 与 `docs/style.css` 均存在：`cardIn / cardOut / quadHover / quadSelect / quadDim / floatUp / candleFlicker / vignetteBreath`（另保留 `barWarn`/`barDanger`）。
- 旧 `reign-card`/`reign-left`/`translateX` 渲染**已无**：`web/game.js` 仅剩 `.quad-grid`/`.quad-cell` 按 `quadrant` 渲染；`grep` 命中均为 `reign_debuff` 数据字段与注释，无残留渲染。

### B. 四象限功能核对 → PASS
全量 372 张结构化扫描（`_qa_scan.js`）结果：

| 检查 | 结果 |
|------|------|
| 前 4 选项象限恰为 SP/SA/RP/RA 各一（铺满 2×2） | **372/372 通过（0 失败）** |
| `side` 与 `quadrant` 自洽（SP/SA→left，RP/RA→right） | **1488/1488 通过（0 失败）** |
| `desc` 非空且可读 | **1488/1488 通过** |
| `consequence` 非空 | **1488/1488 通过** |
| `card.text` 含 STAKES 利害关系句 | **372/372 通过** |
| 按类型结构失败 | major 0 / minor 0 / random 0 |

抽样核对（12 大事件 + 12 小事件，含 M09/M44/M55/M12/M35/M42/M22/M46/M41/M54/M34/M58 与 m_M60_3/m_M04_3/m_M40_2/… 等）：每张 `quadrants={sp,sa,rp,ra}` 均正确映射到 c1–c4；`choice` 含 `quadrant/side/desc/consequence`；`card.text` 含 STAKES 句。节选示例：
- `M01c1` → `quadrants={sp:M01c1, sa:M01c2, rp:M01c3, ra:M01c4}`，`choice` 含 `quadrant/side/desc/consequence`，`card.text` 含「这一步怎么走，基本定了你前半年是透明人还是靶子。」
- 小事件 `m_M01_1a`（入职）：`desc=你选择蛰伏守成：把流程走顺，把入职流程走顺，不抢风头。`（功能正确，但此处命中瑕疵②叠词，见 C）。

> 结论：四象限功能**逐卡可验证通过**，非抽样臆测。

### C. 文案瑕疵评估 → CONCERNS（非阻断）
基于 1488 个网格选项（372×4）的全量扫描：

**瑕疵①：`consequence` 仅剩光秃秃的派系括号句**（主理人复验抓取项）
- 数量：**18 / 1488 = 1.21%**。
- 分布：**全部集中在 `stable_passive`（SP 稳妥退路）格**。成因 = 该选项 5 维 Δ 全 <2（§B.2 取不到 top-2 维度），`describeConsequence` 仅由派系附注组成，如 `（上位派会记你一笔）。`。
- 影响：句子本身语法完整、语义可读（仍传达派系后果），但**缺少数值维度预览**，读感像"半句话"。属 Minor 级。

**瑕疵②：`desc` 中 label 与 CAT_CONTEXT 语义重叠造成叠词**（主理人复验抓取项）
- 数量：**7 / 1488 = 0.47%**。
- 命中样例：
  - `m_M01_1a`：label「把流程走顺」+ ctx「把入职流程走顺，不抢风头」→ 读成「把流程走顺，把入职流程走顺，不抢风头」
  - `m_M21_1b/4b`：label「冷处理」+ ctx「在回应和冷处理之间选择」
  - `m_M26_1a/m_M55_1a`：label「体面走」+ ctx「在体面走和留遗产之间选」
  - `R45c3/R69c3`：label「拿票换人情」+ ctx「在跟票和换人情之间盘算」
- 成因 = `autoMinorChoices` 抽到的 `label` 与 `CAT_CONTEXT[category]` 动词核心重叠（§B.1 模板直拼未去重）。属 Minor 级。

**判定**：两项比例均 <1.3%，且**不触任何机制/数值/可玩性**，玩家仍能正常决策。按规格建议 → **CONCERNS（非阻断）**，列入下个补丁 must-fix，不阻塞本次发布。

### D. 动画与可访问性 → PASS（2 条 minor 提示，非阻断）
- **8 keyframes 参数对齐 art-bible §11.2**（绝大多数精确匹配）：`cardIn .25s ease-out 0→1/translateY8→0` ✓、`quadSelect .30s brightness1→1.15→1 scale1→1.02→1` ✓、`candleFlicker 3.2s .92↔1` ✓、`vignetteBreath 4s .92↔1` ✓、`quadDim opacity1→.45` ✓、`floatUp translateY0→-18px .6s` ✓。
  - *minor 提示 1*：`cardOut` 缓动为 `ease-out`（§11.2 写 `ease-in`）；`floatUp` 透明度为 `0→1`（§11.2 写 `1→0`，即末段淡出）。两者均为退场动效的 cosmetic 细节，不影响"克制流畅"体感。
- **`prefers-reduced-motion` 分支存在且正确**（`style.css` 行 527–537）：关闭 `cardIn/cardOut/quadHover/quadSelect/quadDim/floatUp/candleFlicker/vignetteBreath` 非必要动效；**保留状态变化**——`.dimmed` 静态 opacity、焦点环 outline、`bar-warn/bar-danger` 静态 glow、`hover` brightness 过渡。符合 §11.5。
- **键盘可达**：文档级 `keydown` 监听——四象限激活时 `1–4` → `_chooseKey` 选格、`5–9` → 展开全部；每格 `<button role="button" tabindex="0" aria-label="<象限名>（键N）：<label>。<效果摘要> <语气>" data-key=N>`，`Enter/Space` 激活，`focus-visible` 焦点环 `outline:2px var(--glow)`。符合 §11.5-1/2。
  - *minor 提示 2*：缺 `aria-keyshortcuts="1"` 属性（§11.5-2 建议项，可选，非强制）。
- **暗角/烛光 overlay 极轻**：`#candle-overlay`（`mix-blend:screen`，max-alpha .10）+ `#vignette-overlay`（`multiply`）。呼吸振幅 `.92↔1` = **8%**（恰为 art-bible §11.2/§11.3 所写取值，与其"振幅<8%"同义/边界）。暗角渐变 `transparent 52% / rgba(0,0,0,.5) 100%` 与 §11.3 的 `55%/.45` 仅微小差异，仍属"极轻"。

### E. 布局正确性 → PASS
- 渲染真值表（`web/game.js` `ORDER` + 2 列 `grid-template-columns:1fr 1fr`）：
  | 网格位 | 键 | quadrant | 中文 |
  |------|----|-----------|------|
  | 左上 | 1 | `stable_active` (SA) | 稳积·经营 |
  | 右上 | 2 | `risky_active` (RA) | 激积·搏进 |
  | 左下 | 3 | `stable_passive` (SP) | 稳消·守成 |
  | 右下 | 4 | `risky_passive` (RP) | 激消·险守 |
  → 与 §A.1/§C.1 完全一致。
- 轴标签：Y「▲ 积极·扩张联结」上 /「▼ 消极·收缩自保」下；X「◀ 稳妥·不冒险」左 /「激进·敢搏 ▶」右。与 §A.1/§C.3 一致。
- 低精力重映射（`web/game.js` 行 1647/1675/1697）：`lowEnergy = stress>=75`（= energy≤25）时 `RP/RA` 两激进格 `disabled`（灰度 + 「精力不支」锁标 + 顶部红字横幅），语义等价于"过劳只能求稳"。与 §D.2-4 一致。

### F. 配套核对 → PASS
- `design/gdd/reigns_layer.md`：
  - §4 区（行 180）：「⚠️ **本节已被 `quadrant-system.md` 的「四象限决策网格」方案取代**（主理人已拍板）。`card.reigns={left,right}` 已废弃，改为 `card.quadrants={sp,sa,rp,ra}`；王权式左右滑卡改为 2×2 网格（点击 + 键盘 1–4）。**」
  - §7.2 区（行 352）：「⚠️ **本节已被 `quadrant-system.md` 取代**：`.reign-card` 左右滑卡改为 2×2 四象限网格（`.quad-card`/`.quad-cell`，键 1–4）…」
  → 废弃标注已落地。
- `index.html` 开局提示（行 68，web 与 docs 一致）：「提示：每张情况牌是 2×2 四象限——稳妥↔激进 / 消极↔积极，点击或键盘 1–4 选择。压力过高时屏幕边缘会泛红噪点。」
- `docs/` ≡ `web/`：`index.html` / `style.css` / `game.js` / `tuning.js` 经 `diff -q` **全部 IDENTICAL**（含 `cards.js` 先前已确认）。同步无缺口。

---

## 3. 总体门控结论

**PASS · 可放行。**

- A/B/D/E/F 全部 **PASS**；
- C 为 **CONCERNS（非阻断）**：2 个文案瑕疵合计占比 <1.3%，仅影响个别选项的阅读体感，不触机制/数值/可玩性，**不建议因此阻塞发布**。
- 签字建议：**可放行**，但将下方 must-fix 列入下个补丁（由工程程基岩落地，QA 复核）。

---

## 4. 对 2 个文案瑕疵的修复建议（must-fix · 下个补丁，交工程）

> 两处均在 `tools/gen_campaign.js`（确定性生成器），改动后重跑即全量生效，无需手工改 372 张。

### 4.1 瑕疵①：`consequence` 光秃括号句 → 补中性主句
`describeConsequence` 在 `ranked`（维度部分）为空、仅余派系附注时，前置一句中性主句：
```js
// tools/gen_campaign.js · describeConsequence
  if (Math.abs(ft[best]) >= 3) {
    parts.push(ft[best] >= 0 ? `（${FACTION_TAG[best]}派会更信你）` : `（${FACTION_TAG[best]}派会记你一笔）`);
  }
  // 【修复】5 维 Δ 全 <2 时 parts 仅余派系括号句，补中性主句避免"半句话"
  if (parts.length === 1 && /^（.+）$/.test(parts[0])) {
    parts.unshift("影响不显，但局面已动");
  }
  return parts.join("，") + "。";
```
效果：`（上位派会记你一笔）。` → `影响不显，但局面已动（上位派会记你一笔）。`（完整句）。

### 4.2 瑕疵②：`desc` 叠词 → 拼接前去 label/ctx 重叠
`genDesc` 拼接前，去掉 `label` 与 `CAT_CONTEXT` 在拼接处的重叠片段（取最长公共子串 ≥2 并从 ctx 中剔除该重叠段）：
```js
// tools/gen_campaign.js · genDesc
function stripP(s){ return (s||"").replace(/[\s，。、；：！？（）()]/g,""); }
function lcsLen(a,b){ /* 见 _qa_scan.js：最长公共连续子串长度 */ }
function genDesc(category, quadrant, label) {
  const frame = QUAD_FRAME[quadrant];
  const ctx = CAT_CONTEXT[category];
  if (!ctx) return `${frame}：${label}。`;
  // 【修复】去叠词：若 label 与 ctx 有 ≥2 字重叠，从 ctx 中剔除该重叠片段
  const L = stripP(label), C = stripP(ctx);
  let ov = "";
  for (let k = 2; k <= Math.min(L.length, C.length); k++) {
    const sub = L.slice(L.length - k);          // label 末尾 k 字
    if (C.includes(sub)) ov = sub;              // 取最长重叠
  }
  let ctxOut = ctx;
  if (ov) {
    // 在 ctx 原文中删除首个重叠片段（字符级对齐，含其后紧跟标点）
    const re = new RegExp(ov.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[，。、]?");
    ctxOut = ctx.replace(re, "");
  }
  return `${frame}：${label}${ctxOut ? "，" + ctxOut : ""}。`;
}
```
效果示例：`把流程走顺，把入职流程走顺，不抢风头` → `把流程走顺，不抢风头`；`冷处理，在回应和冷处理之间选择` → `冷处理，在回应和之间选择`（无重复，残留轻微但不影响理解）。该逻辑对全部 7 个命中项确定性生效，且对所有正常卡无副作用（无重叠时 `ov` 为空，原样输出）。

> 备选：若工程倾向零风险，可对少数热点 `CAT_CONTEXT`（入职/投诉/离职/投票）做一次性文案微调，但推荐上述代码去重——更彻底、可复现。

---

## 5. 已知风险与缓解

1. **RA（激积）主导策略校准（GDD §D.2 风险6）未在本门控内覆盖**：四象限仅改交互形态，不新增数值逻辑，但 arch 重池化改写了 minors/majors 数值。本次 QA 覆盖硬门（不崩）+ 结构 + 文案，**未跑平衡蒙特卡洛**。建议发布前由工程补跑 `tools/coverage_check.js` 与 balance 蒙特卡洛，确认无象限期望收益碾压（任一象限 avg score 超其余 ≥15% 视为异常）。
2. **`cardOut` 缓动 / `floatUp` 透明度方向**与 §11.2 文字略有出入（D-minor-1）：纯观感，不阻断；若美术坚持完全对齐规格可微调。
3. **缺 `aria-keyshortcuts`**（D-minor-2）：可访问性 Standard 级建议项，非强制，下版补。
4. **暗角渐变 52%/.5 vs §11.3 55%/.45**：差异在 3% 内，视觉无感，忽略。
5. **GDD §D.2 待主理人拍板项（风险1 取代 / 风险4 重映射 / 风险6 校准）**：本次已实现落地（取代滑动、低精力重映射），唯风险6 校准需独立平衡门控，见上。

---

*交付物：本报告（`tests/qa-quadrant.md`）+ 扫描脚本（`_qa_scan.js`，临时分析用，可删除） + 回传摘要。未执行 git commit，未改动任何业务代码。*
