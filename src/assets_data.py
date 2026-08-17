"""资源解析：外部同名文件优先（便于热更），其次 PyInstaller 内嵌（_MEIPASS），最后开发态子目录。

设计依据：ADR-003（cards/tuning 内嵌 + 外部优先热更）。仅依赖标准库。
"""
import os
import sys


def resolve_asset(name, dev_subdir=None):
    """返回该资源最佳可用路径（外部优先 -> 内嵌 -> 开发态）。

    搜索顺序：
      1. 可执行文件/脚本所在目录（exe 同目录的外部覆盖文件，热更首选）
      2. PyInstaller 临时解包目录 sys._MEIPASS（内嵌副本）
      3. 开发态子目录（exe_dir/dev_subdir 与 cwd/dev_subdir）
      4. 当前工作目录
    找不到时返回 1) 的推测路径，由调用方 open 时报错（便于定位）。
    """
    exe_dir = os.path.dirname(os.path.abspath(sys.argv[0]))
    subdir = dev_subdir
    candidates = [os.path.join(exe_dir, name)]
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        candidates.append(os.path.join(sys._MEIPASS, name))
    if subdir:
        candidates.append(os.path.join(exe_dir, subdir, name))
        candidates.append(os.path.join(os.getcwd(), subdir, name))
    candidates.append(os.path.join(os.getcwd(), name))
    for c in candidates:
        if os.path.isfile(c):
            return c
    return candidates[0]


def load_json_asset(name, dev_subdir=None):
    import json
    path = resolve_asset(name, dev_subdir)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
