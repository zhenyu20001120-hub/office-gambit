# 《职场营销博弈》Reigns 机制增补 · 系统设计文档（reigns_layer.md）

- 版本：v0.1（设计增补，待主理人拍板后交工程落地）
- 作者：文策渊（design-strategist）
- 配套文档：
  - `design/gdd/gdd-core.md`（核心 7 系统，本增补挂在系统①/④/⑥/⑦ 之上）
  - `design/gdd/balance.md`（`influence/stress/cash` 三资源经济基线，**本文不重复它**，只增补 Reigns 四表盘层）
  - 代码基准：`src/engine.py`、`src/cards_data.py`、`src/ai.py`、`config/tuning.json`、`web/game.js`、`web/index.html`
- 范围：网页优先 + 同步 Python（本文只出设计，不改任何代码文件）。
- 设计气质：中文职场、黑色幽默、可落地（字段命名与现有 engine 对齐）。

---

## 0. 设计支柱与关键映射速查

### 0.1 三条设计支柱（Reigns 层专用）

1. **「四根线撑住了，才轮得到你玩推理」**：四表盘是生存层，推理博弈（派系/忠诚/投票）是战略层。玩家必须先活过每一张卡的此消彼长，才有资格在 D3/D6/D9/D12 的联席会议上做局。
2. **「每卡二选一，代价当场可见」**：把每张 2–4 选项的情况牌收敛为「左（稳妥）/ 右（进取）」两个语义选项，所有 Δ 在选项上直接标注，杜绝隐藏数值。
3. **「表盘不是装饰，是绞索」**：任一表盘触边必触发专属危机；致命项直接终局，非致命项软重置回 50 并扣罚——制造「再撑一回合」的张力，而非无限堆高。

### 0.2 四表盘 × 现金 映射速查（与主理人锁定一致）

| 玩家可见表盘 | 底层 engine 字段 | 关系 | 范围 | 初始 | 触边后果类型 |
|------|------|------|------|------|------|
| 业绩 performance | **新增** `performance`（Actor 字段） | 全新 meter | 0–100 | 50 | 0=致命 / 100=软重置 |
| 人脉 network | **新增** `network`（Actor 字段） | 全新 meter | 0–100 | 50 | 0/100=软重置 |
| 声望 reputation | **复用** `influence` | key 不变 | 0–100 | 见 `INIT_RESOURCES` | 0/100=软重置（含慢性边缘化判定） |
| 精力 energy | **派生** `energy = 100 - stress` | 不新增存储，只换显示口径 | 0–100 | = 100 - 初始 stress | 0=致命（复用 stress=100 出局）/ 100=软重置 |
| 现金 cash | **保留** `cash` | 独立货币/预算，**不参与触边危机** | -30 ~ 300（万元） | 见 `INIT_RESOURCES` | 维持 balance.md（穿底审计仅在会议日） |

> 工程落地提示：`energy` 永不单独存储，UI 与判定一律用 `100 - stress` 派生；`performance`/`network` 是真正要新增进 `cards.json`、`Actor`、`cards_data` 归一化、`apply_choice`、`clamp_actor` 的字段。

---

## 1. 机制总览：Reigns 如何叠到 12 天推理博弈上

### 1.1 单卡 micro-loop（Reigns 节拍）

```
呈现一张情况牌 → 玩家在「左 / 右」两个语义选项中二选一（滑动/点击/方向键）
   └─ 所选选项的 5 维 Δ 即时结算：{influence, stress→energy, cash, performance, network}
→ 统一触边检查（玩家）：任一表盘到 0 或 100？
   ├─ 致命项（performance=0 或 energy=0）：直接终局
   └─ 软重置项：该表盘回 50 + 预算扣罚 + 2 天增益衰减
→ 继续（AI 角色仍按原逻辑在后台结算其自身选项，玩家不可见其选择细节）
```

### 1.2 12 天 macro-loop（与系统①完全一致，仅嵌入 Reigns 结算点）

