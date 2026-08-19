# 《职场营销博弈》四象限系统规格（quadrant-system.md）

- 版本：v0.1（设计稿，待主理人拍板后交工程落地）
- 作者：文策渊（design-strategist）
- 范围：本稿只出**设计 / 文案 / 交互规格**，不写任何 `web/` `docs/` `tools/` 代码（落地归程基岩）。
- 配套文档：
  - `design/gdd/gdd-core.md`（核心 7 系统，本稿挂系统④卡片交互层之上）
  - `design/gdd/reigns_layer.md`（四表盘 / 8 危机 / left·right 收敛 —— **本稿第 D 节明确其 §4、§7.2 被本四象限方案取代**）
  - `design/gdd/balance.md`（influence/stress/cash 经济基线，本稿不重复，只增补 desc/consequence 可读化）
  - 代码基准：`tools/gen_campaign.js`、`tools/campaign_source.js`、`design/cards/campaign.json`、`web/cards.js`==`docs/cards.js`（字节一致）
- 用户已拍板 4 项决策（本稿全部遵守）：
  1. **四象限网格【替换】王权式左右滑卡** —— 主交互改为 2×2，点击 + 键盘 1–4，移动端点按网格。
  2. **轴语义**：横轴 = 稳妥 ↔ 激进；纵轴 = 消极 ↔ 积极。
  3. **动画强度 = 克制流畅**（视觉由 art-director 定，本稿只定交互与语义）。
  4. **文案 = 模板化生成全部 372 张**（60 大事件 + 240 小事件 + 72 随机事件），用现有类目词池确定性生成，`web==docs` 一致可复现。

---

## 0. 与既有架构的关系（务必先读）

| 既有物 | 本稿处置 |
|------|------|
| `tools/gen_campaign.js` 的 `autoMinorChoices` | **改写**：旧逻辑 2×left(passive) + 2×right(active) 填不满四象限（坑已确认）。改按位置分配 4 象限池（见 §A.2）。 |
| `normalizeChoice` 丢弃 `side` 字段 | **补回** `side` 与新增 `quadrant`（见 §A.3 schema）。 |
| `gen_campaign.js` 的 `card.reigns={left,right}` | **废弃 → 改为 `card.quadrants={sp,sa,rp,ra}`**（见 §A.3）。断言 `c.reigns.left/right` 同步改 `c.quadrants.*`。 |
| `reigns_layer.md` §4（left/right 收敛）、§7.2（滑动热区） | **被本稿取代**（见 §D.2 风险 1）。其余四表盘 / 8 危机 / 派系信任**全部沿用、零改动**。 |
| `campaign_source.js` 的 MAJORS/RANDOMS | 每卡 4 选项 `side`/`arch` 按位置重排以铺满 2×2（见 §A.2 / §B.4），`label`/`text`/`title`/`flavor` 文案尽量保留并精修。 |
| `web/cards.js` == `docs/cards.js` 字节一致 | 新增字段由同一份 `out` 写出，**不变**。 |

> 一句话：四象限是「left/right 二选一」的**超集**（4 选项全展示，但结算逻辑、四表盘、8 危机、派系信任完全复用），不改变任何数值经济，只改交互形态与文案呈现。

---

## 1. 设计支柱（四象限层专用，与既有支柱不冲突）

1. **「四格全是活路，但代价当场可见」**：把原 left/right 二选一扩为 2×2，玩家一眼扫到四种生存姿态；每个选项的 5 维 Δ 与后果预览直接标注（继承 reigns_layer 支柱 2「代价当场可见」）。
2. **「姿态有轴，决策有谱」**：横轴管风险（稳妥/激进），纵轴管姿态（消极收缩/积极扩张），让玩家在「我该冒多大险」「我该进还是退」两个正交维度上做选择，而不是被二选一逼成非黑即白。
3. **「选完照旧走绞索」**：选定任一象限后，仍跑既有四表盘触边检查（8 危机），四象限不绕过任何生存约束。

---

# A. 四象限系统规格

## A.1 四象限语义命名（建议中文名）

轴定义（用户决策 2）：
- **横轴 X**：左 = 稳妥（低风险、低波动）↔ 右 = 激进（高风险、高波动）。沿用 `genPlayer` 的 `side:left/right` 数值范围。
- **纵轴 Y**：下 = 消极（收缩 / 自保 / 回避 / 守住）↔ 上 = 积极（扩张 / 进攻 / 联结 / 立功）。

> 命名说明：用户提到 `PP/PA/AP/AA`。本稿为避免 `P` 既指「稳妥」又指「消极」造成的歧义，采用**无歧义枚举** `stable_passive / stable_active / risky_passive / risky_active`，并配中文 2 字名与短码 `SP/SA/RP/RA`。若主理人坚持 `PP/PA/AP/AA`，映射为：`PP=SP, PA=SA, AP=RP, AA=RA`。

| 象限 | 枚举（canonical） | 短码 | 中文名 | 网格方位 | (X,Y) | 典型玩家行为 | 玩家心理 |
|------|------|------|------|------|------|------|------|
| ① | `stable_passive` | **SP** | **稳消 · 守成** | 左下 | 稳妥×消极 | 低调、走流程、等风头、不抢戏、明哲保身 | 「先活下来再说，别当出头鸟」 |
| ② | `stable_active` | **SA** | **稳积 · 经营** | 左上 | 稳妥×积极 | 扎实攒人脉/做业绩但不冒进、结盟、护人、小步试错 | 「稳稳地把基本盘做实」 |
| ③ | `risky_passive` | **RP** | **激消 · 险守** | 右下 | 激进×消极 | 高风险的自保动作：越级甩锅、激进回避、豪赌式脱身 | 「我赌一把，只为自保」 |
| ④ | `risky_active` | **RA** | **激积 · 搏进** | 右上 | 激进×积极 | 撒钱抢单、背刺、揭发、硬刚、抢功立标 | 「干就完了，赢了就上位」 |

