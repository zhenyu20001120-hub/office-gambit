# ADR-002 cards / tuning 外部优先 + PyInstaller `--add-data` 内嵌（热更）

- **状态（Status）**：Accepted（已采纳）
- **主题**：情况牌库（cards.json）与平衡配置（tuning.json）的加载策略——**文件优先解析（exe 同目录 → `_MEIPASS` → 开发态子目录 → cwd）+ PyInstaller `--add-data` 内嵌 + 同目录热更覆盖**。
- **关联**：ADR-001（PyInstaller 单文件）、ADR-003（本地启发式 AI）、architecture.md §5。

---

## Context（背景）

采用单文件 .exe（ADR-001）后，程序不再能「携带」外部 JSON 资源目录。我们需要在「离线不崩」「热更便捷」「开发顺手」之间取平衡：

- **离线可玩**：冻结态不能依赖随附的外部 JSON 文件也能跑。
- **热更零重打包**：策划改数不改码——同目录放同名文件即覆盖生效。
- **开发态顺手**：从项目根 `python main.py` 能自动找到 `design/cards`、`config` 源数据。
- **健壮**：避免任何解码（base64）失败导致整局崩溃。

> 注：早期曾考虑「base64 把 JSON 塞进 `.py` 作内嵌兜底」（并留了 `tools/gen_embed.py`），**该方案已弃用**——base64 增加体积、难热更、有解码失败风险。当前实现改用更透明的「文件优先 + `--add-data` 内嵌」。本 ADR 记录**当前方案**。

候选策略：

| 选项 | 说明 | 取舍 |
| --- | --- | --- |
| 纯外部文件（仅 `_MEIPASS` / 同目录） | 全部从外部读取 | 简洁，但单文件丢失外部文件即不可用；无同目录热更则改数需重打包 |
| 纯 base64 内嵌（塞进 `.py`） | 只从内嵌副本读取 | 永不崩、绝对离线；但体积大、难热更、有解码失败风险（已弃用） |
| **混合（文件优先解析 + `--add-data` 内嵌 + 同目录热更）** | exe 同目录 → `_MEIPASS` → 开发态子目录 → cwd；`_MEIPASS` 由 `--add-data` 内嵌；同目录同名优先覆盖 | 兼顾离线 / 热更 / 开发顺手 / 健壮 |

---

## Decision（决定）

采用**文件优先解析 + PyInstaller `--add-data` 内嵌**混合策略，全部实现于 `src/assets_data.py`：

1. **加载顺序（外部优先 → 内嵌 → 开发态）**，由 `assets_data.resolve_asset(name, dev_subdir)` 实现，任一命中即返回：
   1. 可执行文件 / 脚本所在目录同名文件（**热更首选**：`{exe_dir}/cards.json`、`{exe_dir}/tuning.json`）；
   2. PyInstaller 临时解包目录 `sys._MEIPASS`（**构建期内嵌副本**，由 `build.spec` 的 `--add-data` 打包）；
   3. 开发态子目录 `{exe_dir}/design/cards/cards.json`、`{exe_dir}/config/tuning.json`，以及 `cwd` 对应子目录；
   4. `cwd` 同名文件。
2. **无 base64、无 `.py` 内嵌副本**：健壮性来自「多候选路径 + 调用方容错」，而非把数据塞进源码。
3. **tuning 额外兜底**：`tuning_data.TUNING` 在外部加载失败时回退 `_DEFAULTS`，并对关键键 `setdefault` 保证存在，避免极端情况下直接崩。
4. **构建期内嵌**：`build.spec` 用 `--add-data "design/cards/cards.json;cards.json"` 与 `--add-data "config/tuning.json;tuning.json"` 把两份 JSON 打进 `sys._MEIPASS`。
5. **热更**：exe 同目录放同名 `cards.json` / `tuning.json` 即覆盖 `_MEIPASS` 副本，无需重打包。

---

## Consequences（后果）

### 正面
- **冻结态离线可玩**：`_MEIPASS` 内嵌副本保证无外部文件也能跑；「存在即取」路径解析无解码失败风险。
- **热更零重打包**：exe 同目录放同名文件即覆盖生效，策划改数不改码。
- **开发态顺手**：从项目根跑 `python main.py` 自动命中 `design/cards`、`config` 源数据。
- **透明易审**：数据是纯 JSON 文件，策划/QA 可直接读改，无需处理 base64。
- **体积更小**：省去 base64 膨胀。

### 负面 / 风险
- **双真理易漂移（低优先级）**：外部源数据（`design/cards/cards.json`、`config/tuning.json`）与冻结态 `_MEIPASS` 副本是两份，需通过重新构建同步；忘记 rebuild 则冻结态用过期内嵌副本。但「同目录热更」可随时覆盖，缓解该风险。
- **schema 不一致会炸引擎（见 architecture §5.3）**：若把 `tuning.json` 改成与引擎消费键不符的结构，会触发 KeyError；`tuning_data._DEFAULTS` 仅兜最低限度键。建议改数后跑 `python main.py --headless 5` 验证。
- **旧脚本遗留**：`tools/gen_embed.py`（base64 生成器）已不参与构建，可保留或删除，勿再使用。
- **旧 spec 遗留**：`职场营销博弈.spec` 用绝对路径且仅 2 个 hiddenimports，已过时；新构建一律用 `build.spec`。