| 阶段（系统①） | Reigns 层新增/复用行为 |
|------|------|
| `morning` 晨会 | 顶部四表盘 + 现金 pill 全量展示；临近阈值（≥80 或 ≤20）变红预警 |
| `day_cards` 白天 | 逐张走 1.1 的 micro-loop（每卡一次二选一） |
| `noon_talk` 午间密谈 | 不变 |
| `night` 夜间 | 不变；玩家精力低时「失态」概率按现有 stress_high 逻辑放大 |
| `settle` 日结 | **新增**：玩家精力自然微降（D7+ 每日 stress +1）；统一再跑一次触边检查（捕捉由自然衰减导致的触边）；现金/声望既有检定保留 |
| `assembly` 联席会议（D3/6/9/12） | **新增**：投票存活→业绩+声望奖励；被针对→声望/人脉扣减；投票威胁公式接入 performance/network（见 §6）；会后再跑一次触边检查 |

### 1.3 两层如何互相绞合

- **生存层（四表盘）约束战略层**：你想在联席会议上「指认对手」（高分博弈），但该选项通常 `stress↑ / influence↓`，推高你崩溃或被边缘化风险——你敢不敢搏，取决于表盘余量。
- **战略层（推理）反馈生存层**：投票胜利给 `performance+/influence+`，连败给 `influence-/network-`；人脉低让你在投票中被群起而攻（§6）。
- **张力来源**：单局 12 天 ×（2~3 卡/天）= 24~36 次二选一，每次都在四表盘上挪动；任何一根线逼近边缘都逼你选「稳妥」而非「进取」，但你越稳妥，推理博弈的主动权越弱——这就是「再撑一回合」的核心张力。

---

## 2. 四表盘规格

所有表盘范围统一 `[0,100]`，初始见 §8。高低两端语义如下（黑色幽默向，供危机文案与 UI 预警复用）：

| 表盘 | key | 高（→100）语义 | 低（→0）语义 | 触边类型 |
|------|-----|------|------|------|
| 业绩 | `performance` | 升职在望 / 年终锦鲤 / 标杆被架到火上烤 | **末位淘汰 / 优化名单预备役（致命）** | 0=致命；100=软重置 |
| 人脉 | `network` | 八面玲珑 / 左右逢源 / 但被排除在核心圈外 | 孤家寡人 / 工位孤岛（没人 @ 你） | 0/100=软重置 |
| 声望 | `influence`（显示名=声望） | 众望所归 / 被推上员工代表火刑柱 | 透明人 / 边缘化（含慢性判定） | 0/100=软重置 |
| 精力 | `energy = 100 - stress` | 游刃有余 / 但「准时下班」被记为状态存疑 | **过劳崩溃 / 长期病假（致命，复用 stress=100）** | 0=致命；100=软重置 |

### 2.1 派生与边界约定

- `energy` 永不存储：`UI_fill_width = energy% = (100 - stress)%`；判定一律比较 `stress`。
- 触边阈值严格 `== 0` 或 `== 100`（clamp 后命中）。自然衰减/选项的 overshoot 在 clamp 后即视为触边。
- 四表盘对 AI 角色**同样持有**（批量增补后其选项也含 perf/net Δ），但 **AI 不触发触边危机/出局**——Reigns 是玩家体验层。AI 的 perf/net 仅用于投票威胁计算与「拟真」，其出局规则维持 `influence/stress` 原逻辑不变。

---

## 3. 卡牌数据 schema 增补（批量补 performance / network）

### 3.1 新增字段落点（与现有数据契约对齐）

现有 `cards.json` 每选项结构（`cards_data.py` 归一化后消费的是 `ch["player"]`）：

```
choices[].effects.player.{ influence, stress, cash }   ← 现有
choices[].effects.player.performance                   ← 新增（整数，范围 -10..10）
choices[].effects.player.network                       ← 新增（整数，范围 -10..10）
choices[].effects.faction_trust.{FV_A..FV_D}          ← 现有，不变
choices[].arch                                          ← 现有（用于 §4 收敛与批量映射）
```

> `cards_data.py` 归一化处（`norm["choices"].append` 内）需把 `performance`/`network` 一并 int 化进 `player` dict（工程改动，本文只描述规格）。
> `Actor` 新增 `performance=50.0`、`network=50.0`；`clamp_actor` 增加二者 `[0,100]` clamp；`_init_actor_resources` 给 AI 加 `±10` 随机（玩家按 tier 基准 + difficulty offset，详见 §8）。

### 3.2 单选项取值约定（与 balance.md §1.3 对齐，不另起炉灶）