**每象限心理剖面（供 art-director 配色 / 动画基调参考，本稿只列语义）：**
- SP：收敛、安全、略憋屈 —— 基调「沉」。
- SA：扎实、温和、积累 —— 基调「稳」。
- RP：紧张、赌性、以攻代守 —— 基调「悬」。
- RA：张扬、高风险高回报 —— 基调「燃」。

**可选主题派系染色（render 元数据，art-director 可采可不采）：** SP→`FV_D`(降压) / SA→`FV_B`(维稳) / RP→`FV_C`(上位) / RA→`FV_A`(抢单)。仅作视觉呼应，不强制、不写数值。

---

## A.2 选项 → 象限 映射规则（硬口径 · 含已知坑修复）

### A.2.1 已知坑（已确认）

`tools/gen_campaign.js` 现状：`autoMinorChoices` 生成
```
c1,c2 = side:"left"  + arch∈{hedge,shield,obey,dodge}   (被动堆)
c3,c4 = side:"right" + arch∈{invest,betray,expose,risk}  (主动堆)
```
`side` 与 `arch` 被**耦合**：left 永远被动、right 永远主动 → 经 `f(side,arch)` 只能得到 `稳×消` 与 `激×积` 两个象限，**缺 `稳×积` 与 `激×消`**。大事件（如 M01：obey/ally/invest/expose）同理会出现某象限空缺。

### A.2.2 核心修复：side 与 arch 解耦，按位置强制铺满 2×2

**判定式（每个 choice 的最终象限由其在 `choices[]` 中的位置决定，而非由 arch 反推）：**

```
// 规范位置顺序（生成器须保证 choices 数组按此序产出）
POS_QUADRANT = [ "stable_passive",   // index 0 → SP  稳消
                 "stable_active",    // index 1 → SA  稳积
                 "risky_passive",   // index 2 → RP  激消
                 "risky_active" ]   // index 3 → RA  激积

ch.quadrant = POS_QUADRANT[ clamp(index(ch), 0, 3) ]
```

**为保证数值/语义与象限一致，`autoMinorChoices` 与 MAJORS/RANDOMS 的 arch 分配改为按象限取池（解耦 side/arch）：**

```
// 纵轴姿态集合（消极=收缩自保 / 积极=扩张联结）
PASSIVE = { hedge, dodge, obey, self, bow, cashin }                 // 消极
ACTIVE  = { ally, shield, leak, grind, invest, betray, expose, risk } // 积极

// 每象限生成池（side 与 arch 独立选取，不再耦合）
POOL = {
  stable_passive: { side:"left",  arch: pick(PASSIVE)               },  // 稳妥+收缩
  stable_active:  { side:"left",  arch: pick({ally,shield,leak,grind}) }, // 稳妥+扩张
  risky_passive:  { side:"right", arch: pick(PASSIVE)               },  // 激进(高风险)+收缩(自保)
  risky_active:   { side:"right", arch: pick({invest,betray,expose,risk}) }, // 激进+扩张
}
```

- `risky_passive`（激×消）的语义 = "用高风险方式做防御/自保动作"：`side:"right"` 让 `genPlayer` 套用激进幅度（高 stress、大波动），`arch∈PASSIVE` 决定它是"甩锅/回避/服从式自保"而非进攻。例如 `arch=expose` 在 RP 下读作"高调揭发以求自保"，`arch=obey` 在 RP 下读作"高调表忠心赌一把押注靠山"。
- 该分配**由构造保证**每张卡 4 选项恰好落入 4 个不同象限，彻底修复坑。

### A.2.3 跨象限一致性校验（生成器断言，必过）

生成后对每个 card 跑：
```
qs = set(ch.quadrant for ch in choices)
assert len(qs) == 4            // 必须铺满 2×2，缺一即报错，禁止入库
assert ch.side == ("left" if ch.quadrant in (SP,SA) else "right")  // 横轴与 side 自洽
```
> 这也作为 `f(side,arch)` 的反向交叉检查：`VERTICAL[arch]` 应等于该 choice 纵轴（SP/RP→消极，SA/RA→积极）；若不一致，以**位置 quadrant 为准**，并告警（用于发现手写在 `campaign_source.js` 中未对齐的 arch）。

### A.2.4 手写在源（MAJORS / RANDOMS）的重排规则

- 每张大事件 / 随机事件现有 4 选项按 `c1..c4` 顺序**必须**分别对应 `SP/SA/RP/RA`。
- 若现有 `arch` 与位置象限不符（如 M01c4=expose 本应落 RA，但位置要求 RP）：**保留 `label` 文案，将 `arch` 换成该象限池内语义最接近的 arch**（M01c4 改 `expose→dodge`，读作"暗中小动作打探实情"，归 RP），`lean` 字段原样保留（派系基线不动），数值按新 `(side,arch)` 重跑 `genPlayer`。
- `<4` 选项：按 `POS_QUADRANT` 缺哪个补哪个（用 `GENERIC` 池 + 对应象限 arch 确定性合成，seed=`cardId|fill|quadrant`）。
- `>4` 选项：取前 4 按位置映射，多余选项保留进 `choices[]` 但**不进网格**（无障碍「展开全部」入口可见，见 §C.2）。

---

## A.3 choice 新增字段 schema + 渲染元数据

### A.3.1 单 choice 结构（在 `normalizeChoice` 输出中新增/补回）

```
choices[] = {
  id:        string,                 // 现有，全局唯一，如 "m_M01_1a"
  label:     string,                 // 现有，CAT_LABELS 短语（按钮主文案）
  arch:      string,                 // 现有，行为原型（数值/AI 用）
  side:      "left" | "right",       // 【补回】横轴：稳妥/激进（旧版被丢弃，现补回）
  quadrant:  "stable_passive" | "stable_active" | "risky_passive" | "risky_active",
                                        // 【新增】本 choice 所属象限（位置推导，见 A.2.2）
  player:    { influence, stress, cash, performance, network },  // 现有，整数 -10..10
  faction_trust: { FV_A, FV_B, FV_C, FV_D },                    // 现有，整数
  tags:      string[],               // 现有
  desc:      string,                 // 【新增】你具体在干啥，1–2 句白话（见 §B.1）
  consequence: string,               // 【新增】后果预览，1 句可读化（见 §B.2）
}
```

