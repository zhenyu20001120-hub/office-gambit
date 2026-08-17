"""生成内嵌数据模块：把 design/cards/cards.json 与 config/tuning.json
以 base64 形式写入 src/_embed_cards.py / src/_embed_tuning.py。

用途：
  - 作为 PyInstaller 读取 _MEIPASS 失败（Windows 偶发 PermissionError）时的终极兜底，
    让单文件 .exe 永不因读不到 JSON 而崩溃（见 dist/crash.log 历史问题）。
  - 外部同名文件（exe 同目录 / design/cards / config）仍优先，用于热更。
  - 与 cards_data.py / tuning_data.py 的 loader 解耦：本脚本只产出纯数据模块，
    不覆盖 loader 逻辑。
运行：python tools/gen_embed.py
"""
import base64
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "src")


def embed(src_rel: str, dst_name: str):
    src = os.path.join(ROOT, src_rel)
    with open(src, "rb") as f:
        raw = f.read()
    # 校验 JSON 合法性
    json.loads(raw)
    b64 = base64.b64encode(raw).decode("ascii")
    out = os.path.join(SRC_DIR, dst_name)
    with open(out, "w", encoding="utf-8") as f:
        f.write('"""Auto-generated embedded asset (BASE64). Regenerate via tools/gen_embed.py. Do not edit by hand."""\n')
        f.write("import base64\nimport json\n\n")
        f.write('RAW = (\n')
        for i in range(0, len(b64), 100):
            f.write('    "%s"\n' % b64[i:i + 100])
        f.write(")\n")
        f.write("DATA = json.loads(base64.b64decode(RAW))\n")
    print(f"wrote {out}  ({len(b64)} b64 chars, {len(raw)} bytes)")


if __name__ == "__main__":
    embed("design/cards/cards.json", "_embed_cards.py")
    embed("config/tuning.json", "_embed_tuning.py")
    print("done")