| 约束 | 值 | 说明 |
|------|-----|------|
| 单选项·单表盘 `|Δ|` 上限 | **≤ 10** | 对齐现有 influence/stress/cash 的「极」档（balance.md §1.3），避免 perf/net 喧宾夺主；用户建议的 ≤20 作为绝对硬上限保留为异常哨兵 |
| 单选项·四表盘 `|Δ|` 代数和 | **≤ 25** | 指 `|Δperformance|+|Δnetwork|+|Δinfluence|+|Δstress|` 之和（energy 由 stress 派生，不重复计）；超出则在批量脚本内按比例缩放 |
| 保底选项 | 每卡 ≥1 个五维 `|Δ| ≤ 2` | 在 balance.md 既有「三资源保底」上**扩展为五维保底**，保证永远有「稳妥」可滑 |
| 牌内帕累托支配 | 0 | 在现有三资源支配检测上**扩展到五维**（见 3.4） |

### 3.3 为现有 256 张卡批量补字段的可执行方案（规则化默认映射，非逐张手写）

核心思路：**以 `arch`（行为原型）为主映射，以 `category`（情境）为辅修正，以 `tier` 做幅度缩放**——全部确定性、可复现、diff 可控。

**步骤 A：基础映射表 `BASE[arch] → (performance, network)`**

| arch | performance | network | 设计理由（黑色幽默） |
|------|------|------|------|
| `grind` 硬扛硬做 | +3 | −2 | 出活但得罪人 |
| `obey` 服从上意 | +1 | +2 | 上级满意，关系稳 |
| `ally` 结盟交换 | 0 | +4 | 纯攒人情 |
| `betray` 背刺踩人 | +3 | −4 | 上位必树敌 |
| `expose` 揭发摊牌 | +2 | −3 | 揭黑料，人缘崩 |
| `self` 自保推责 | −2 | −1 | 缩起来，两头不讨好 |
| `hedge` 观望模糊 | −1 | +1 | 和稀泥，不得罪也不立功 |
| `dodge` 走流程回避 | −2 | 0 | 公事公办，零社交 |
| `invest` 花钱办事 | +3 | 0 | 撒钱换结果（cash 已 −） |
| `risk` 赌一把 | +5 | −1 | 搏大成，关系冒险 |
| `shield` 护人担责 | −1 | +3 | 背锅护人，攒义气 |
| `leak` 放话泄底 | −2 | +2 | 透风给谁都不得罪，混个脸熟 |
| `bow` 服软道歉 | −1 | +3 | 低头保平安 |
| `cashin` 落袋变现 | −1 | −2 | 捞完就走，人走茶凉 |

**步骤 B：情境修正 `CAT_MOD[category]`（加到上述基础值，幅度 ±1~2）**

- 偏「业绩」类（绩效/汇报/晋升/客户/竞品）：`performance +1`
- 偏「人脉」类（团建/站队/反腐/舆情/会议/背锅）：`network +1`；其中「背锅」额外 `network −1`（背了锅人缘差）

**步骤 C：tier 缩放 `TIER_SCALE`**（对齐现有 `TIER_MODS` 的 influence_gain 思路）

- `employee` ×0.8、`mid` ×1.0、`senior` ×1.2（取整、clamp 到 [−10,10]）

**步骤 D：确定性伪代码（工程按此实现批量脚本，复用现有 `_build_cards` 思路）**

```
for card in cards:
  for ch in card.choices:
    bp, bn = BASE[ch.arch]
    bp += CAT_MOD.get(card.category, {}).get("perf", 0)
    bn += CAT_MOD.get(card.category, {}).get("net", 0)
    s  = TIER_SCALE[card.tier]
    ch.effects.player.performance = clamp(round(bp * s), -10, 10)
    ch.effects.player.network     = clamp(round(bn * s), -10, 10)
  # 保底保证（五维）
  ensure_safe_option(card)        # 若无五维全 ≤2 的选项，把最「hedge/dodge」项的 perf/net 置 0 并微调
  # 牌内帕累托支配检测（五维）
  resolve_pareto_dominance(card)  # 若新Axis造成支配，将该选项 perf/net 各 −1 直至无支配
  # 左右收敛（见 §4）
  card.reigns = reigns_pick(card)
```

