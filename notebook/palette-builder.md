---
jupytext:
  formats: ipynb,md:myst
  text_representation:
    extension: .md
    format_name: myst
    format_version: 0.13
    jupytext_version: 1.19.6
kernelspec:
  display_name: Python 3
  language: python
  name: python3
---

# Palette Builder · notebook version

**Dan Bartlett · Independent Experimental Research · 2026 · v4.0**

This notebook runs the same conversation as `index.html`, outside the browser. It uses the same instructions, the same rule that holds back a palette until the medium, subject and mood are known, and the same files when you save. It adds two things the page doesn't have: a way to run a scripted conversation without typing, and a one-line request for comparison.

It talks to a model in one of two places:

- **A local model server** (`BACKEND = "local"`). Any OpenAI-compatible server works: vLLM, SGLang or Ollama. The default is Qwen3.8-27B-FP8 through vLLM, the same as Sketch Lab and the page.
- **Hugging Face Inference Providers** (`BACKEND = "hf"`). This needs a Hugging Face token (Cell 3). Qwen3.8-27B-FP8 is not offered by any provider at the time of writing, so this route uses a different model.

The `.ipynb` and `.md` files are the same notebook. Edit either, then keep them in step with `jupytext --sync notebook/palette-builder.ipynb`.

+++

## Cell 1 · Install

Run once, then restart the kernel.

```{code-cell} ipython3
%pip install --quiet "huggingface_hub>=0.30" ipywidgets matplotlib numpy
```

## Cell 2 · Imports

```{code-cell} ipython3
import json, re, datetime
from pathlib import Path

import numpy as np
import matplotlib.pyplot as plt
import ipywidgets as widgets
from IPython.display import display, HTML
from huggingface_hub import InferenceClient
```

## Cell 3 · Hugging Face authentication

Needed only for `BACKEND = "hf"`, or to download model weights for a local server. Create a **fine-grained** token at <https://huggingface.co/settings/tokens> and tick **Make calls to Inference Providers**. Run the cell and paste the token when asked; it is stored in your Hugging Face cache, not in this notebook.

```{code-cell} ipython3
from huggingface_hub import login, get_token

if get_token() is None:
    login()            # asks for the token once and caches it
else:
    print("Already signed in to Hugging Face.")

# Without a prompt, for example on a server:
# import os; login(token=os.environ["HF_TOKEN"])
```

## Cell 4 · Where the model runs

```{code-cell} ipython3
BACKEND = "local"            # "local" or "hf"

# Local: start the server first, for example
#   vllm serve Qwen/Qwen3.8-27B-FP8 --max-model-len 32768
# For Ollama use LOCAL_URL = "http://localhost:11434/v1" and its model name.
LOCAL_URL   = "http://localhost:8000/v1"
LOCAL_MODEL = "Qwen/Qwen3.8-27B-FP8"
LOCAL_KEY   = None           # only if the server was started with --api-key
THINKING    = False          # Qwen3.8 reasons first unless told not to; off is faster

# Hugging Face Inference Providers: pick any chat model that a provider serves.
# A suffix chooses the provider, e.g. ":cheapest" or ":groq".
HF_MODEL = "openai/gpt-oss-120b"

if BACKEND == "local":
    client, MODEL = InferenceClient(base_url=LOCAL_URL, api_key=LOCAL_KEY or "not-needed"), LOCAL_MODEL
elif BACKEND == "hf":
    client, MODEL = InferenceClient(), HF_MODEL   # uses the token from Cell 3
else:
    raise ValueError("BACKEND must be 'local' or 'hf'")
print(f"Using {MODEL} via {'the local server at ' + LOCAL_URL if BACKEND == 'local' else 'Hugging Face Inference Providers'}")
```

## Cell 5 · The colour disc

The same geometry as the page. Hue is the angle (0 at the top, clockwise). Lightness is the radius: 100 (white) at the centre, 50 (full-strength hue) on the middle ring, 0 (black) at the edge. Saturation follows from the radius and cannot be set.