### A.3.2 卡片级字段（废弃 `reigns`，改用 `quadrants`）

```
card = {
  ...既有字段(kind,id,title,tier,category,text,flavor,tags,choices),
  quadrants: {                     // 【新增，取代 reigns】
    sp: <choiceId>,                // 稳消
    sa: <choiceId>,                // 稳积
    rp: <choiceId>,                // 激消
    ra: <choiceId>,                // 激积
  },
  // reigns:{left,right} 过渡期可保留一份指向 sp/sa 或 ra/rp 的兼容映射，最终删除
}
```

### A.3.3 渲染所需元数据（交给 art-director / engineering）

| 元数据 | 取值 | 用途 |
|------|------|------|
| `quadrant` | 4 枚举之一 | 决定该选项落入哪个网格 cell |
| `theme_faction` | `FV_A..FV_D`（可选） | §A.1 的可选染色，SP→D / SA→B / RP→C / RA→A |
| `axis_x_label` | 固定："稳妥"（左）/ "激进"（右） | 横轴两端文案（见 §C.3） |
| `axis_y_label` | 固定："消极"（下）/ "积极"（上） | 纵轴两端文案（见 §C.3） |
| 键盘码 | `1/2/3/4` → 见 §C.2 | 桌面增强 |

---

# B. 富文案规格（用户最在意的"太简单"）

设计原则：**模板化、确定性、可复现、风格统一**。`web/cards.js` 与 `docs/cards.js` 由同一份生成，天然一致。

## B.1 `choice.desc`：你具体在干啥（1–2 句白话）

**组合模板（覆盖全部 50 类目 × 4 象限 = 200 种，靠组合而非 200 条手写，保证风格统一）：**

```
desc = QUAD_FRAME[quadrant] + "：" + label + (CAT_CONTEXT[category] ? "，" + CAT_CONTEXT[category] : "") + "。"
```

- `QUAD_FRAME`（4 条，固定）：
  - SP（稳消）：`"你选择蛰伏守成"`
  - SA（稳积）：`"你选择稳健经营"`
  - RP（激消）：`"你选择险中求稳"`
  - RA（激积）：`"你选择放手一搏"`
- `label` = 现有 `CAT_LABELS[category][side][k]` 短语（已是口语 1 行，直接复用）。
- `CAT_CONTEXT[category]` = 每个类目一句「具体对象/场景」短 clause（见 §B.5 词池表），让 desc 落到具体事上，不空泛。

**示例（类目=入职）：**
- SP：`你选择蛰伏守成：先记熟每一条规矩，把入职流程走顺，不抢任何风头。`
- SA：`你选择稳健经营：主动加讲师微信请教，边学边攒第一波人情。`
- RP：`你选择险中求稳：私下打探「末位淘汰」实情，暗中小动作摸清退路。`
- RA：`你选择放手一搏：复盘时抢答露一手，把新人存在感一次性立起来。`

**生成器伪代码：**
```
function genDesc(card, ch):
  frame = QUAD_FRAME[ch.quadrant]
  ctx   = CAT_CONTEXT[card.category] || ""
  return `${frame}：${ch.label}${ctx ? "，" + ctx : ""}。`
```

## B.2 `choice.consequence`：后果预览（1 句，由 player 增量可读化）

**规则：取该选项 5 维 Δ 中 `|Δ|≥2` 的维度，按 `|Δ|` 降序、维度固定序 `performance>network>influence>stress>energy(cash)` 取前 2，拼成 1 句；若 `faction_trust` 有 `|Δ|≥3` 的主导派系，追加半句派系提示。**

**Δ → 文案表（确定性，黑色幽默职场语气）：**

| 维度 | 档位 | 文案 |
|------|------|------|
| performance 业绩 | ≥+3 / +1..+2 / −1..−2 / ≤−3 | "业绩有望往上走" / "业绩小幅提振" / "业绩略承压" / "业绩明显吃紧" |
| network 人脉 | ≥+3 / +1..+2 / −1..−2 / ≤−3 | "人脉更活络" / "人缘小好" / "人缘略凉" / "人脉受损" |
| influence 声望 | ≥+3 / +1..+2 / −1..−2 / ≤−3 | "风评见涨" / "声望小升" / "风评略损" / "口碑受挫" |
| stress→精力 | ≤−3 / −1..−2 / +1..+2 / ≥+3 | "能松一口气" / "压力略减" / "更累了些" / "压力陡增" |
| cash 现金 | ≥+3 / +1..+2 / −1..−2 / ≤−3 | "钱包回血" / "小有进账" / "小有贴补" / "要自掏腰包" |

派系附注（`FACTION_TAG` = 抢单/维稳/上位/降压）：`+` → "（X 派系会更信你）"，`−` → "（X 派系会记你一笔）"。

**示例（M01c3：performance+4, stress+2, influence+5, FV_A+3）：**
→ 取前 2 强维：声望(5)→"风评见涨"、业绩(4)→"业绩有望往上走"；派系 FV_A+3→"（抢单派会更信你）"
→ `consequence = "风评见涨，业绩有望往上走（抢单派会更信你）。"`

**生成器伪代码：**
```
function describeConsequence(ch):
  D = [
    ("performance", ch.player.performance, PERF_TXT),
    ("network",     ch.player.network,     NET_TXT),
    ("influence",   ch.player.influence,   INFL_TXT),
    ("energy",     -ch.player.stress,      ENERGY_TXT),   // 负 stress = 精力+, 取反
    ("cash",        ch.player.cash,        CASH_TXT),
  ]
  ranked = [d for d in D if abs(d[1]) >= 2]
  ranked.sort(key = (abs(d[1]) desc, dim_order))
  parts = [txt(d) for d in ranked[:2]]
  ft = ch.faction_trust
  best = argmax(abs(v) for v in ft.values())
  if abs(ft[best]) >= 3:
     parts.push(ft[best] >= 0 ? `(${FACTION_TAG[best]}派会更信你)` : `(${FACTION_TAG[best]}派会记你一笔)`)
  return parts.join("，") + "。"
```

