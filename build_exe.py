#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""构建《职场营销博弈》为单文件 Windows .exe（PyInstaller --onefile --noconsole）。

等价于 `pyinstaller build.spec`。产物：dist/职场营销博弈.exe。
仅构建期依赖 PyInstaller；运行时零第三方依赖（纯标准库）。

用法：
    python build_exe.py            # 推荐
    pyinstaller build.spec         # 等价
"""

import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SPEC = os.path.join(ROOT, "build.spec")
OUT_EXE = os.path.join(ROOT, "dist", "职场营销博弈.exe")


def _run(cmd):
    print(f"[build_exe] 运行：{' '.join(cmd)}")
    print(f"[build_exe] 工作目录：{ROOT}")
    return subprocess.call(cmd, cwd=ROOT)


def main():
    if not os.path.isfile(SPEC):
        print(f"[build_exe] 错误：找不到 {SPEC}", file=sys.stderr)
        sys.exit(2)

    rc = _run(["pyinstaller", "build.spec"])
    if rc != 0:
        # 退路：用当前解释器跑 PyInstaller 模块
        rc = _run([sys.executable, "-m", "PyInstaller", "build.spec"])

    if rc != 0:
        print(f"[build_exe] 构建失败，返回码 {rc}", file=sys.stderr)
        sys.exit(rc)

    if os.path.isfile(OUT_EXE):
        print(f"[build_exe] 成功：{OUT_EXE}")
    else:
        print("[build_exe] 警告：未在 dist/ 找到产物，请检查上方日志。", file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