```{code-cell} ipython3
def _round(x):                       # JavaScript-style rounding, so hex codes match the page
    return int(np.floor(x + 0.5))

def hsl_to_rgb(h, s, l):
    s, l = s / 100, l / 100
    a = s * min(l, 1 - l)
    def f(n):
        k = (n + h / 30) % 12
        return l - a * max(-1, min(k - 3, 9 - k, 1))
    return tuple(_round(f(n) * 255) for n in (0, 8, 4))

def sat_for(l):
    return _round(min((1 - l / 100) / 0.5, 1) * 100)

def lstar(r, g, b):                  # CIE L*, used for the value view
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    return _round(116 * np.cbrt(Y) - 16 if Y > 0.008856 else 903.3 * Y)

def colour(h, l, name="", role="", origin="model"):
    h, l = _round(h) % 360, int(min(100, max(0, _round(l))))
    s = sat_for(l)
    r, g, b = hsl_to_rgb(h, s, l)
    return {"h": h, "l": l, "s": s, "r": r, "g": g, "b": b,
            "hex": "#{:02X}{:02X}{:02X}".format(r, g, b), "name": name, "role": role, "origin": origin}

def gap_hue(colours):
    hs = sorted(c["h"] for c in colours)
    gaps = [((hs[(i + 1) % len(hs)] - h) % 360) or 360 for i, h in enumerate(hs)]
    i = int(np.argmax(gaps))
    return (hs[i] + gaps[i] / 2) % 360

_DISC = {}
def disc_image(n=420, value=False):
    if (n, value) not in _DISC:
        y, x = np.mgrid[0:n, 0:n]
        c = (n - 1) / 2
        dx, dy = x - c, y - c
        d = np.hypot(dx, dy) / (n * 0.48)
        hue = (np.degrees(np.arctan2(dy, dx)) + 90) % 360
        rn = np.minimum(d, 1)
        l, s = 1 - rn, np.minimum(rn / 0.5, 1)
        a = s * np.minimum(l, 1 - l)
        def f(k0):
            k = (k0 + hue / 30) % 12
            return l - a * np.maximum(-1, np.minimum(np.minimum(k - 3, 9 - k), 1))
        img = np.dstack([f(0), f(8), f(4)])
        if value:
            lin = np.where(img <= 0.04045, img / 12.92, ((img + 0.055) / 1.055) ** 2.4)
            Y = lin @ np.array([0.2126, 0.7152, 0.0722])
            g = np.where(Y <= 0.0031308, 12.92 * Y, 1.055 * Y ** (1 / 2.4) - 0.055)
            img = np.dstack([g, g, g])
        alpha = np.clip((n * 0.48 + 1 - np.hypot(dx, dy)), 0, 1)
        _DISC[(n, value)] = np.dstack([img, alpha])
    return _DISC[(n, value)]

print(colour(218, 28)["hex"], colour(40, 64)["hex"])   # the page gives #00348F and #E5B961
```

## Cell 6 · Instructions to the model

Identical to the instructions in `index.html`. If you change one, change the other, or the two versions will stop being comparable.

