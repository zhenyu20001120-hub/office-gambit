# ADR-001 采用 PyInstaller 单文件 Windows .exe

- **状态（Status）**：Accepted（已采纳）
- **主题**：发行形态——将《职场营销博弈》打包为单文件、无控制台的 Windows 可执行程序。
- **关联**：ADR-002（数据内嵌 + 外部优先）、ADR-003（本地启发式 AI）。

---

## Context（背景）

目标用户为 **Windows 单机玩家**，核心诉求是"下载 / 双击即玩"，不应要求安装 Python、配置虚拟环境或联网。同时产品要求：

- **离线可玩**：AI 完全本地运行（见 ADR-003），不依赖任何云端服务。
- **无控制台窗口**：纯 GUI 体验，双击 exe 直接进入界面。
- **零运行时第三方依赖**：仅标准库，无需 pip 安装包随附。
- **可分发 / 易更新**：希望策划能不改代码热更数值（见 ADR-002）。

我们考虑了以下发行形态选项：

| 选项 | 说明 | 取舍 |
| --- | --- | --- |
| 纯脚本 + Python 安装 | 用户自行安装 Python 3.13 后 `python main.py` | 门槛高、易因环境差异失败，离线分发差 |
| 安装包 / 分发平台 | NSIS / MSIX / PyPI 等 | 工作量大、需签名与维护渠道，超出当前 MVP 范围 |
| PyInstaller 单目录（`--onedir`） | 产出 folder + exe | 文件散落、易误删、分发不便 |
| **PyInstaller 单文件（`--onefile`，无控制台）** | 产出单个 `职场营销博弈.exe` | 分发最简单、双击即玩、满足离线 + 无控制台 |

---

## Decision（决定）

采用 **PyInstaller 单文件、无控制台**打包。规范命令集中在 `build.spec`，推荐用封装脚本构建：

```bash
# 推荐：等价于 `pyinstaller build.spec`
python build_exe.py
# 产物：dist/职场营销博弈.exe
```

`build.spec` 对应的展开命令（**构建期**依赖 PyInstaller，非运行时）：

```bash
pyinstaller --onefile --noconsole --paths src \
  --add-data "design/cards/cards.json;cards.json" \
  --add-data "config/tuning.json;tuning.json" \
  --hidden-import assets_data --hidden-import tuning_data \
  --hidden-import cards_data --hidden-import state \
  --hidden-import cards --hidden-import ai \
  --hidden-import engine --hidden-import save --hidden-import ui_app \
  --name 职场营销博弈 main.py
```

关键约定：

- `--onefile`：打包为单个可执行文件，所有依赖（含 Python 标准库）内聚其中。
- `--noconsole`：不弹出终端窗口，纯 GUI 启动。
- `--paths src`：告知 PyInstaller 在 `src/` 下解析扁平业务模块。
- `--add-data ...;cards.json` / `--add-data ...;tuning.json`：把 `cards.json` / `tuning.json` **作为文件内嵌**进临时解包目录 `sys._MEIPASS`（运行时由 `assets_data` 读取，见 ADR-002）。Windows 下源/目标用 `;` 分隔。
- `--hidden-import <全部 9 个扁平模块>`：强制把模块打进包（它们由 `main.py` 在函数内延迟 `import`，静态分析不会自动收集，否则冻结态 `ImportError`）。
- **PyInstaller 仅作为构建期依赖**，不进入运行时依赖清单。

---

## Consequences（后果）

### 正面
- 离线、零安装、无控制台、单文件易分发；玩家双击即玩。
- 内嵌数据（ADR-002）保证冻结态不依赖外部 JSON 文件即可运行。
- 与本地启发式 AI（ADR-003）天然契合：无需联网、无运行时大模型依赖。

### 负面 / 风险
- **启动稍慢**：单文件需在运行时把自身解包到临时目录（`sys._MEIPASS`）再执行；体量含整个 Python 标准库，exe 体积较大。
- **Windows 偶发 PermissionError**：`_MEIPASS` 在部分 Windows 配置下读数据可能抛权限错误——已通过 ADR-002 的"外部优先 + 内嵌兜底 + 捕获 OSError/PermissionError 跳过"缓解。
- **hidden-import 必须显式**：若新增内嵌数据模块却忘记 `--hidden-import`，冻结态会 `ImportError`；新增数据模块时须同步更新构建命令。
- **整包更新**：修复逻辑需重发整个 exe；纯数值 / 牌库热更仍可用"exe 同目录放同名文件"覆盖（见 ADR-002），但逻辑改动必须重打包。
- **无原生崩溃界面**：异常由 `main.py` 顶层捕获写入 exe 同目录 `crash.log`，玩家需手动查看日志。