## B.3 `card.text`（题干）扩写：2–3 句带 stakes

**规则：** 保留现有 `text`（原题干）作第 1 句；追加 1–2 句「利害关系（stakes）」，从 `STAKES[category]` 短池取 1 条，保证每张卡都点明"不选好会怎样 / 选好能得到什么"。

```
card.text(最终) = 原text + (STAKES[category] ? " " + STAKES[category] : "")
```

**`STAKES[category]` 示例（部分）：**
- 入职："这一步怎么走，基本定了你前半年是透明人还是靶子。"
- 站队："站错一步，后面半年的资源都跟你无关。"
- 绩效："数字背后是明年的坑位和票仓。"
- 危机："这一晚兜不兜得住，决定你下周还在不在名单里。"
- 背锅："锅要么甩出去，要么焊死在自己背上。"
- （其余类目见 §B.5 词池表）

## B.4 60 大事件（M01..M60）text / title / flavor 精修示例

> 说明：以下给出 **M01–M10 的完整精修样例**（含按 §A.2 重排后的 4 选项 arch，确保铺满 2×2）；M11–M60 由工程按同规则确定性重排 arch + 套用 §B.3 的 `STAKES` 池扩写 `text`，**不逐张手改**（用户要求为"精修示例"而非全量重写）。`title`/`flavor` 在原有暗战语气上微调，不破坏人设。

### M01 第一周的入职培训（cat=入职）
- text（精修）：HR 把一摞塑封手册拍在你桌上：工牌、保密协议、报销流程。讲师念到「末位淘汰」时，全屋静了一秒。**这一步怎么走，基本定了你前半年是透明人还是靶子。**
- flavor（微调）：手册越厚，套得越紧；规矩记熟了，路才走得稳。
- 4 选项重排（c1..c4 = SP/SA/RP/RA）：
  - c1 `SP` arch=obey："老实记下每一条规矩"（稳消·守成）
  - c2 `SA` arch=ally："主动加讲师微信请教"（稳积·经营）
  - c3 `RP` arch=dodge："私下打探「末位淘汰」实情"（激消·险守，原 expose→dodge 暗中小动作）
  - c4 `RA` arch=invest："复盘时抢答露一手"（激积·搏进）

### M02 领导饭局上的递话（cat=站队）
- text（精修）：部门总请新人在小馆子吃饭，酒过三巡忽然说：「以后有想法，直接找我，别绕弯子。」桌下却有人踢了你一脚。**站错一步，后面半年的资源都跟你无关。**
- flavor：话是递给你，坑也是递给你。
- c1 `SP` arch=hedge："点头称是，不多嘴" / c2 `SA` arch=ally："顺杆爬认个门生" / c3 `RP` arch=obey："高调表忠心赌一把押注靠山"（原 expose→obey，归 RP）/ c4 `RA` arch=betray："当场表态跟总走"

### M03 午饭圈的隐形边界（cat=职场关系）
- text（精修）：前两周你跟着大部队去食堂，第三周发现他们聊天在你走近时总会降半拍。你端着餐盘站在原地。**这桌谁带你，决定了半年后谁在关键时刻挺你。**
- flavor：午饭桌是最小的派系地图。
- c1 `SP` arch=dodge："假装没察觉，照常去" / c2 `SA` arch=ally："带零食主动破冰" / c3 `RP` arch=hedge："远远观察不接话，暗记谁说了什么"（原 expose→hedge）/ c4 `RA` arch=invest："自己组个新人局"

### M04 家人问你进的是不是正经公司（cat=家庭）
- text（精修）：母亲在电话里说：「你爸老同事的儿子在国企，铁饭碗。你那公司，网上查不到几条好评。」**家里支不支持，决定了你扛不扛得住前两年的折腾。**
- flavor：最朴素的考核，来自没上过班的亲人。
- c1 `SP` arch=obey："报喜不报忧，含糊带过" / c2 `SA` arch=ally："借题要家里支持" / c3 `RP` arch=self："半真半假留后路，防被念"（原 expose→self）/ c4 `RA` arch=invest："立上进人设换自主权"

### M05–M10（规则同，仅列重排要点）
- M05（客户）：c1 SP obey 按流程稳推 / c2 SA ally 多跑两趟混脸熟 / c3 RP dodge 保守承诺暗留余地 / c4 RA invest 让利抢单
- M06（审计）：c1 SP hedge 全交材料不解释 / c2 SA shield 补正说明护团队 / c3 RP self 先认了再洗（原 expose→self）/ c4 RA betray 咬出前任
- M07（绩效）：c1 SP obey 接受结果 / c2 SA grind 请教改进点踏实补 / c3 RP dodge 低调收尾暗留痕（原 expose→dodge）/ c4 RA invest 甩数据争优
- M08（危机）：c1 SP shield 先保交付 / c2 SA ally 拉人共担 / c3 RP self 连夜兜底暗自扛（原 expose→self）/ c4 RA risk 先斩后奏
- M09（调动）：c1 SP hedge 按兵不动 / c2 SA ally 表忠留任攒信任 / c3 RP obey 装不知暗观风向（原 expose→obey）/ c4 RA invest 主动请缨
- M10（裁员）：c1 SP dodge 装不知道 / c2 SA shield 多接核心活护身 / c3 RP self 低调熬暗留退路（原 expose→self）/ c4 RA risk 联络猎头

> M11–M60：工程按 `POS_QUADRANT` 与 `POOL`（§A.2.2）对每个 `cat` 取 `CAT_LABELS[cat]` 的 left/right 短语填入对应 SP/SA/RP/RA，`text` 套 `STAKES[cat]`，`title`/`flavor` 保留原暗战语气。所有 60 张经同一 seed 确定性生成，`web==docs` 一致。

## B.5 模板词池总表（engineering-lead 落地硬口径 · 数据全量）

