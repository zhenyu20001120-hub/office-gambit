"""tkinter GUI：1280x720，渲染阶段/情况牌/≥4 选项按钮/三资源条/派系进度/日志/出局摘要。

采用 worker 线程跑引擎主循环，主线程用 wait_variable 模式收集玩家输入（单显示线程安全）。
配色遵循 art-bible（暗底 + 四派系色 + 烛光琥珀）。仅标准库。
"""
import sys
import os
import threading

import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))  # src 在 path
import tuning_data
import cards_data
import engine
from state import Actor, GameState

RES = {
    "influence": {"label": "声望", "color": "#E8C070", "max": 100},
    "stress": {"label": "压力", "color": "#D6453D", "max": 100},
    "cash": {"label": "可动用预算", "color": "#5E92D8", "max": 300, "min": -30},
}
FONT_UI = ("Microsoft YaHei", "Microsoft YaHei UI", "SimHei", "sans-serif")
FONT_TITLE = ("Microsoft YaHei", "Microsoft YaHei UI", "SimHei", "serif")


def _fcolor(fkey):
    return tuning_data.TUNING["FACTIONS"].get(fkey, {}).get("color", "#888888")


class GameApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("职场营销博弈 · Office Marketing Gambit")
        self.root.geometry("1280x720")
        self.root.configure(bg="#14110F")
        self.root.option_add("*Font", FONT_UI)
        self.event = threading.Event()
        self.result = None
        self.state = None
        self._build()

    def _build(self):
        # 顶栏：天数/阶段 + 三资源条 + 派系目标
        self.top = tk.Frame(self.root, bg="#211C17", height=110)
        self.top.pack(side="tk.TOP", fill="x")
        self.top.pack_propagate(False)
        self.lbl_day = tk.Label(self.top, bg="#211C17", fg="#F0E6D2", font=(FONT_UI[0], 16, "bold"))
        self.lbl_day.pack(anchor="w", padx=14, pady=(8, 0))
        self.bars = {}
        for i, (k, v) in enumerate(RES.items()):
            f = tk.Frame(self.top, bg="#211C17")
            f.place(x=14 + i * 420, y=40, width=400, height=56)
            tk.Label(f, text=v["label"], bg="#211C17", fg="#B8A988", font=(FONT_UI[0], 12)).pack(anchor="w")
            cv = tk.Canvas(f, bg="#14110F", height=18, width=360, highlightthickness=0)
            cv.pack(anchor="w", pady=2)
            self.bars[k] = cv
        self.lbl_goal = tk.Label(self.top, bg="#211C17", fg="#E8C070", font=(FONT_UI[0], 12))
        self.lbl_goal.place(x=14, y=86)

        # 中栏：卡面（左/中） + 日志（右）
        mid = tk.Frame(self.root, bg="#14110F")
        mid.pack(side="tk.TOP", fill="both", expand=True)
        self.center = tk.Frame(mid, bg="#14110F", width=820)
        self.center.pack(side="tk.LEFT", fill="both", expand=True, padx=12, pady=10)
        self.center.pack_propagate(False)
        self.log = scrolledtext.ScrolledText(mid, bg="#1B1712", fg="#C8BFA8",
                                              width=40, font=(FONT_UI[0], 11), wrap="word")
        self.log.pack(side="tk.RIGHT", fill="y", padx=(0, 10), pady=10)
        self.log.configure(state="disabled")

    # ---- 刷新 ----
    def _refresh_top(self, state: GameState):
        p = state.player()
        self.lbl_day.configure(text=f"第 {state.day} 天 · {engine.PHASE_LABELS.get(state.phase, state.phase)}")
        for k, cv in self.bars.items():
            val = getattr(p, k)
            spec = RES[k]
            lo = spec.get("min", 0)
            hi = spec["max"]
            frac = max(0.0, min(1.0, (val - lo) / (hi - lo))) if hi > lo else 0.0
            cv.delete("all")
            cv.create_rectangle(0, 0, 360, 18, fill="#2A241D", outline="")
            cv.create_rectangle(0, 0, int(360 * frac), 18, fill=spec["color"], outline="")
            cv.create_text(350, 9, text=f"{val:.0f}", anchor="e", fill="#F0E6D2", font=(FONT_UI[0], 11))
        fkey = p.faction
        goal = tuning_data.faction_goal(fkey)
        self.lbl_goal.configure(text=f"你的派系：{p.faction_alias}（{goal}） · 混沌 {state.chaos:.0f}")
        self._log("\n".join(state.log[-6:]))

    def _log(self, text):
        self.log.configure(state="normal")
        self.log.delete("1.0", "end")
        self.log.insert("end", text)
        self.log.configure(state="disabled")

    def _clear_center(self):
        for w in self.center.winfo_children():
            w.destroy()

    def _done(self, value):
        self.result = value
        self.event.set()

    # ---- 各类输入呈现 ----
    def show_info(self, state, phase, text):
        self.state = state
        self._refresh_top(state)
        self._clear_center()
        tk.Label(self.center, text=engine.PHASE_LABELS.get(phase, phase),
                 bg="#14110F", fg="#E8C070", font=(FONT_TITLE[0], 20, "bold")).pack(anchor="w", pady=(4, 8))
        tk.Label(self.center, text=text, bg="#14110F", fg="#F0E6D2",
                 font=(FONT_UI[0], 14), wraplength=760, justify="left").pack(anchor="w", fill="x")
        btn = tk.Button(self.center, text="继续 ▶", bg="#C8923A", fg="#14110F",
                        font=(FONT_UI[0], 14, "bold"), command=lambda: self._done(None))
        btn.pack(side="tk.BOTTOM", pady=14)
        self.result = None
        self.event.clear()
        self.root.after(0, lambda: None)
        self.event.wait()
        self.root.update_idletasks()

    def ask_card(self, state, card):
        self.state = state
        self._refresh_top(state)
        self._clear_center()
        icon = cards_data.CATEGORY_ICONS.get(card["category"], "📄")
        hdr = tk.Frame(self.center, bg="#211C17")
        hdr.pack(fill="x", pady=4)
        tk.Label(hdr, text=f"{icon} {card['category']}", bg="#211C17", fg="#E8C070",
                 font=(FONT_UI[0], 13)).pack(side="tk.LEFT")
        tk.Label(self.center, text=card["title"], bg="#14110F", fg="#F0E6D2",
                 font=(FONT_TITLE[0], 18, "bold"), wraplength=760, anchor="w").pack(anchor="w", pady=(2, 6))
        tk.Label(self.center, text=card["text"], bg="#14110F", fg="#D8CFBC",
                 font=(FONT_UI[0], 13), wraplength=760, justify="left").pack(anchor="w", fill="x", pady=(0, 8))
        nums = ["①", "②", "③", "④", "⑤", "⑥"]
        for i, ch in enumerate(card["choices"]):
            label = f"{nums[i]} {ch['label']}    [{cards_data.choice_summary(ch)}]"
            danger = ch["arch"] in ("betray", "expose", "leak", "risk")
            b = tk.Button(self.center, text=label, bg="#2A241D" if not danger else "#3A201C",
                          fg="#F0E6D2", font=(FONT_UI[0], 13), anchor="w",
                          relief="groove", command=lambda idx=i: self._done(idx))
            b.pack(fill="x", pady=3, ipady=4)
            self.root.bind(str(i + 1), lambda e, idx=i: self._done(idx))
        self.result = None
        self.event.clear()
        self.event.wait()
        for i in range(1, 7):
            self.root.unbind(str(i))
        self.root.update_idletasks()
        return self.result

    def ask_noon(self, state):
        self._refresh_top(state)
        self._clear_center()
        tk.Label(self.center, text="午间密谈", bg="#14110F", fg="#E8C070",
                 font=(FONT_TITLE[0], 18, "bold")).pack(anchor="w", pady=6)
        tk.Label(self.center, text="选择一位同事私聊（或跳过）：", bg="#14110F", fg="#D8CFBC",
                 font=(FONT_UI[0], 13)).pack(anchor="w", pady=4)
        for a in state.alive_actors():
            if a.is_player:
                continue
            b = tk.Button(self.center, text=f"{a.name}（{a.faction_alias}·{a.tier}）",
                          bg="#2A241D", fg="#F0E6D2", font=(FONT_UI[0], 13), anchor="w",
                          command=lambda idx=a.idx: self._done(idx))
            b.pack(fill="x", pady=2)
        tk.Button(self.center, text="跳过密谈", bg="#5E4414", fg="#F0E6D2",
                  font=(FONT_UI[0], 13), command=lambda: self._done(None)).pack(fill="x", pady=6)
        self.result = None
        self.event.clear()
        self.event.wait()
        self.root.update_idletasks()
        return self.result

    def ask_night(self, state):
        self._refresh_top(state)
        self._clear_center()
        tk.Label(self.center, text="夜间行动", bg="#14110F", fg="#E8C070",
                 font=(FONT_TITLE[0], 18, "bold")).pack(anchor="w", pady=6)
        tk.Label(self.center, text="对一位同事使用夜间能力（施压/调阅背景），或跳过：",
                 bg="#14110F", fg="#D8CFBC", font=(FONT_UI[0], 13)).pack(anchor="w", pady=4)
        for a in state.alive_actors():
            if a.is_player:
                continue
            b = tk.Button(self.center, text=f"对 {a.name} 行动", bg="#2A241D", fg="#F0E6D2",
                          font=(FONT_UI[0], 13), anchor="w", command=lambda idx=a.idx: self._done(idx))
            b.pack(fill="x", pady=2)
        tk.Button(self.center, text="跳过夜间行动", bg="#5E4414", fg="#F0E6D2",
                  font=(FONT_UI[0], 13), command=lambda: self._done(None)).pack(fill="x", pady=6)
        self.result = None
        self.event.clear()
        self.event.wait()
        self.root.update_idletasks()
        return self.result

    def ask_speech(self, state):
        self._refresh_top(state)
        self._clear_center()
        tk.Label(self.center, text="联席会议 · 发言", bg="#14110F", fg="#E8C070",
                 font=(FONT_TITLE[0], 18, "bold")).pack(anchor="w", pady=6)
        choice = {"t": None}

        def pick(t):
            choice["t"] = t
            if t == "accuse":
                for w in self.center.winfo_children():
                    w.destroy()
                tk.Label(self.center, text="指认谁？", bg="#14110F", fg="#D8CFBC",
                         font=(FONT_UI[0], 13)).pack(anchor="w", pady=4)
                for a in state.alive_actors():
                    if a.is_player:
                        continue
                    tk.Button(self.center, text=a.name, bg="#2A241D", fg="#F0E6D2",
                              font=(FONT_UI[0], 13), anchor="w",
                              command=lambda idx=a.idx: self._done(("accuse", idx))).pack(fill="x", pady=2)
                tk.Button(self.center, text="取消", bg="#5E4414", fg="#F0E6D2",
                          font=(FONT_UI[0], 13), command=lambda: self._done(("deflect", None))).pack(fill="x", pady=4)
            else:
                self._done((t, None))

        for t, lbl in (("accuse", "指认某人"), ("defend", "自辩"), ("deflect", "转移话题")):
            tk.Button(self.center, text=lbl, bg="#2A241D", fg="#F0E6D2",
                      font=(FONT_UI[0], 13), anchor="w", command=lambda tt=t: pick(tt)).pack(fill="x", pady=2)
        self.result = None
        self.event.clear()
        self.event.wait()
        self.root.update_idletasks()
        return self.result

    def ask_bribe(self, state):
        self._refresh_top(state)
        cap = state._diff["bribe_cap"]
        cost = tuning_data.TUNING["PRICES"]["buy_vote"]
        self._clear_center()
        tk.Label(self.center, text=f"买票（{cost} 万/票，上限 {cap} 票，你有 {state.player().cash:.0f} 万）",
                 bg="#14110F", fg="#E8C070", font=(FONT_TITLE[0], 16, "bold")).pack(anchor="w", pady=6)
        tk.Label(self.center, text="购买几张票以降低自己被投出的概率？", bg="#14110F", fg="#D8CFBC",
                 font=(FONT_UI[0], 13)).pack(anchor="w", pady=4)
        for n in range(cap + 1):
            txt = f"买 {n} 票" + (f"（花 {n*cost} 万）" if n else "")
            tk.Button(self.center, text=txt, bg="#2A241D", fg="#F0E6D2",
                      font=(FONT_UI[0], 13), anchor="w", command=lambda nn=n: self._done(nn)).pack(fill="x", pady=2)
        self.result = None
        self.event.clear()
        self.event.wait()
        self.root.update_idletasks()
        return self.result

    def ask_vote(self, state, candidates):
        self._refresh_top(state)
        self._clear_center()
        tk.Label(self.center, text="联席会议 · 投票", bg="#14110F", fg="#E8C070",
                 font=(FONT_TITLE[0], 18, "bold")).pack(anchor="w", pady=6)
        tk.Label(self.center, text="把票投给谁？（或弃票）", bg="#14110F", fg="#D8CFBC",
                 font=(FONT_UI[0], 13)).pack(anchor="w", pady=4)
        for a in candidates:
            if a.is_player:
                continue
            tk.Button(self.center, text=f"{a.name}（{a.faction_alias}·{a.tier}·声望{a.influence:.0f}）",
                      bg="#2A241D", fg="#F0E6D2", font=(FONT_UI[0], 13), anchor="w",
                      command=lambda idx=a.idx: self._done(idx)).pack(fill="x", pady=2)
        tk.Button(self.center, text="弃票", bg="#5E4414", fg="#F0E6D2",
                  font=(FONT_UI[0], 13), command=lambda: self._done(None)).pack(fill="x", pady=6)
        self.result = None
        self.event.clear()
        self.event.wait()
        self.root.update_idletasks()
        return self.result

    def show_reveal(self, state, result):
        self.root.after(0, self._build_reveal, state, result)

    def _build_reveal(self, state, result):
        win = tk.Toplevel(self.root)
        win.title("终局揭示")
        win.geometry("900x640")
        win.configure(bg="#14110F")
        tk.Label(win, text=f"{result['title']}", bg="#14110F", fg="#E8C070",
                 font=(FONT_TITLE[0], 22, "bold")).pack(pady=10)
        sub = (f"结局：{result['outcome']}　评级：{result['rating']}　"
               f"派系目标：{result['faction_alias']}/{result['faction_tier']}　"
               f"副目标：{'达成' if result['sub_ok'] else '未达成'}")
        tk.Label(win, text=sub, bg="#14110F", fg="#F0E6D2", font=(FONT_UI[0], 13)).pack(pady=4)
        frm = tk.Frame(win, bg="#14110F")
        frm.pack(fill="both", expand=True, padx=14, pady=8)
        head = f"{'姓名':<8}{'派系':<10}{'档位':<8}{'状态':<14}{'声望':<6}{'压力':<6}{'预算':<6}"
        tk.Label(frm, text=head, bg="#211C17", fg="#B8A988", font=(FONT_UI[0], 12),
                 anchor="w").pack(fill="x")
        for r in result["reveal"]:
            status = "存活" if r["alive"] else f"D{r['out_day']}出局"
            line = f"{r['name']:<8}{r['faction_alias']:<10}{r['tier']:<8}{status:<14}" \
                   f"{r['influence']:<6}{r['stress']:<6}{r['cash']:<6}"
            col = _fcolor(r["faction"])
            tk.Label(frm, text=line, bg="#14110F", fg=col if not r["is_player"] else "#F0E6D2",
                     font=(FONT_UI[0], 12), anchor="w").pack(fill="x")
        tk.Button(win, text="关闭", bg="#C8923A", fg="#14110F", font=(FONT_UI[0], 14, "bold"),
                  command=self.root.destroy).pack(pady=10)