```{code-cell} ipython3
RULES = """You are helping a painter or illustrator plan a colour palette for one piece of work, through a short conversation. Talk as an experienced painter and colour teacher would: plainly and specifically, without flattery.

HOW THE CONVERSATION RUNS
- Ask one question per turn, and make it specific ("Are the shadows warm umber or cool violet?" rather than "What about the shadows?").
- Before proposing any colours, find out four things: the medium; the subject and composition; the format and who will see it; the mood or feeling the work should carry. Ask in whatever order suits the conversation, and follow up on what the artist says.
- Record a field in "gathered" only when the artist has actually told you; otherwise leave it null. Keep each entry to a few words, in the artist's terms.
- The page will not show a palette until medium, subject and mood are recorded, so do not propose colours before then.
- Then propose a palette of 3 to 6 colours, and keep asking questions that refine it. Revise the palette when the answers call for it.
- A message that starts with ADJUSTMENT means the artist has moved or added a colour on the disc themselves. In two or three sentences, say what the change does: to temperature, to the value structure, to the harmony, and to the painting. Do not move it back unless asked. Use phase "commentary" unless you are proposing a revised palette.
- An artist message may end with a line beginning "[Palette now:". That is the current palette, including the artist's own changes. Work from it.

THE COLOUR DISC
Colours sit on a disc by hue and lightness only:
- h: hue angle, 0 to 359 (0 red, 60 yellow, 120 green, 180 cyan, 240 blue, 300 magenta)
- l: lightness, 0 to 100. 100 is white at the centre, 50 is the full-strength hue on the middle ring, 0 is black at the edge.
Saturation follows from position and cannot be set: full strength from l 50 down to black, paler towards white. Muted colours such as greys and earths cannot be shown exactly; choose the nearest hue and lightness, and say so when it matters.
Give the palette a deliberate value structure, with at least one dark (l below 40) and one light (l above 60).
Let the medium shape the advice: for example, transparent watercolour relies on the paper for its lights, while oil and acrylic can build lights with opaque paint.

REPLY FORMAT
Reply with one JSON object and nothing else: no Markdown, no code fences, no text before or after it. Keep this key order:
{"gathered":{"medium":null,"subject":null,"format":null,"mood":null},"phase":"gathering","message":"...","colours":[],"harmony":"","suggestions":[]}
- gathered: everything the artist has told you so far, carried over from earlier turns.
- phase: "gathering", "palette" or "commentary".
- message: what you say to the artist, under 120 words. When proposing a palette, say what job each colour does in the painting.
- colours: only when phase is "palette", e.g. [{"h":215,"l":32,"name":"Harbour Shadow","role":"shadows and the hull"}]. Take names from the subject.
- harmony: only with a palette; the relationship in plain words, such as "split-complementary around blue-violet".
- suggestions: two to four short answers the artist might give to your question, or [].
Use British spelling (colour, grey)."""
```

## Cell 7 · The conversation

A `Session` keeps the turns, the brief, the palette and a record of every change, in the same shape as the page's session record.