### B.5.1 QUAD_FRAME（4 条，固定）
| quadrant | frame |
|------|------|
| stable_passive | 你选择蛰伏守成 |
| stable_active | 你选择稳健经营 |
| risky_passive | 你选择险中求稳 |
| risky_active | 你选择放手一搏 |

### B.5.2 CAT_CONTEXT（每类目 1 条场景 clause，用于 desc 拼接）
> 直接复用 `gen_campaign.js` 的 `CAT_LABELS` key；下列 `context` 为该类的"具体对象"短句。

| 类目 | CAT_CONTEXT | 类目 | CAT_CONTEXT |
|------|------|------|------|
| 入职 | 把入职流程走顺，不抢风头 | 职场关系 | 在午饭圈与工位边摸清水面下的边界 |
| 站队 | 在明暗两路里挑一条跟 | 家庭 | 在亲人关切和现实之间找平衡 |
| 客户 | 在单子和口碑之间做取舍 | 审计 | 在材料与口径之间周旋 |
| 绩效 | 在分数和坑位之间博弈 | 危机 | 在爆雷前把火按下去 |
| 调动 | 在留任与挪窝之间观望 | 裁员 | 在名单边缘给自己加权重 |
| 空降 | 在新老势力夹缝里找位置 | 并购 | 在整合浪潮里押注或自保 |
| 年终奖 | 在签字和争抢之间拿捏 | 出差 | 在驻点和家里之间两头顾 |
| 反腐 | 在清白和牵连之间划界 | 背锅 | 在甩锅与扛锅之间决断 |
| 挖角 | 在忠诚和身价之间衡量 | 团建 | 在合群和出头之间拿捏 |
| 向上管理 | 在顶撞和顺从之间找缝 | 投诉 | 在回应和冷处理之间选择 |
| 供应链 | 在交付和产能之间调度 | 述职 | 在讲完和抢镜之间取舍 |
| 借调 | 在历练和归处之间盘算 | 师徒 | 在体面和独立之间周旋 |
| 离职 | 在体面走和留遗产之间选 | 审批 | 在等批和硬推之间施压 |
| 数据 | 在口径和真相之间站队 | 饭局 | 在敬酒和套话之间游走 |
| 举报 | 在揭发和自保之间抉择 | 期权 | 在行权与观望之间下注 |
| 瓶颈 | 在熬和冲之间找突破口 | 竞品 | 在守价和应战之间布防 |
| 汇报 | 在试错和押注之间申报 | 舆情 | 在沉默和回应之间控场 |
| 请假 | 在硬请和忍着之间权衡 | 偶遇 | 在寒暄和套口风之间应变 |
| 失误 | 在认错和甩锅之间补救 | 群聊 | 在撤回和搅局之间收场 |
| 加班 | 在硬扛和揽活之间取舍 | 八卦 | 在听和传之间留个心眼 |
| 送礼 | 在随流和谋利之间拿捏 | 误会 | 在解释和对质之间了断 |
| 聚餐 | 在坐和撑场之间选位 | 邮件 | 在降温和回击之间落笔 |
| 批评 | 在认了和辩白之间收尾 | 生日 | 在低调和拉拢之间张罗 |
| 培训 | 在坐完和抢镜之间取舍 | 投票 | 在跟票和换人情之间盘算 |
| 对账 | 在挂账和硬查之间平账 | 系统 | 在摸索和催急之间提效 |
| 体检 | 在硬扛和养身之间妥协 | 报销 | 在重贴和施压之间拿回 |
| 表扬 | 在谦逊和邀功之间张弛 | 表白 | 在拒绝和回应之间留余地 |
| 饭局2 | 在配合和挑大梁之间掌勺 | — | — |

### B.5.3 STAKES（每类目 1 条利害关系句，用于 card.text 扩写；取上表部分 + 通用兜底）
| 类目 | STAKES |
|------|------|
| 入职 | 这一步怎么走，基本定了你前半年是透明人还是靶子。 |
| 站队 | 站错一步，后面半年的资源都跟你无关。 |
| 职场关系 | 这桌谁带你，决定了半年后谁在关键时刻挺你。 |
| 家庭 | 家里支不支持，决定了你扛不扛得住前两年的折腾。 |
| 客户 | 这一单成不成，是你下季度话语权的底色。 |
| 审计 | 口径差一个字，锅就可能焊别人或自己身上。 |
| 绩效 | 数字背后是明年的坑位和票仓。 |
| 危机 | 这一晚兜不兜得住，决定你下周还在不在名单里。 |
| 调动 | 挪不挪，决定了你接下来贴的是谁的进度表。 |
| 裁员 | 这一轮活下来，才有资格谈下一轮。 |
| 空降 | 新老板来路不明，你头三个月站位是生死线。 |
| 并购 | 整合一旦落定，旧账新仇一起算。 |
| 年终奖 | 这一笔拿多少，写明了你在老板心里的排位。 |
| 出差 | 驻点表现，直接换算成回不回得去的筹码。 |
| 反腐 | 风头过了，被记的账不会自己消。 |
| 背锅 | 锅要么甩出去，要么焊死在自己背上。 |
| 挖角 | 这份 offer 是跳板还是陷阱，三个月后见分晓。 |
| 团建 | 合不合群，决定了有事时有没有人替你挡一句。 |
| 向上管理 | 顶一句和顺一句，差的是半年的信任余额。 |
| 投诉 | 回不回应，决定了这件事是过去还是被放大。 |
| 供应链 | 产能卡不卡脖子，看这一环谁说了算。 |
| 述职 | 讲没讲到位，决定了明年预算往谁那边倾斜。 |
| 借调 | 借出去容易，调回来难。 |
| 师徒 | 这层情分，是护身符也是枷锁。 |
| 离职 | 走得体不体面，决定了行业里还有没有人接你电话。 |
| 审批 | 卡一天，项目就慢一周，账算在谁头上。 |
| 数据 | 口径谁定，谁就掌握了叙事权。 |
| 饭局 | 酒桌上的每句闲话，都是明天的筹码。 |
| 举报 | 实名一出，就没有中间地带了。 |
| 期权 | 行权窗口一关，纸面富贵就成过眼云烟。 |
| 瓶颈 | 熬还是冲，决定了你是被沉淀还是被看见。 |
| 竞品 | 这一仗防守还是进攻，定了份额的走向。 |
| 汇报 | 报多大，决定了后面要交多大的账。 |
| 舆情 | 控不控得住，决定了事件是翻篇还是上热搜。 |
| 请假 | 请不请得动，照见你在组织里的分量。 |
| 偶遇 | 这一句寒暄，可能是情报也可能是埋雷。 |
| 失误 | 补不补得圆，决定了这是事故还是污点。 |
| 群聊 | 一句话发出去，就收不回语境了。 |
| 加班 | 揽不揽得动，决定了功劳簿上写谁的名。 |
| 八卦 | 听进去了，就等于站了队。 |
| 送礼 | 礼轻重之间，是人情也是把柄。 |
| 误会 | 解释不解释，决定了裂痕是缝上还是撕开。 |
| 聚餐 | 坐哪、走没走，别人都看在眼里。 |
| 邮件 | 落笔即留痕，措辞就是立场。 |
| 批评 | 认不认得巧，决定了印象是翻篇还是记账。 |
| 生日 | 谁到谁不到，是一张现成的站队表。 |
| 培训 | 抢不抢得着镜，决定了你被看见几次。 |
| 投票 | 这一票换的，不止是人情。 |
| 对账 | 账平不平，藏着谁动过手。 |
| 系统 | 卡不卡得住，暴露的是流程还是人。 |
| 体检 | 身体亮不亮灯，决定了你能熬几个夜。 |
| 报销 | 核不核得回，写明了规矩对谁松。 |
| 表扬 | 邀不邀得功，决定了下次资源往哪流。 |
| 表白 | 应不应对，改的是两人也改的是局。 |
| 饭局2 | 掌不掌得住勺，决定了这桌听谁的。 |
| （兜底 GENERIC） | 这一步怎么选，后面都有人记着。 |