**步骤 E：既有不变量保全校验**（脚本跑完必须全绿，否则报错）

- 牌数 256 / 选项 1024 / id 唯一 / 文案唯一 —— 不变。
- 五维保底覆盖 100%（原三维保底仍成立，新增两维在 safe 选项上 ≤2）。
- 牌内五维零帕累托支配。
- `faction_trust` 四家累计和偏差 ≤8% —— **不受影响**（perf/net 不写 faction_trust）。
- 单选项四表盘 `|Δ|` 和 ≤25 的全库占比 ≥99%；极端（和 >25）标记人工复核。

### 3.4 与现有平衡扫描的衔接

`balance.md` §4.3.2 的静态扫描脚本需扩展：期望收益公式 `score` 增加 `performance`、`network` 两项的等价折算（建议 `Δperformance*0.8 + Δnetwork*0.8`），其余（离群标记、保底覆盖、category 均衡、faction_trust 平衡、文案去重）原样保留。

---

## 4. 左右二选一映射（2–4 选项收敛为「左 / 右」）

> ⚠️ **本节已被 `quadrant-system.md` 的「四象限决策网格」方案取代**（主理人已拍板）。** `card.reigns={left,right}` 已废弃，改为 `card.quadrants={sp,sa,rp,ra}`；王权式左右滑卡改为 2×2 网格（点击 + 键盘 1–4）。** 下方 left/right 收敛规则仅作历史参考，落地以 quadrant-system.md 为准。

### 4.1 收敛规则（确定性、可复现）

**主规则 · 立场轴（arch-pole）**：把每个选项按 `arch` 归入「稳妥 / 进取」两极。

| 极 | arch 集合 | 语义 |
|------|------|------|
| **左（稳妥）** | `obey, hedge, dodge, shield, bow, self` | 明哲保身、护人、服从、回避 |
| **右（进取）** | `grind, betray, expose, risk, invest, cashin, leak` | 硬来、背刺、揭发、赌博、撒钱、透底 |

收敛算法（`reigns_pick(card)`，脚本预计算并戳 `card.reigns={left,right}`，web/py 共用，杜绝双端分歧）：

```
LEFT  = [ch for ch in choices if arch_pole(ch.arch) == 左]
RIGHT = [ch for ch in choices if arch_pole(ch.arch) == 右]

def boldness(ch):   # 决胜/兜底用：越大越「搏」
    return AGG_WEIGHT[ch.arch] + 0.3*sum(abs(d) for d in ch.player.values()) \
           + 0.2*max(ch.faction_trust.values())

left_choice  = argmin boldness(LEFT)   if LEFT  else argmin boldness(choices)
right_choice = argmax boldness(RIGHT)  if RIGHT else argmax boldness(choices)
# 同极多选项时取「最稳妥/最进取」的代表；某极缺失时退化为全卡按 boldness 取 min/max
# 保证：若存在五维保底选项，优先让它成为 left（滑左永远有退路）
```

- **2 选项卡**：直接映射（通常一左一右，否则按 boldness 兜底）。
- **>2 选项卡**：按上表分组取代表；多选项同极时用 boldness 决胜，确保左右「有区分度」（左明显更稳、右明显更搏）。

### 4.2 显示文案规则（兼顾移动端滑动）

- 左半屏标题固定为 **「▷ 稳妥」**，右半屏 **「▷ 进取」**；若某卡左右皆同极，左标「保守」，右标「激进」。
- 每侧按钮 = 该选项 `label` 原文 + 下方一行 `choiceSummary` 扩增版（新增 `业绩± / 人脉±`）：

```
声望+3 精力-2 预算0 业绩+2 人脉-1
```

- 移动端：整卡为滑动热区，**左滑=左选项，右滑=右选项**；松手过半屏即确认，未过半回弹。桌面端：左/右大按钮 + **← / → 方向键（及 A / D）**；保留原 `1–6` 数字键作为「展开全部选项」的进阶入口（无障碍，见 §7）。
- `card.reigns` 预计算值即左右选项的 `choice.id`，UI 直接索引，无需运行时再算。

---

## 5. 触边危机事件表（四表盘 × 2 边 = 8 危机）