```{code-cell} ipython3
VERSION = "Palette Builder v4.0 (notebook)"
REQUIRED = ("medium", "subject", "mood")
WHO = {"model": "set by model", "moved": "moved by artist", "added": "added by artist"}

def parse_model_json(text):
    t = re.sub(r"<think>[\s\S]*?</think>", "", text or "", flags=re.I)
    t = re.sub(r"^[\s\S]*</think>", "", t, flags=re.I).strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", t, re.I)
    if m:
        t = m.group(1).strip()
    a, b = t.find("{"), t.rfind("}")
    if a == -1 or b <= a:
        raise ValueError("The reply was not a JSON object:\n" + t[:400])
    return json.loads(t[a:b + 1])

def call_model(turns):
    kw = dict(model=MODEL, messages=[{"role": "system", "content": RULES}, *turns], max_tokens=8192 if THINKING else 2048)
    if BACKEND == "local":
        # Qwen's recommended sampling, except presence_penalty: a JSON reply repeats its keys.
        kw.update(temperature=1.0 if THINKING else 0.7, top_p=0.95 if THINKING else 0.8, presence_penalty=0,
                  extra_body={"top_k": 20, "chat_template_kwargs": {"enable_thinking": THINKING}})
    out = client.chat_completion(**kw)
    choice = out.choices[0]
    if choice.finish_reason == "length":
        raise ValueError("The reply ran out of room before it finished. Try again, or set THINKING = False.")
    return parse_model_json(choice.message.content)

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")

class Session:
    def __init__(self):
        self.turns, self.log, self.record = [], [], []
        self.brief = dict.fromkeys(("medium", "subject", "format", "mood"))
        self.colours, self.harmony, self.started = [], "", now()

    def note(self, kind, **data):
        self.record.append({"at": now(), "type": kind, **data})

    def snapshot(self):
        return [{k: c[k] for k in ("name", "hex", "h", "l", "origin")} for c in self.colours]

    def palette_line(self):
        if not self.colours:
            return ""
        parts = [f"{c['name'] or 'Colour %d' % (i + 1)} {c['hex']} (h {c['h']}, l {c['l']}, {WHO.get(c['origin'], c['origin'])})"
                 for i, c in enumerate(self.colours)]
        return "\n\n[Palette now: " + "; ".join(parts) + "]"

    def apply(self, obj):
        g = obj.get("gathered") or {}
        for k in self.brief:
            v = g.get(k) or (g.get("audience") if k == "format" else None)
            if isinstance(v, str) and v.strip():
                self.brief[k] = v.strip()[:80]
        held = False
        cols = obj.get("colours") or []
        if obj.get("phase") == "palette" and cols:
            if not all(self.brief[k] for k in REQUIRED):
                held = True              # the same rule as the page: no palette before medium, subject and mood
            else:
                new = [colour(float(c["h"]), float(c["l"]), str(c.get("name", ""))[:40], str(c.get("role", ""))[:90])
                       for c in cols[:8] if isinstance(c, dict) and "h" in c and "l" in c]
                if len(new) >= 2:
                    self.colours, self.harmony = new, str(obj.get("harmony", ""))[:90]
                    self.note("palette_from_model", harmony=self.harmony, colours=self.snapshot())
        message = str(obj.get("message", "")).strip() or "(no message)"
        self.log.append({"who": "model", "text": message})
        if held:
            self.log.append({"who": "page", "text": "A palette was proposed before the medium, subject and mood were all recorded, so it is held back."})
        self.note("reply", phase=obj.get("phase", ""), message=message, gathered=dict(self.brief), held=held)
        return obj

    def ask(self, text, action=None):
        self.turns.append({"role": "user", "content": text + self.palette_line()})
        self.log.append({"who": "artist (on the disc)" if action else "artist", "text": action or text})
        self.note("adjustment_sent" if action else "artist", text=action or text)
        try:
            obj = call_model(self.turns)
        except Exception as e:
            self.turns.pop(); self.log.pop()
            self.note("error", code=type(e).__name__)
            raise
        self.apply(obj)
        self.turns.append({"role": "assistant", "content": json.dumps(obj)})
        return obj

    # The artist's own changes. Each one except removal goes to the model for comment.
    def move(self, i, h, l):
        old = dict(self.colours[i])
        if i == 0:                       # the base colour moves the whole palette, as on the page
            dh, dl = h - old["h"], l - old["l"]
            self.colours = [colour(c["h"] + dh, min(98, max(2, c["l"] + dl)), c["name"], c["role"],
                                   "added" if c["origin"] == "added" else "moved") for c in self.colours]
            desc = f'moved the base colour "{old["name"]}" from {old["hex"]} to {self.colours[0]["hex"]}, which shifted the whole palette with it'
        else:
            c = self.colours[i]
            self.colours[i] = colour(h, min(98, max(2, l)), c["name"], c["role"], "added" if c["origin"] == "added" else "moved")
            desc = f'moved "{old["name"]}" from {old["hex"]} (h {old["h"]}, l {old["l"]}) to {self.colours[i]["hex"]} (h {self.colours[i]["h"]}, l {self.colours[i]["l"]})'
        self.note("artist_moved", colour=old["name"], whole_palette=(i == 0), **{"from": old["hex"], "to": self.colours[i]["hex"]}, colours=self.snapshot())
        return self.ask("ADJUSTMENT: The artist " + desc + ".", action=f'You moved {old["name"]} → {self.colours[i]["hex"]}')

    def add(self):
        c = colour(gap_hue(self.colours), 50, "New colour", "", "added")
        self.colours.append(c)
        self.note("artist_added", hex=c["hex"], colours=self.snapshot())
        return self.ask(f"ADJUSTMENT: The artist added a new colour at {c['hex']} (h {c['h']}, l {c['l']}), in the widest gap between the existing hues. "
                        "Suggest what job it could do in this painting and where on the disc they might move it.", action=f"You added a colour → {c['hex']}")

    def remove(self, i):
        if i == 0 or len(self.colours) <= 2:
            raise ValueError("The base colour stays, and a palette keeps at least two colours.")
        c = self.colours.pop(i)
        self.log.append({"who": "artist (on the disc)", "text": f"You removed {c['name']} ({c['hex']})"})
        self.note("artist_removed", colour=c["name"], hex=c["hex"], colours=self.snapshot())

    # The same files the page saves.
    def palette_json(self):
        return {"tool": VERSION, "created": now(), "engine": BACKEND, "model": MODEL, "brief": self.brief, "harmony": self.harmony,
                "colours": [{"name": c["name"], "role": c["role"], "hex": c["hex"], "rgb": [c["r"], c["g"], c["b"]], "hsl": [c["h"], c["s"], c["l"]],
                             "value_lstar": lstar(c["r"], c["g"], c["b"]), "set_by": c["origin"], "base": i == 0} for i, c in enumerate(self.colours)]}

    def record_json(self):
        return {"tool": VERSION, "engine": BACKEND, "model": MODEL, "started": self.started, "saved": now(), "brief": self.brief,
                "final_palette": self.snapshot(), "conversation": self.log, "events": self.record, "instructions": RULES}

    def save(self, folder="sessions"):
        Path(folder).mkdir(exist_ok=True)
        stamp = now()[:16].replace(":", "-").replace("T", "-")
        p1, p2 = Path(folder, f"palette-{stamp}.json"), Path(folder, f"palette-session-{stamp}.json")
        p1.write_text(json.dumps(self.palette_json(), indent=2)); p2.write_text(json.dumps(self.record_json(), indent=2))
        return p1, p2
```