---

# C. 交互规格

## C.1 2×2 网格布局建议（四象限方位）

```
            纵轴 ↑ 积极（扩张 / 联结）
   ┌─────────────────┬─────────────────┐
   │  左上 ② SA       │  右上 ④ RA       │
   │  稳积 · 经营      │  激积 · 搏进      │
   │  (键盘 1)        │  (键盘 2)        │
   ├─────────────────┼─────────────────┤
   │  左下 ① SP       │  右下 ③ RP       │
   │  稳消 · 守成      │  激消 · 险守      │
   │  (键盘 3)        │  (键盘 4)        │
   └─────────────────┴─────────────────┘
            横轴 → 激进（高风险）    ← 稳妥（低风险）
```
- 方位固定：X 左=稳妥 / 右=激进；Y 下=消极 / 上=积极。SA 在左上、RA 在右上、SP 在左下、RP 在右下（标准笛卡尔阅读位）。
- 每格：象限名（2 字）+ `label`（按钮主文案）+ `desc`（1–2 句小白话）+ `consequence`（后果预览，灰字）+ 5 维 Δ 微标（沿用 reigns_layer §7.2 的 eff 摘要样式，但只高亮 top-2 维以免过载）。

## C.2 操作：点击 + 键盘 1–4（移动端点按）

| 操作 | 映射 | 说明 |
|------|------|------|
| 鼠标点击 | 点对应格 | 桌面 / 移动通用 |
| 键盘 `1` | 左上 SA（稳积） | 数字小键盘位 = 网格阅读序 |
| 键盘 `2` | 右上 RA（激积） | |
| 键盘 `3` | 左下 SP（稳消） | |
| 键盘 `4` | 右下 RP（激消） | |
| 键盘 `←/→` 或 `A/D` | （过渡期兼容）左=稳妥侧优先 / 右=激进侧优先；最终建议仅保留 1–4 | 兼容旧 reigns_layer §7.2 |
| 数字 `5–9` / 展开键 | 展开 `choices[]` 全部原始选项（含 >4 的余项） | 无障碍进阶入口，沿用 reigns_layer §7.4 |
| 移动端 | 2×2 网格点按，每格触控区 ≥ 44×44pt | swipe 手势**废弃**（被网格点击取代） |

> 选择后播放 ≤120ms 过场（克制流畅，具体动效由 art-director 定），再跑 §C.4 的触边检查；若触发危机 → 弹出层覆盖（沿用 reigns_layer §7.3）。

## C.3 轴标签文案（固定，横纵两端）

| 轴 | 端 | 文案 | 设计意图 |
|------|------|------|------|
| 横轴 X | 左端（稳妥） | **「稳妥 · 不冒险」** | 低风险、低波动、慢即是稳 |
| 横轴 X | 右端（激进） | **「激进 · 敢搏」** | 高风险、大波动、赢了上位 |
| 纵轴 Y | 下端（消极） | **「消极 · 收缩自保」** | 回避、守住、不扩张 |
| 纵轴 Y | 上端（积极） | **「积极 · 扩张联结」** | 进攻、立功、攒人脉 |

- 文案固定不随类目变化，保证玩家"轴语义"形成肌肉记忆（认知减负，避免每卡重新理解轴）。
- 高对比 / 无障碍模式：去色依赖，轴端加 ▲/▼/◀/▶ 箭头 + 文字（沿用 reigns_layer §7.4）。

## C.4 与既有四表盘 / 8 危机 / 派系信任的兼容性说明

**核心结论：四象限是「left/right 二选一」的超集，结算链路完全复用，零新增数值逻辑。**