> 约定：致命项→直接终局（走系统⑥评级矩阵，附专属标题）；软重置项→该表盘回 50 + `cash −15`（万元，clamp 到 `CASH_FLOOR`）+ 该表盘 **2 天增益衰减 ×0.7**（防瞬间再触顶）。危机弹层为全屏黑色幽默短文 + 「继续」。

### 致命（2）

**① 业绩 = 0 ——《优化名单的预备役》**
你连续两季度垫底，HR 的「个人发展面谈」邀约已经躺在邮箱。你被请去「聊聊未来」，再没回来。
→ **直接终局**：评级 D，《优化名单第一行》变体；揭示页标注「死因：业绩触底被辞退」。

**⑦ 精力 = 0（= stress = 100）——《长期病假的起点》**
你在第 N 次凌晨的邮件里，把「收到」打成了「收尸」。医院比工位更懂你。
→ **直接终局**：复用现有 stress=100 崩溃出局；若当日派系目标已达成，评级 A-《功成，然后住院》。

### 软重置（6）

**② 业绩 = 100 ——《木秀于林表彰大会》**
你成了全集团「标杆」，于是所有难啃的活、背锅的坑、半夜的会都精准落在你头上。「优秀」变成了 KPI 牢笼。
→ 业绩→50，预算−15，业绩 2 天增益 ×0.7。

**③ 人脉 = 0 ——《工位孤岛》**
群里 @ 你 的只有系统通知；午饭没人喊你，团建名单漏了你。你成了组织图上的一块空白。
→ 人脉→50，预算−15，人脉 2 天增益 ×0.7。

**④ 人脉 = 100 ——《八面玲珑的反噬》**
你和所有人称兄道弟，于是所有人也都把你当「谁都聊得来的那个」——机密从不经过你。人脉满格＝被排除在核心圈外。
→ 人脉→50，预算−15。

**⑤ 声望 = 0 ——《透明人协议》**
晨会上你的发言被自动跳过，仿佛你是背景墙上的消防栓。没人反对你，也没人记得你。
→ 声望→50，预算−15；**并启动慢性判定**：声望 ≤15 连续 3 天 → 边缘化调岗出局（保留原「边缘化」失败精神，但改为慢 burn，不与单触边软重置冲突）。

**⑥ 声望 = 100 ——《众望所归的火刑柱》**
你被推上「员工代表」宝座，从此每个矛盾都先烧你。群众的眼睛雪亮，群众的锅也精准。
→ 声望→50，预算−15。

**⑧ 精力 = 100（= stress = 0）——《过于松弛的嫌疑》**
你连续准时下班，被主管在周报里记作「状态存疑」。躺平在职场是一种政治不正确。
→ 精力→50（即 stress→50），预算−15。

### 5.1 触边结算顺序与边界（工程必须实现）

```
check_edges(actor=player):
  # 1) 致命优先（一票否决，立即终局）
  if performance == 0: game_over(fatal="业绩触底")
  if stress == 100  (energy==0): game_over(fatal="精力崩溃")   # 复用 STRESS_BREAK
  # 2) 软重置（按 业绩>人脉>声望>精力 顺序，逐个回 50 + 扣罚）
  for meter in [performance, network, influence, stress]:
      if meter == 0 or meter == 100: soft_reset(meter)
  # 3) 软重置后再查一次（防扣罚/回弹引发二次触边），最多迭代 3 次，仍命中则按致命处理
```

边界情况：
- **单选项同时推爆两表盘**：致命优先；软重置逐个处理，每次独立扣 `cash −15`（可叠加）。
- **`cash` 已在 `CASH_FLOOR`**：扣罚 clamp，不二次触发审计（审计仅在会议日，见 balance.md）。
- **`performance`/`network` 单卡无法从 50 跳到 0/100**（受 ≤10/项、和 ≤25 约束），故触边只可能由「多卡累积 + 自然衰减」达成——符合张力设计。
- **声望=0 与旧 `influence≤0 连续2天` 规则的关系**：旧规则作废，改为本条「软重置 + 慢性 ≤15 连续3天」判定（决策点见 §9，默认采用新规则）。
- **玩家已在观察者模式（出局）**：不再触发 Reigns 危机（只旁观）。

---

## 6. 与现有玩法耦合（不另起炉灶，全部接 influence/stress/cash/faction_trust/vote）

### 6.1 联席会议投票 ↔ 四表盘

