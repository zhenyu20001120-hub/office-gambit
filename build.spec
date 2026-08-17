# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller 单文件构建规范（--onefile --noconsole）。

用法：pyinstaller build.spec   或   python build_exe.py
产物：dist/职场营销博弈.exe（Windows 单文件，离线可跑）

要点：
- 入口 main.py；pathex 指向 src/，使 `import engine` 等扁平模块可被收集。
- cards.json / tuning.json 通过 --add-data 内嵌；运行时“外部同名文件优先”以便热更（见 ADR-003）。
- hiddenimports 覆盖所有扁平模块（main.py 在函数内延迟 import，静态分析看不到）。
"""
import os

# PyInstaller 执行 spec 时会注入 SPECPATH（本 spec 所在绝对目录）；
# 运行时以此为项目根。回退用 cwd，保证 `pyinstaller build.spec` 稳健。
try:
    ROOT = SPECPATH
except NameError:
    ROOT = os.getcwd()
SRC = os.path.join(ROOT, "src")

a = Analysis(
    [os.path.join(ROOT, "main.py")],
    pathex=[SRC],
    binaries=[],
    datas=[
        (os.path.join(ROOT, "design", "cards", "cards.json"), "cards.json"),
        (os.path.join(ROOT, "config", "tuning.json"), "tuning.json"),
    ],
    hiddenimports=[
        "assets_data", "tuning_data", "cards_data", "state",
        "cards", "ai", "engine", "save", "ui_app",
        "_embed_cards", "_embed_tuning",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="职场营销博弈",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
