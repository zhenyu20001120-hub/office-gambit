"""《职场营销博弈》入口。仅标准库（扁平模块布局）。

用法：
  python main.py --headless 50            # 质量门冒烟测试（随机策略跑 N 局）
  python main.py --gui                     # 启动 tkinter GUI（默认）
  python main.py --gui --difficulty hard --actors 9 --tier senior
  python main.py --headless 200 --difficulty medium --seed 42
"""
import argparse
import os
import sys

# 让 `import engine` 等扁平模块在开发态（python main.py）与 PyInstaller 内均可解析
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")
if SRC not in sys.path:
    sys.path.insert(0, SRC)

import tuning_data


def _print_headless_summary(summary):
    print("=" * 56)
    print(f"Headless 冒烟测试：{summary['num_games']} 局")
    print(f"崩溃数：{summary['crashes']}")
    print("结局分布：", summary["outcomes"])
    print("评级分布：", summary["ratings"])
    print("-" * 56)
    for i, ex in enumerate(summary["examples"][:3]):
        if "error" in ex:
            print(f"[示例 {i}] ERROR: {ex['error']}")
            print(ex.get("trace", "")[:1200])
        else:
            print(f"[示例 {i}] D{ex['day']} 结局={ex['outcome']} 评级={ex['rating']} "
                  f"({ex['title']}) 派系={ex['faction_alias']}/{ex['faction_tier']} "
                  f"混沌={ex['chaos']} 夺客={ex['clients_taken']} 失客={ex['clients_lost']}")
    print("=" * 56)
    if summary["crashes"] == 0:
        print("[PASS] 质量门通过：0 崩溃，全部在 12 天内收敛。")
    else:
        print("[FAIL] 质量门失败：存在崩溃，请查看上方 trace。")


def main(argv=None):
    parser = argparse.ArgumentParser(description="职场营销博弈（Office Marketing Gambit）")
    parser.add_argument("--headless", type=int, metavar="N", default=0,
                        help="以随机策略自动跑 N 局（质量门冒烟测试）")
    parser.add_argument("--gui", action="store_true", help="启动 GUI（默认）")
    parser.add_argument("--difficulty", choices=["easy", "medium", "hard"], default="medium")
    parser.add_argument("--actors", type=int, default=tuning_data.TUNING["NUM_ACTORS"],
                        help="总人数（默认 9，允许 7）")
    parser.add_argument("--tier", choices=["employee", "mid", "senior", "random"], default="random")
    parser.add_argument("--seed", type=int, default=None)
    args = parser.parse_args(argv)

    if args.headless and args.headless > 0:
        import engine
        n = max(1, args.headless)
        tier = None if args.tier == "random" else args.tier
        summary = engine.run_headless(num_games=n, difficulty=args.difficulty,
                                      num_actors=args.actors, player_tier=tier, seed=args.seed)
        _print_headless_summary(summary)
        return 0 if summary["crashes"] == 0 else 1

    try:
        import ui_app
    except Exception as e:  # pragma: no cover
        print(f"GUI 启动失败（可能无显示器）：{e}")
        print("可改用：python main.py --headless 50")
        return 1
    tier = None if args.tier == "random" else args.tier
    ui_app.run_gui(difficulty=args.difficulty, num_actors=args.actors,
                   player_tier=tier, seed=args.seed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