在 `phase_assembly` 结算后追加（仅对存活玩家）：

| 事件 | 规则 | 接哪个现有逻辑 |
|------|------|------|
| 投票存活（未被投出） | `performance += 5`，`influence += 5` | 复用 `state.player()`，写 `apply_choice` 同款 clamp |
| 玩家为「被指认」且存活 | `network -= 3`，`influence -= 3` | 接 `state.assembly["accused"]` |
| 玩家「自辩」成功（非最高票） | `network += 2` | 接 `SPEECH_TEMPLATES.defend` |
| 连续 2 次联席会议被指认/近最高票 | `influence -= 5`，`network -= 3` | 新增 `player.accused_streak` 计数器 |

### 6.2 四表盘 → 投票威胁（改写 `ai.py` 的 `ai_vote_score` 威胁项）

现有威胁项：`threat = (target.influence/100)*tw*(1+agg)`。
**增补**（加在 `score` 上，复用现有 `target` 即被投者）：

```
threat += 0.4 * (target.performance / 100)        # 业绩好=威胁大
threat -= 0.3 * (target.network   / 100)          # 人脉广=有保护伞，威胁降
if target.is_player and target.network < 20:       # 人脉低被群起而攻
    score += 0.5                                   # 接现有 player_focus_bias 同思路
```

> 数值旋钮建议外置 `tuning.json`：`VOTE_THREAT_PERF_W=0.4`、`VOTE_THREAT_NET_W=-0.3`、`LOW_NET_VOTE_BONUS=0.5`、`LOW_NET_THRESH=20`。

### 6.3 人脉低 ↔ 派系 AI 敌意（接 `ai.py` 的 trust/belief 更新）

- 当 `player.network < 20`：在 `update_belief_trust` 对所有观察者叠加强制衰减 `d_trust -= 2`（你「无根浮萍」，谁都懒得维持关系）。
- 同时 `player` 的 `belief[other]` 对自身 faction 的置信额外 −0.1（被视为靠山不稳）。
- 不新增系统，纯在现有 `d_trust` 公式后追加条件分支。

### 6.4 精力低 ↔ 当日可选选项减少（复用现有「失态」）

- `energy ≤ 25`（stress ≥ 75）时：复用 `DERIVED.stress_high=70` 的「失态」逻辑，并将替换概率从 `(stress-70)/100` **翻倍**（过劳更易手滑）。
- 因左右已收敛为 2 选项，「选项减少」具体表现为：失态时强制把你的选择替换为「左（稳妥）」代表（而非随机）——即过劳时你只能求稳，不能搏。
- 抽牌权重已接 `SituationMatch`（stress 高时加权 加班/团建），无需改动。

### 6.5 现金（独立货币）维持原样

`cash` 不参与任何触边危机；其价格表、买票、穿底审计全部沿用 balance.md，Reigns 层零改动。危机扣罚统一从 `cash` 扣（见 §5），但 `cash` 自身触底不触发 Reigns 危机。

---

## 7. UX 流程（工程组照做，移动端优先）

### 7.1 顶部四表盘 + 现金 pill（改造 `index.html` `#topbar`）

现有 `#topbar .bars` 含 3 个 `.bar-block`（声望/压力/预算）。改为：

```
#topbar
  .top-row: #day-label（第 N 天） + #cash-pill（预算 ¥X 万）   ← 现金从 bar 改为 pill
  .bars（四根 Reigns 条，横排/窄屏竖排）:
    业绩  [#bar-performance]  人脉  [#bar-network]
    声望  [#bar-influence ]  精力  [#bar-energy ]             ← energy 宽度=100-stress%
  #meta-line（派系目标/会议倒计时）
```

- 四表盘各带 `bar-fill`，颜色：业绩=金绿 `#3FA76A`、人脉=蓝 `#2E5FB2`、声望=红 `#B23A2E`、精力=青 `#2BA6A0`。
- **预警**：任意表盘 ≥80 或 ≤20 → 该条 `bar-fill` 加 `.warn`（橙闪）/ `.danger`（红闪）class；`#stress-overlay`（现有红噪点）在 `energy ≤ 25` 时强化显示。
- `#bar-energy` 显示值 = `100 - stress`；`#bar-influence` 显示名改为「声望」但 `id` 保留 `bar-influence`（不动 engine 字段）。