class GUIController(engine.Controller):
    def __init__(self, app):
        self.app = app

    def show_info(self, state, phase, text):
        self.app.show_info(state, phase, text)

    def pick_card(self, state, card):
        return self.app.ask_card(state, card)

    def noon_talk(self, state):
        return self.app.ask_noon(state)

    def night_action(self, state):
        r = self.app.ask_night(state)
        return ("施压", r) if r is not None else None

    def assembly_speech(self, state):
        return self.app.ask_speech(state)

    def assembly_bribe(self, state):
        return self.app.ask_bribe(state)

    def assembly_vote(self, state, candidates):
        return self.app.ask_vote(state, candidates)

    def game_over(self, state, result):
        self.app.show_reveal(state, result)


def run_gui(difficulty="medium", num_actors=9, player_tier=None, seed=None):
    app = GameApp()
    controller = GUIController(app)

    def _play():
        try:
            engine.run_game(difficulty=difficulty, num_actors=num_actors,
                            player_tier=player_tier, controller=controller, seed=seed)
        except Exception as e:  # pragma: no cover
            app.root.after(0, lambda: messagebox.showerror("运行错误", str(e) + "\n" + repr(e)))

    t = threading.Thread(target=_play, daemon=True)
    t.start()
    app.root.mainloop()