| 既有系统 | 兼容性 | 说明 |
|------|------|------|
| 四表盘（业绩/人脉/声望/精力） | ✅ 完全复用 | 选定任一象限后，照常结算该 choice 的 `player{performance,network,influence,stress→energy,cash}`；四表盘 HUD（reigns_layer §7.1）不变。 |
| 8 触边危机 | ✅ 完全复用 | 选格后跑同一 `check_edges`（reigns_layer §5.1）：致命（业绩=0 / 精力=0）终局，其余 6 边软重置。四象限不改变任何触边阈值。 |
| 派系信任 FV_A..D | ✅ 完全复用 | 每 choice 仍带 `faction_trust{FV_A..FV_D}`；选格即应用对应派系 Δ。四象限方位与派系无强制绑定（仅 §A.1 可选染色）。 |
| 联席会议投票 ↔ 四表盘 | ✅ 不变 | reigns_layer §6.1/§6.2 的投票威胁公式仍消费 `performance/network`，与交互形态无关。 |
| 精力低「失态/强制选左」 | ⚠️ 需重映射 | 旧规则"stress 高强制选 left（稳妥）"在四象限下改为"stress 高时强制把 RP/RA 两激进格置灰/降权，玩家只能在 SP/SA 两稳妥格中选"（语义等价：过劳只能求稳，不能搏）。见 §D.2 风险 4。 |
| 现金（独立货币） | ✅ 不变 | `cash` 不参与触边，危机扣罚仍走 `cash`（reigns_layer §6.5）。 |

---

# D. 设计评审（四象限机制自洽性 + 风险缓解）

## D.1 自洽性结论

- **与四表盘 / 危机 / 派系自洽**：四象限只改变了"玩家如何选"（从 2 选项到 4 选项全展示），不改变"选完发生什么"（5 维 Δ + 派系 Δ + 触边检查全复用）。机制层零耦合风险。
- **与既有设计支柱自洽**：继承 reigns_layer「代价当场可见」「四根线撑住才轮到推理」；新增纵轴让"进/退"成为显式维度，强化而非削弱"再撑一回合"张力。
- **确定性 / 可复现自洽**：desc/consequence/text 全部由 `CAT_LABELS` + `STAKES` + `QUAD_FRAME` + `Δ→文案表` 确定性组合，`web==docs` 字节一致机制不变。

## D.2 风险点与缓解（含与 reigns_layer 的冲突，待主理人拍板）

1. **【高】与 `reigns_layer.md` §4 / §7.2 冲突（left/right 滑动被取代）**
   - 现象：本稿用 2×2 网格替换王权式左右滑；`card.reigns={left,right}` 改为 `card.quadrants={sp,sa,rp,ra}`。
   - 缓解：主理人拍板后，程基岩需①改 `gen_campaign.js` 的 `autoMinorChoices`/`build()` 与断言；②在 `reigns_layer.md` 相应章节加"已废弃，见 quadrant-system.md"标注；③过渡期可保留 `reigns` 兼容字段，最终删除。**本稿为取代性增补，非叠加。**
2. **【中】minors 重生成会改写原有 240 张数值**
   - 现象：旧 `autoMinorChoices` 的 arch 池被替换（解耦 side/arch），240 张小事件 `player`/`faction_trust` 数值会变。
   - 缓解：新池沿用 `genPlayer` 既有 left/right 幅度区间，整体分布应接近原基线；重跑 `quality_sim.js` / `coverage_check.js` / balance.md 蒙特卡洛校准，确认单选项 `|Δ|≤10`、四表盘和 `≤25`、五维保底、牌内零帕累托支配仍全绿（沿用 reigns_layer §3.3 步骤 E 不变式）。
3. **【中】MAJORS/RANDOMS 重排 arch 改变 60+72 张数值**
   - 现象：为铺满 2×2，部分大事件 c3/c4 的 arch 被换成被动池（如 M01c4 expose→dodge），数值随之微调；`lean`（派系偏向）保留不改。
   - 缓解：派系基线（FACTION_TAG 分布）不受影响；仅数值幅度微调。重跑 §D.2-2 的校验即可。
4. **【中】精力低「失态 / 强制选左」规则需重映射**
   - 现象：reigns_layer §6.4 旧规则"stress 高强制选 left"在四象限下无对应单键。
   - 缓解：改为 `energy≤25` 时 RP/RA 两激进格**置灰 + 视觉红噪点增强**（玩家只能选 SP/SA 稳妥格），语义等价于"过劳只能求稳"。具体置灰/降权由 art-director 与 engineering 在 UI 层实现；**不**改 engine 数值逻辑。
5. **【中】认知过载（信息密度上升）**
   - 现象：4 选项 + 5 维 Δ + 四表盘 + 派系，比原 2 选项更密。
   - 缓解：①`consequence` 只显示 top-2 维；②`desc` 白话 1–2 句；③轴标签固定不变；④动画克制（用户决策 3）；⑤网格方位固定形成肌肉记忆。符合"每卡代价当场可见"支柱，不引入隐藏数值。
6. **【高】主导策略风险：RA（激×积）可能恒优于其他象限**
   - 现象：`risky_active` 高回报高 stress，若数值上 RA 期望收益碾压 SP/SA/RP，会退化成"永远点右上"的主导策略（违反设计理论红线）。
   - 缓解：①靠四表盘绞索制衡——RA 高 stress 推高精力崩溃（致命）风险，高 influence 触发声望=100 软重置；②生成器保证每卡 SP（稳消）为五维 `|Δ|≤2` 保底项（沿用 hedge/obey 低幅），永远有"稳妥退路"；③重跑平衡扫描，标记"象限期望收益碾压"（任一象限 avg score 超过其余 ≥15%）为异常，回调节点（优先 `ENERGY_DRIFT_PER_DAY`、RA 的 stress 幅度）。
7. **【低】`web==docs` 一致性**
   - 现象：新增 `quadrant/desc/consequence` 字段若双端写出逻辑不一致会破坏字节一致。
   - 缓解：仍由 `gen_campaign.js` 同一份 `out` 写 `web/cards.js` 与 `docs/cards.js`，机制不变；CI 加 `diff` 校验（沿用既有 `verify_sync.py`）。
8. **【低】移动端触控**
   - 现象：2×2 网格在窄屏可能挤压。
   - 缓解：每格触控区 ≥44×44pt；轴标签可横排转竖向（reigns_layer §7.1 已处理四表盘竖排）；`navigator.vibrate` 反馈（沿用 §7.3）。