## Cell 8 · Drawing the palette

```{code-cell} ipython3
TAGS = {"model": "MODEL", "moved": "MOVED BY YOU", "added": "ADDED BY YOU"}

def plot_palette(session, value=False):
    cols = session.colours
    fig, (ax, sw) = plt.subplots(1, 2, figsize=(11, 5), gridspec_kw={"width_ratios": [1, 1.15]})
    fig.patch.set_facecolor("#e8e8e5")
    ax.imshow(disc_image(value=value), extent=[-1, 1, -1, 1]); ax.set_axis_off()
    pts = []
    for c in cols:
        r, a = (1 - c["l"] / 100) * 0.96, np.radians(c["h"] - 90)
        pts.append((r * np.cos(a), -r * np.sin(a)))
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            ax.plot(*zip(pts[i], pts[j]), ls=":", lw=.8, color="0.25")
    for i, ((x, y), c) in enumerate(zip(pts, cols)):
        fill = "#{0:02X}{0:02X}{0:02X}".format(_round(lstar(c["r"], c["g"], c["b"]) * 2.55)) if value else c["hex"]
        ax.scatter([x], [y], s=260 if i == 0 else 170, c=fill, edgecolors="#1c1b19", linewidths=1.2, zorder=3)
        if i == 0:
            ax.scatter([x], [y], s=26, c="white", edgecolors="#1c1b19", linewidths=.6, zorder=4)
    ax.set_title(session.harmony or "palette", fontsize=10, style="italic", color="#5e5d58")
    sw.set_axis_off(); sw.set_xlim(0, 1); sw.set_ylim(0, len(cols))
    for k, c in enumerate(cols):
        y = len(cols) - k - 1
        sw.add_patch(plt.Rectangle((0, y + .1), .22, .8, color=c["hex"]))
        L = lstar(c["r"], c["g"], c["b"])
        sw.add_patch(plt.Rectangle((.23, y + .1), .06, .8, color=str(round(L / 100, 3))))
        sw.text(.33, y + .66, c["name"] or f"Colour {k + 1}", fontsize=11, style="italic")
        sw.text(.33, y + .40, f'{c["hex"]}   rgb({c["r"]}, {c["g"]}, {c["b"]})', fontsize=9, family="monospace")
        sw.text(.33, y + .17, f'H {c["h"]}  L {c["l"]}  value L* {L}  ·  {TAGS.get(c["origin"], c["origin"])}', fontsize=8, family="monospace", color="#5e5d58")
    plt.tight_layout(); plt.show()
```