### 7.2 卡片呈现与三操作（改造 `#stage`）

> ⚠️ **本节已被 `quadrant-system.md` 取代**：`.reign-card` 左右滑卡改为 2×2 四象限网格（`.quad-card` / `.quad-cell`，键 1–4），见 quadrant-system.md §C。下方 `#reign-card` 结构仅作历史参考。

```
#reign-card（整卡，滑动热区）
  .reign-header: 类目图标 + 标题
  .reign-text: 情境文本
  .reign-left   ◀ 稳妥 : <label> + <eff 摘要>
  .reign-right  ▶ 进取 : <label> + <eff 摘要>
.swipe-hint（首卡教学：左右滑动/方向键）
```

- **操作 1 · 滑动**：touch/pointer 拖拽 `#reign-card`，位移过半屏 → 确认对应侧；回弹未过半。锁垂直滚动（`touch-action: none`）。
- **操作 2 · 点击**：左/右半区各一个透明大按钮；桌面端也可点 `#reign-left`/`#reign-right` 面板。
- **操作 3 · 方向键**：`←`/`A` = 左，`→`/`D` = 右；`1–6` = 展开全部原始选项（无障碍进阶，调用原 `card.choices`）。
- 选择后播放 120ms 过场，再跑 §5 触边检查；若触发危机 → 弹出层覆盖。

### 7.3 危机弹层 / 终局画面

- `#crisis-modal`（全屏遮罩）：黑色幽默短文（§5）+ 「继续」按钮；致命项按钮文案为「接受结局 ▶」，点后跳 `#end-screen`。
- `#end-screen`：在现有揭示页增加「死因/终局触发表盘」一行（来自 `state.result` 新增字段 `end_meter`）。
- 移动端：危机弹层 `navigator.vibrate([30,20,30])`（致命项加长）；所有按钮最小触控区 44×44pt。

### 7.4 可访问性（接 `design/accessibility-requirements.md`）

- 方向键/数字键全功能；`aria-label` 标注每侧选项的 5 维 Δ；高对比模式下去掉色依赖，改加 ▲/▼ 箭头与数值。
- 失态/危机不依赖纯颜色提示，必带文字。

---

## 8. 平衡性初调（初始值 / 衰减 / 增量尺度 / 阈值手感）

### 8.1 初始值

| 项 | 值 | 说明 |
|------|-----|------|
| `performance` 初始 | **50**（全员，玩家可按 difficulty offset ±0） | 中性起点，给两端留空间 |
| `network` 初始 | **50**（全员） | 同上 |
| 玩家 difficulty offset | easy `+3` / medium `0` / hard `−3`（perf & net） | 对齐现有 `player_start_offset` 思路，困难开局更挤 |
| AI 初始 | `50 ± 10`（round，±10% 个体随机） | 仅用于投票威胁拟真，不触危机 |

### 8.2 自然衰减（每日）

| 项 | 规则 | 旋钮（tuning.json） |
|------|------|------|
| 精力 energy | **D1–6：stress 不变（维持现有 −2 休息感）；D7–12：玩家 stress +1/天**（精力缓慢下探，营造后程 crunch） | `ENERGY_DRIFT_DAY=7`, `ENERGY_DRIFT_PER_DAY=1`（仅作用于玩家；AI 维持 balance.md 的 −2） |
| performance / network | **默认无自然衰减**（只由选项驱动，保留玩家主动权） | 可选 `REIGN_DRIFT=0`（关）；若开，仅向 50 轻微均值回归 ±1/天（Vision 层，MVP 关） |
| 现金 cash | 维持 balance.md（无自然变，依赖行动） | — |

> 设计理由：只对「精力」做后程微降，既回应主理人「精力可随天数微降」，又不破坏 balance.md 已调好的前中期节奏与 faction 平衡（AI 不掉精力，FV_D 平稳目标不受影响）。

### 8.3 单卡增量尺度（重申 §3.2）

- 单表盘 `|Δ| ≤ 10`，四表盘 `|Δ|` 和 `≤ 25`；极端（和 >25）占比 <5%，超则脚本拦截。
- 五维保底每卡必有一项（全 ≤2），保证「再撑一回合」永远有退路。

### 8.4 危机阈值手感目标