> 待主理人拍板：风险 1（取代 reigns_layer 滑动）、风险 4（失态重映射）、风险 6（RA 主导策略校准阈值）。其余由程基岩按本稿落地。

---

# 硬口径速查（engineering-lead 直接落地用）

> 本节把"映射规则 + 字段 schema + 模板词池"三块单列，工程可照抄实现，无需回看正文。

## 硬口径 1 · 选项→象限 映射规则（含坑修复）

```js
// 1) 规范位置顺序（生成器须按此序产出 choices[]）
const POS_QUADRANT = ["stable_passive","stable_active","risky_passive","risky_active"];
// 索引 0=SP(稳消) 1=SA(稳积) 2=RP(激消) 3=RA(激积)

// 2) 纵轴姿态集合（消极=收缩自保 / 积极=扩张联结）
const PASSIVE = new Set(["hedge","dodge","obey","self","bow","cashin"]);
const ACTIVE  = new Set(["ally","shield","leak","grind","invest","betray","expose","risk"]);

// 3) 每象限生成池（side 与 arch 解耦，修复旧 2×left(passive)+2×right(active) 填不满坑）
function poolFor(q){
  switch(q){
    case "stable_passive": return { side:"left",  arch: pick(PASSIVE) };                 // 稳×消
    case "stable_active":  return { side:"left",  arch: pick(["ally","shield","leak","grind"]) }; // 稳×积
    case "risky_passive":  return { side:"right", arch: pick(PASSIVE) };                 // 激×消（高风险自保）
    case "risky_active":   return { side:"right", arch: pick(["invest","betray","expose","risk"]) }; // 激×积
  }
}

// 4) 生成每张卡：4 选项按位置取池 → 保证铺满 2×2
function buildCardQuadrants(card){
  const ids = card.choices.map(c=>c.id);
  const out = {};
  POS_QUADRANT.forEach((q,i)=>{
    const ch = card.choices[i];
    const { side, arch } = poolFor(q);
    ch.side = side; ch.arch = arch;            // 数值按新 (side,arch) 重跑 genPlayer
    ch.quadrant = q;
    out[{stable_passive:"sp",stable_active:"sa",risky_passive:"rp",risky_active:"ra"}[q]] = ch.id;
  });
  card.quadrants = out;                         // 取代 card.reigns
  // 校验：必须 4 象限齐全
  if (new Set(card.choices.slice(0,4).map(c=>c.quadrant)).size !== 4)
    throw new Error(card.id + " 未铺满 2×2 象限");
  return card;
}
```

## 硬口径 2 · 字段 schema（choice 与 card 级）

```
choice = {
  id, label, arch,
  side: "left" | "right",                         // 【补回】横轴
  quadrant: "stable_passive"|"stable_active"|"risky_passive"|"risky_active", // 【新增】
  player: { influence, stress, cash, performance, network },
  faction_trust: { FV_A, FV_B, FV_C, FV_D },
  tags: string[],
  desc: string,          // 【新增】QUAD_FRAME + label + CAT_CONTEXT
  consequence: string,   // 【新增】Δ→文案 top-2 + 派系附注
}
card.quadrants = { sp:<id>, sa:<id>, rp:<id>, ra:<id> }   // 【新增，取代 reigns】
```

## 硬口径 3 · 模板词池（desc / consequence / text）

```js
// —— desc：QUAD_FRAME[c.quadrant] + "：" + label + (CAT_CONTEXT[cat] ? "，"+ctx : "") + "。"
const QUAD_FRAME = {
  stable_passive:"你选择蛰伏守成", stable_active:"你选择稳健经营",
  risky_passive:"你选择险中求稳",  risky_active:"你选择放手一搏",
};
// CAT_CONTEXT / STAKES：见 §B.5.2 / §B.5.3 全量表（按 cat key 索引，复用 gen_campaign.js 的 CAT_LABELS key）

// —— consequence：Δ→文案（取 |Δ|>=2 前 2 强维 + 派系附注）
const TXT = {
  performance: d => d>=3?"业绩有望往上走":d>=1?"业绩小幅提振":d<=-3?"业绩明显吃紧":"业绩略承压",
  network:     d => d>=3?"人脉更活络":d>=1?"人缘小好":d<=-3?"人脉受损":"人缘略凉",
  influence:   d => d>=3?"风评见涨":d>=1?"声望小升":d<=-3?"口碑受挫":"风评略损",
  energy:      d => d>=3?"能松一口气":d>=1?"压力略减":d<=-3?"压力陡增":"更累了些", // 入参 = -stress
  cash:        d => d>=3?"钱包回血":d>=1?"小有进账":d<=-3?"要自掏腰包":"小有贴补",
};
function describeConsequence(ch){
  const dims = [["performance",ch.player.performance],["network",ch.player.network],
                ["influence",ch.player.influence],["energy",-ch.player.stress],["cash",ch.player.cash]];
  const ranked = dims.filter(([k,v])=>Math.abs(v)>=2)
                     .sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
  const parts = ranked.slice(0,2).map(([k,v])=>TXT[k](v));
  const ft = ch.faction_trust;
  const best = Object.keys(ft).reduce((m,k)=>Math.abs(ft[k])>Math.abs(ft[m])?k:m,"FV_A");
  if (Math.abs(ft[best])>=3)
    parts.push(ft[best]>=0 ? `(${FACTION_TAG[best]}派会更信你)` : `(${FACTION_TAG[best]}派会记你一笔)`);
  return parts.join("，") + "。";
}

// —— text：原 text + " " + (STAKES[cat] || GENERIC_STAKES)
// GENERIC_STAKES = "这一步怎么选，后面都有人记着。"
```

---

*（本文为设计稿，未改动任何代码 / 数据文件。落地前依 §D.2 决策点与主理人确认，再交程基岩按「硬口径 1/2/3」实施；并同步修订 `reigns_layer.md` §4/§7.2 标注废弃。）*