## Cell 9 · Talk to it

Type in the box and press **Send**. The notebook has no disc to drag, so changes are made with the controls underneath: choose a colour, set its hue and lightness, and press **Move**. As on the page, moving the base colour (the first) moves the whole palette.

```{code-cell} ipython3
def launch(session=None):
    s = session or Session()
    out_chat, out_plot = widgets.Output(), widgets.Output()
    box = widgets.Textarea(placeholder="Describe the painting or illustration you are planning…", layout=widgets.Layout(width="100%", height="70px"))
    send_b, add_b, save_b = (widgets.Button(description=d) for d in ("Send", "+ Colour", "Save"))
    send_b.button_style = "primary"
    value_b = widgets.ToggleButton(description="Value view")
    pick = widgets.Dropdown(description="Colour")
    hue = widgets.IntSlider(description="Hue", min=0, max=359)
    light = widgets.IntSlider(description="Lightness", min=2, max=98)
    move_b, remove_b = widgets.Button(description="Move"), widgets.Button(description="Remove")
    status = widgets.HTML()

    def show():
        with out_chat:
            out_chat.clear_output()
            for m in s.log[-12:]:
                display(HTML(f'<p style="margin:4px 0"><b style="font-family:monospace;font-size:10px;letter-spacing:.12em">{m["who"].upper()}</b><br>{m["text"]}</p>'))
            print("Brief:", {k: v for k, v in s.brief.items()})
        with out_plot:
            out_plot.clear_output()
            if s.colours:
                plot_palette(s, value=value_b.value)
        pick.options = [(f'{i + 1}. {c["name"] or "Colour"} {c["hex"]}', i) for i, c in enumerate(s.colours)]
        for w in (pick, hue, light, move_b, remove_b, add_b):
            w.disabled = not s.colours

    def sync(_=None):
        if pick.value is not None and s.colours:
            hue.value, light.value = s.colours[pick.value]["h"], s.colours[pick.value]["l"]

    def run(fn, *a):
        status.value = "<i>Waiting for the model…</i>"
        try:
            fn(*a); status.value = ""
        except Exception as e:
            status.value = f'<span style="color:#b23a2b">{e}</span>'
        show(); sync()

    def on_send(_):
        t = box.value.strip()
        if t:
            box.value = ""; run(s.ask, t)
    send_b.on_click(on_send)
    add_b.on_click(lambda _: run(s.add))
    move_b.on_click(lambda _: run(s.move, pick.value, hue.value, light.value))
    remove_b.on_click(lambda _: run(s.remove, pick.value))
    value_b.observe(lambda _: show(), "value")
    pick.observe(sync, "value")
    save_b.on_click(lambda _: setattr(status, "value", "Saved: " + ", ".join(str(p) for p in s.save())))

    show()
    display(widgets.VBox([out_chat, box, widgets.HBox([send_b, add_b, value_b, save_b]), status, out_plot,
                          widgets.HBox([pick, hue, light, move_b, remove_b])]))
    return s

session = launch()
```

## Cell 10 · Scripted conversations and one-line requests

For comparing runs without typing. `run_script` plays a list of artist answers in order and saves the session. `one_line` asks for a palette in a single message, the way most colour tools are asked. Note that the hold still applies: if the one line doesn't give a medium, subject and mood, no palette is kept.

```{code-cell} ipython3
def run_script(answers, folder="sessions"):
    s = Session()
    for a in answers:
        s.ask(a)
    return s, s.save(folder)

def one_line(request, folder="sessions"):
    s = Session()
    s.ask(request)
    return s, s.save(folder)

# Example (uses the model, so it is commented out):
# s, files = run_script(["An oil painting of a harbour at dusk.", "Quiet, a little lonely.", "A large canvas for a gallery."])
# plot_palette(s)
```