- 单局 12 天、约 24–36 次二选一，**健康玩家应常在 35–70 区间反复横跳**，偶尔逼近 20/80 预警，稀有触顶/触底。
- 致命（业绩=0 / 精力=0）目标发生率：easy <8%、medium ~15%、hard ~28%（由难度 offset + 自然衰减 + AI 针对共同决定）。
- 软重置（其余 6 边）目标：单局平均触发 1–2 次（制造「擦边过」的爽感，而非频繁打断）。
- 校准方法：复用 balance.md §4.3.2 的平衡扫描 + 蒙特卡洛（AI 代玩玩家位，200 局/配置），新增指标「玩家触边次数分布」「致命率」，偏离 §8.4 目标 ±10pct 即调参（优先旋钮：`ENERGY_DRIFT_PER_DAY`、`VOTE_THREAT_PERF_W`、`ASSEMBLY` 奖励值、perf/net 基础映射幅度）。

### 8.5 tuning.json 待补字段（一次性清单，工程照填）

```jsonc
"REIGN_METERS": {
  "performance": { "min": 0, "max": 100, "init": 50 },
  "network":     { "min": 0, "max": 100, "init": 50 }
},
"REIGN_SOFT_RESET": { "cash_penalty": 15, "debuff_days": 2, "debuff_gain_mult": 0.7 },
"ENERGY_DRIFT": { "start_day": 7, "stress_per_day": 1, "player_only": true },
"REIGN_VOTE": {
  "threat_perf_w": 0.4, "threat_net_w": -0.3,
  "low_net_threshold": 20, "low_net_vote_bonus": 0.5,
  "low_net_trust_decay": 2, "low_net_belief_penalty": 0.1
},
"ASSEMBLY_REWARD": { "survive_perf": 5, "survive_influence": 5,
  "accused_net": -3, "accused_influence": -3,
  "defend_net": 2, "accused_streak_influence": -5, "accused_streak_net": -3 },
"PLAYER_START_OFFSET_REIGN": { "easy": 3, "medium": 0, "hard": -3 }
```

---

## 9. 风险点与待主理人拍板

1. **声望=0 旧规则冲突（需拍板）**：原 `influence≤0 连续2天→边缘化出局` 与本条「声望=0 软重置回50」矛盾。本增补默认**作废旧规则、改采「软重置 + 慢性 ≤15 连续3天→边缘化」**（慢 burn，不与单触边冲突）。若主理人坚持保留原 2 天即出局，则声望=0 改为致命项——但那样声望与精力同为致命，四表盘致命分布偏斜，不建议。
2. **AI 是否也持 perf/net**：本设计令 AI 持数值但**不触危机**，避免 8 个 AI 频繁软重置打乱 already-tuned 的派系动态。若主理人希望「全员 Reigns」，需重新跑 balance.md §4.3.2 蒙特卡洛校准（工作量 +1 周）。
3. **批量映射的保底/支配风险**：规则化默认可能让某些卡出现「五维保底缺失」或「新 Axis 帕累托支配」。已用 §3.3 步骤 D/E 的 `ensure_safe_option` + `resolve_pareto_dominance` + 全绿校验兜底；脚本跑完必须零报错，否则不入库。
4. **「失态」与「精力低强制选左」叠加**：过劳时既可能随机失态、又强制选左，可能让玩家感觉失控。建议仅保留「强制选左」，失态概率翻倍改为「仅视觉红噪点增强」，把控制权还给玩家——待工程实现时二选一。
5. **与 balance.md 不重复**：本文刻意不重写 influence/stress/cash 经济（价格表、兑换率、派系阈值均沿用），只增补 Reigns 四表盘层；两文档配合阅读，balance.md 仍为经济权威源。
6. **可实现性边界**：所有新增字段/判定均有对应 engine 落点（Actor/clamp_actor/apply_choice/phase_settle/phase_assembly/ai_vote_score/update_belief_trust），无超出架构能力的需求；`energy` 纯派生不增存储。`cards_data` 归一化与 `web/game.js` 渲染需小改（本文已给 schema 与元素 ID），属工程范畴。

---

*（本文为设计增补，未改动任何代码/数据文件。落地前建议依 §9 决策点与主理人确认，再交程基岩按 §3.3/§7/§8.5 实施。）*
