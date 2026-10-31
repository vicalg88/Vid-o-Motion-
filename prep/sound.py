"""
Sound design procédural du film Exprnc. (POV onirique, ~23 s, stéréo 48 kHz).
Tout est synthétisé (aucun sample externe) et calé sur les CUES de src/timeline.js.
Sortie : output/audio.wav
"""
import math
import re
import wave
from pathlib import Path

import numpy as np
from scipy import signal

ROOT = Path(__file__).resolve().parents[1]
SR = 48000
rng = np.random.default_rng(11)

# ----------------------------------------------------------------------------- CUES depuis timeline.js
src = (ROOT / "src" / "timeline.js").read_text()
DUR = float(re.search(r"export const DURATION = ([\d.]+)", src).group(1))
FPS = int(re.search(r"export const FPS = (\d+)", src).group(1))
block = re.search(r"export const CUES = \{(.*?)\};", src, re.S).group(1)
CUES = {}
for k, v in re.findall(r"(\w+):\s*(\[[^\]]*\]|[\w.]+)", block):
    CUES[k] = [float(x) for x in v.strip("[]").split(",")] if v.startswith("[") else float(v)
N = int(SR * DUR)
VIS = [CUES["v1"], CUES["v2"], CUES["v3"], CUES["v4"]]
PICK = [CUES["pick1"], CUES["pick2"], CUES["pick3"]]
THR = CUES["threshold"]
press = CUES["press"]

# ----------------------------------------------------------------------------- bus (sec, salle, rêve)
dry = np.zeros((2, N))
room = np.zeros((2, N))
dream = np.zeros((2, N))


def place(sig, t0, pan=0.0, gain=1.0, rv=0.25, bus=None):
    """bus : 'room' avant la porte, 'dream' après (choisi automatiquement)."""
    i0 = int(round(t0 * SR))
    if i0 >= N or gain == 0:
        return
    if sig.ndim == 1:
        th = (np.clip(pan, -1, 1) + 1) * math.pi / 4
        st = np.stack([sig * math.cos(th), sig * math.sin(th)]) * math.sqrt(2)
    else:
        st = sig
    if i0 < 0:
        st = st[:, -i0:]
        i0 = 0
    n = min(st.shape[1], N - i0)
    st = st[:, :n] * gain
    dry[:, i0 : i0 + n] += st
    b = bus or ("room" if t0 < THR - 0.1 else "dream")
    (room if b == "room" else dream)[:, i0 : i0 + n] += st * rv


def T(d):
    return np.arange(int(d * SR)) / SR


def noise(d):
    return rng.standard_normal(int(d * SR))


def sos(kind, f, order=2):
    if kind == "bp":
        return signal.butter(order, [f[0], f[1]], btype="bandpass", fs=SR, output="sos")
    return signal.butter(order, f, btype=kind, fs=SR, output="sos")


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x)


def svf(x, fc, q=0.8, mode="bp"):
    fc = np.broadcast_to(np.clip(fc, 20, SR * 0.45), x.shape)
    g = np.tan(np.pi * fc / SR)
    k = 1.0 / q
    a1 = 1.0 / (1.0 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    y = np.empty_like(x)
    ic1 = ic2 = 0.0
    for n in range(len(x)):
        v3 = x[n] - ic2
        v1 = a1[n] * ic1 + a2[n] * v3
        v2 = ic2 + a2[n] * ic1 + a3[n] * v3
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        y[n] = v1 if mode == "bp" else (v2 if mode == "lp" else x[n] - k * v1 - v2)
    return y


def chirp(f0, f1, d, curve=4.0):
    t = T(d)
    f = f1 + (f0 - f1) * np.exp(-t / (d / curve))
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def addat(buf, i0, sig):
    i0 = max(0, int(i0))
    n = min(len(sig), len(buf) - i0)
    if n > 0:
        buf[i0 : i0 + n] += sig[:n]


def damped(freqs, decays, d, amps=None):
    t = T(d)
    amps = amps or [1] * len(freqs)
    return sum(a * np.sin(2 * np.pi * f * t + rng.random() * 6) * np.exp(-t / dc) for f, dc, a in zip(freqs, decays, amps))


# ----------------------------------------------------------------------------- instruments
def whoosh(d, f0, f1, f2=None, q=1.0, peak=0.55, shape=2.0):
    t = T(d)
    u = t / d
    fc = f0 * (f1 / f0) ** u if f2 is None else np.where(u < peak, f0 * (f1 / f0) ** (u / peak), f1 * (f2 / f1) ** ((u - peak) / (1 - peak)))
    x = noise(d)
    y = svf(x, fc, q, "bp") * 0.75 + svf(x, fc * 0.5, 0.6, "lp") * 0.25
    e = np.where(u < peak, (u / peak) ** shape, ((1 - u) / (1 - peak)) ** (shape * 0.8))
    return y * e


def footstep(soft=1.0):
    d = 0.35
    t = T(d)
    body = filt(filt(noise(d), "lp", 300), "hp", 60) * np.exp(-t / 0.04) * 1.6
    body += np.sin(2 * np.pi * 82 * t) * np.exp(-t / 0.045) * 0.35
    scuff = filt(noise(d), "bp", [700, 3200]) * np.exp(-t / 0.018) * 0.35 * soft
    return body + scuff


def creak(d):
    t = T(d)
    out = np.zeros(len(t))
    pos = 0.0
    while pos < d - 0.02:
        f = 150 + 140 * math.sin(pos * 3.1) ** 2 + rng.random() * 30
        i = int(pos * SR)
        out[i] += 1.0 + rng.random() * 0.6
        pos += 1.0 / f * (1 + rng.normal(0, 0.12))
    res = np.zeros(int(0.03 * SR))
    tt = np.arange(len(res)) / SR
    for f, dc, a in ((620, 0.006, 1), (1450, 0.004, 0.6), (2700, 0.003, 0.35)):
        res += a * np.sin(2 * np.pi * f * tt) * np.exp(-tt / dc)
    y = signal.fftconvolve(out, res)[: len(t)]
    env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 0.7 * (0.6 + 0.4 * np.sin(t * 17) ** 2)
    return y * env


def latch():
    d = 0.3
    t = T(d)
    s = damped([2250, 3700, 5200], [0.012, 0.008, 0.005], d, [0.8, 0.5, 0.3])
    s += filt(noise(d), "bp", [1500, 7000]) * np.exp(-t / 0.003) * 0.8
    s += np.sin(2 * np.pi * 140 * t) * np.exp(-t / 0.03) * 0.6
    return s


def swell(d, f0=300, f1=7000):
    t = T(d)
    u = t / d
    x = svf(noise(d), f0 * (f1 / f0) ** (u**1.5), 0.9, "bp")
    tone = sum(np.sin(2 * np.pi * np.cumsum(np.full(len(t), f) * (1 + 0.004 * k)) / SR) for k, f in enumerate([293.7, 440, 587.3, 880]))
    return (x * 0.8 + tone * 0.05 * u) * u**2.8


def boom(d=2.8, f_hi=86, f_lo=32):
    t = T(d)
    s = chirp(f_hi, f_lo, d, curve=5) * np.exp(-t / 0.7)
    s += filt(noise(d), "lp", 150) * np.exp(-t / 0.18) * 1.3
    s += filt(noise(d), "bp", [400, 2400]) * np.exp(-t / 0.025) * 0.4
    return s


def shimmer(d, dens=60, fmin=3500, fmax=9500, env="swell"):
    t = T(d)
    out = np.zeros(len(t))
    n = int(dens * d)
    for _ in range(n):
        st = rng.random() * d * 0.92
        f = math.exp(rng.uniform(math.log(fmin), math.log(fmax)))
        gl = int(0.06 * SR)
        i0 = int(st * SR)
        tt = np.arange(gl) / SR
        g = np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.018) * rng.uniform(0.3, 1)
        addat(out, i0, g)
    u = t / d
    e = np.sin(np.pi * u) if env == "swell" else np.exp(-u * 3)
    return out * e


def chime(freqs, d=3.0, decay=1.2, detune=0.0025):
    t = T(d)
    out = np.zeros((2, len(t)))
    for i, f in enumerate(freqs):
        for side, dt in ((0, -detune), (1, detune)):
            ff = f * (1 + dt * (1 if i % 2 else -1))
            v = np.sin(2 * np.pi * ff * t) + 0.15 * np.sin(2 * np.pi * ff * 2.01 * t) * np.exp(-t / 0.3)
            v *= np.exp(-t / (decay * (1 - i * 0.06))) * np.minimum(1, t / 0.004)
            out[side] += v / len(freqs)
    return out


def click(bright=1.0):
    d = 0.25
    t = T(d)
    tr = filt(noise(d), "bp", [2500, 9000]) * np.exp(-t / 0.0035) * 0.9 * bright
    res = damped([1900, 2870, 4100], [0.022, 0.016, 0.01], d, [0.55, 0.35, 0.2])
    body = np.sin(2 * np.pi * 165 * t) * np.exp(-t / 0.05) * 0.7
    return tr + res * 0.6 + body


# --- casino
def roulette(d):
    t = T(d)
    out = np.zeros(len(t))
    pos = 0.05
    while pos < d - 0.05:
        rate = 16 * (1 - pos / d) + 4
        i = int(pos * SR)
        tick = damped([3100 + rng.random() * 400, 5200], [0.004, 0.002], 0.03, [1, 0.4])
        addat(out, i, tick * (0.6 + 0.4 * rng.random()))
        pos += 1 / rate
    whirr = svf(noise(d), 900 + 300 * np.sin(2 * np.pi * 3.5 * t), 2.0, "bp") * 0.25
    return (out + whirr) * np.minimum(1, t / 0.15) * np.minimum(1, (d - t) / 0.3)


def chips(n=5, d=1.2):
    out = np.zeros(int(d * SR))
    for _ in range(n):
        i0 = int(rng.random() * max(0.0, d - 0.1) * SR)
        c = damped([rng.uniform(2600, 3600), rng.uniform(4800, 6200)], [0.03, 0.018], 0.1, [1, 0.6])
        addat(out, i0, c)
        if rng.random() < 0.6:
            j = i0 + int(rng.uniform(0.03, 0.07) * SR)
            addat(out, j, c * 0.6)
    return out


def clocktick(n, period=1.0, f=2600):
    out = np.zeros(int((n * period + 0.2) * SR))
    for k in range(n):
        i0 = int(k * period * SR)
        c = damped([f if k % 2 == 0 else f * 0.85, f * 1.9], [0.008, 0.004], 0.05, [1, 0.4])
        c += filt(noise(0.05), "hp", 3000) * np.exp(-T(0.05) / 0.002) * 0.4
        out[i0 : i0 + len(c)] += c
    return out


# --- cinéma
def projector(d):
    t = T(d)
    clicks = np.zeros(len(t))
    for k in range(int(d * 24)):
        i = int(k / 24 * SR)
        clicks[i : i + 200] += np.exp(-np.arange(200) / 30) * (0.7 + 0.3 * rng.random())
    s = filt(clicks, "bp", [600, 3500]) * 0.6 + np.sin(2 * np.pi * 110 * t) * 0.08 + filt(noise(d), "bp", [200, 900]) * 0.08
    return s * np.minimum(1, t / 0.3) * np.minimum(1, (d - t) / 0.3)


def shutter():
    d = 0.5
    t = T(d)
    s = filt(noise(d), "bp", [1500, 6000]) * (np.exp(-t / 0.004) + 0.7 * np.exp(-np.maximum(0, t - 0.045) / 0.004) * (t > 0.045))
    whine = np.sin(2 * np.pi * np.cumsum(5200 + 2500 * np.exp(-t / 0.05)) / SR) * np.exp(-t / 0.08) * 0.08
    return s + whine


def clap():
    d = 0.4
    t = T(d)
    s = filt(noise(d), "bp", [900, 5000]) * np.exp(-t / 0.012) * 1.3
    s += damped([420, 980], [0.03, 0.02], d, [0.6, 0.3])
    return s


def sting(d):
    t = T(d)
    out = np.zeros(len(t))
    for f in (329.6, 349.2, 466.2):
        vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t)
        ph = 2 * np.pi * np.cumsum(f * vib) / SR
        out += sum(np.sin(h * ph) / h for h in range(1, 8))
    out = filt(out, "lp", 2600)
    return out * (t / d) ** 2 * np.minimum(1, (d - t) / 0.05)


# --- undercover
def heartbeat():
    d = 0.6
    t = T(d)
    lub = np.sin(2 * np.pi * 55 * t) * np.exp(-t / 0.06) * (t < 0.2)
    t2 = np.maximum(0, t - 0.24)
    dub = np.sin(2 * np.pi * 48 * t2) * np.exp(-t2 / 0.05) * (t > 0.24) * 0.7
    return filt(lub + dub, "lp", 160) * 2.2


def radio(d):
    t = T(d)
    gate = (filt(rng.random(len(t)), "lp", 18) > 0.5).astype(float)
    s = filt(noise(d), "bp", [1200, 5200]) * (0.25 + 0.75 * gate) * 0.35
    beeps = np.zeros(len(t))
    pat = [0.08, 0.08, 0.22, 0.08, 0.22, 0.22]
    pos = 0.3
    for k, ln in enumerate(pat):
        i0, i1 = int(pos * SR), int((pos + ln) * SR)
        tt = np.arange(i1 - i0) / SR
        beeps[i0:i1] += np.sin(2 * np.pi * 1180 * tt) * np.minimum(1, tt / 0.004) * np.minimum(1, (ln - tt) / 0.004)
        pos += ln + 0.07
    return (s + beeps * 0.35) * np.minimum(1, t / 0.1) * np.minimum(1, (d - t) / 0.2)


def laserhum(d):
    t = T(d)
    f = 118 * (1 + 0.01 * np.sin(2 * np.pi * 0.7 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = sum(np.sin(h * ph) / h for h in range(1, 14)) * 0.25
    s = filt(s, "bp", [200, 3000])
    s += np.sin(2 * np.pi * 3150 * t) * 0.02
    return s * np.minimum(1, t / 0.3) * np.minimum(1, (d - t) / 0.3)


def scan(d=0.7):
    t = T(d)
    s = np.sin(2 * np.pi * np.cumsum(np.linspace(400, 2400, len(t))) / SR) * (0.6 + 0.4 * np.sin(2 * np.pi * 30 * t))
    return s * np.sin(np.pi * t / d) * 0.3


# --- cocktails
def ice(n=4, d=1.0):
    out = np.zeros(int(d * SR))
    for _ in range(n):
        i0 = int(rng.random() * max(0.0, d - 0.2) * SR)
        k = rng.uniform(0.85, 1.2)
        c = damped([2100 * k, 3420 * k, 5600 * k, 7900 * k], [0.09, 0.06, 0.04, 0.025], 0.3, [1, 0.7, 0.45, 0.25])
        addat(out, i0, c)
    return out


def pour(d):
    t = T(d)
    gurgle = 0.6 + 0.4 * np.sin(2 * np.pi * (7 + 3 * np.sin(t * 2.1)) * t)
    s = svf(noise(d), 700 + 300 * np.sin(t * 9), 1.2, "bp") * gurgle * 0.5
    for _ in range(int(d * 14)):
        i0 = int(rng.random() * max(0.0, d - 0.1) * SR)
        b = chirp(rng.uniform(380, 520), rng.uniform(800, 1300), 0.05, 2) * np.exp(-T(0.05) / 0.015)
        s[i0 : i0 + len(b)] += b * 0.3
    return s * np.minimum(1, t / 0.15) * np.minimum(1, (d - t) / 0.25)


def fizz(d):
    t = T(d)
    n = len(t)
    imp = (rng.random(n) < 0.012 * np.exp(-t / (d * 0.6))) * rng.standard_normal(n)
    return filt(imp, "hp", 4200) * 0.7


def shaker(k=4, per=0.16):
    d = k * per + 0.2
    out = np.zeros(int(d * SR))
    for i in range(k):
        i0 = int(i * per * SR)
        b = filt(noise(0.12), "bp", [2200, 9000]) * np.exp(-T(0.12) / 0.03)
        b += ice(3, 0.12) * 0.25
        out[i0 : i0 + len(b)] += b
    return out


# --- puzzle
def kick():
    d = 0.5
    t = T(d)
    s = filt(noise(d), "bp", [250, 1500]) * np.exp(-t / 0.025) * 1.4
    s += filt(noise(d), "bp", [1200, 4500]) * np.exp(-t / 0.18) * 0.18 * (t > 0.03)
    s += np.sin(2 * np.pi * 95 * t) * np.exp(-t / 0.05) * 0.6
    return s


def rustle(d=0.2):
    t = T(d)
    imp = (rng.random(len(t)) < 0.03) * rng.standard_normal(len(t))
    return filt(imp, "bp", [1500, 7000]) * np.sin(np.pi * t / d) + filt(noise(d), "bp", [2000, 6000]) * 0.05 * np.sin(np.pi * t / d)


def wallchime(f=880):
    d = 2.2
    t = T(d)
    s = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t / dc) for m, dc, a in ((1, 0.9, 1), (2.76, 0.5, 0.35), (5.4, 0.25, 0.15)))
    s *= 1 + 0.15 * np.sin(2 * np.pi * 3.2 * t)
    bloop = chirp(950, 620, 0.12, 2) * np.exp(-T(0.12) / 0.04)
    s[: len(bloop)] += bloop * 0.8
    thunk = np.sin(2 * np.pi * 120 * t) * np.exp(-t / 0.05) * 0.8
    return s * 0.6 + thunk


def pad(notes, d, attack=1.0, release=1.0, bright=1800, detune=6):
    t = T(d)
    out = np.zeros((2, len(t)))
    for j, f in enumerate(notes):
        for side, cents in ((0, -detune), (1, detune)):
            ff = f * 2 ** (cents / 1200)
            vib = 1 + 0.0012 * np.sin(2 * np.pi * (0.13 + 0.03 * j) * t + j)
            ph = 2 * np.pi * np.cumsum(ff * vib) / SR
            out[side] += sum(np.sin(h * ph + j * h) / h**1.7 for h in range(1, 7))
    out /= len(notes) * 2
    e = np.minimum(1, t / attack) * np.minimum(1, np.maximum(0, d - t) / release)
    out *= e**1.5
    for s in (0, 1):
        out[s] = filt(out[s], "lp", bright)
    return out


# ============================================================================= COMPOSITION
NOTE = lambda n: 440 * 2 ** ((n - 69) / 12)  # midi -> Hz

# --- nappes harmoniques (rêve) : Dmaj9 -> Gmaj9 -> Em9 -> A(add9) -> tension -> Dmaj9
chords = [
    (0.0, THR + 0.3, [45, 52, 57, 64], 700, 0.9),  # avant la porte : sombre
    (THR - 0.2, VIS[1][0] + 0.3, [50, 57, 62, 66, 69, 76], 1900, 1.0),
    (VIS[1][0] - 0.3, VIS[2][0] + 0.3, [43, 55, 59, 62, 66, 69], 1900, 1.0),
    (VIS[2][0] - 0.3, VIS[3][0] + 0.3, [40, 52, 55, 59, 62, 66], 1800, 1.0),
    (VIS[3][0] - 0.3, CUES["stumble"] + 0.15, [45, 57, 61, 64, 71, 76], 2000, 1.0),
    (CUES["stumble"] - 0.05, press + 0.15, [45, 57, 62, 64], 1100, 0.8),
    (press - 0.03, DUR, [38, 50, 57, 62, 66, 69, 76], 2800, 1.25),
]
for a, b, notes, br, g in chords:
    place(pad([NOTE(n) for n in notes], b - a, attack=0.9 if a > 0 else 1.6, release=0.8, bright=br), a, gain=0.15 * g, rv=0.45, bus="dream")

# souffle d'ambiance
air = filt(noise(DUR), "bp", [250, 2200]) * 0.025 * np.minimum(1, T(DUR) / 1.2)
place(np.stack([air, np.roll(air, 1500)]), 0.0, gain=0.7, rv=0.1, bus="dream")

# --- pas (talon au point bas du balancement de tête), jusqu'au trébuchement
k = 0
while True:
    ts = (k + 0.5) / 1.7
    k += 1
    if ts < 0.8:
        continue
    if ts > CUES["stumble"] - 0.15:
        break
    soft = 1.0 if ts < THR else 0.75
    place(footstep(soft), ts, pan=0.15 if k % 2 else -0.15, gain=0.32 if ts < THR else 0.24, rv=0.35)

# --- porte
place(latch(), CUES["doorOpen"] - 0.08, pan=0.1, gain=0.35, rv=0.3)
place(creak(1.0), CUES["doorOpen"] + 0.02, pan=-0.2, gain=0.1, rv=0.35)
place(swell(1.3), THR - 1.25, gain=0.28, rv=0.4, bus="dream")
place(boom(2.2, 70, 38), THR, gain=0.32, rv=0.5, bus="dream")
place(shimmer(1.6, 70, env="decay"), THR, gain=0.12, rv=0.6, bus="dream")

# --- visions : apparition (scintillement), mouvement de tête (souffle), ambiance propre
for i, (a, b) in enumerate(VIS):
    side = -1 if i % 2 == 0 else 1
    place(whoosh(0.75, 250, 1400, 400, q=0.9, peak=0.45), a - 0.12, pan=side * 0.6, gain=0.22, rv=0.3)
    place(shimmer(1.1, 55), a - 0.05, pan=side * 0.7, gain=0.16, rv=0.6)
    place(whoosh(0.7, 300, 1200, 300, q=0.9, peak=0.5), b - 0.55, pan=-side * 0.3, gain=0.14, rv=0.3)
    place(shimmer(0.7, 40, env="decay")[::-1].copy(), b - 0.65, pan=side * 0.7, gain=0.08, rv=0.6)

# 1 — casino / escape game
a, b = VIS[0]
place(roulette(b - a - 0.2), a + 0.15, pan=-0.45, gain=0.22, rv=0.3)
place(chips(6, 2.2), a + 0.3, pan=-0.6, gain=0.2, rv=0.35)
place(clocktick(3, 0.75), a + 0.4, pan=-0.75, gain=0.16, rv=0.35)
# 2 — murder party / festival
a, b = VIS[1]
place(projector(b - a - 0.2), a + 0.1, pan=0.4, gain=0.18, rv=0.3)
for dt, pn in ((0.45, 0.8), (1.25, 0.3), (1.7, 0.7), (2.1, 0.5)):
    place(shutter(), a + dt, pan=pn, gain=0.22, rv=0.35)
place(clap(), a + 0.95 + 0.09, pan=0.2, gain=0.55, rv=0.4)
place(sting(1.3), a + 1.1, pan=0.3, gain=0.07, rv=0.6)
# 3 — undercover
a, b = VIS[2]
for dt in (0.25, 1.1, 1.95):
    place(heartbeat(), a + dt, gain=0.5, rv=0.25)
place(radio(b - a - 0.4), a + 0.3, pan=-0.6, gain=0.12, rv=0.3)
place(laserhum(b - a - 0.2), a + 0.1, pan=-0.3, gain=0.07, rv=0.3)
place(scan(0.9), a + 0.9, pan=-0.5, gain=0.12, rv=0.4)
# 4 — Exprnc. Food / cocktails
a, b = VIS[3]
place(pour(1.4), a + 0.3, pan=0.45, gain=0.22, rv=0.35)
place(ice(6, 2.2), a + 0.2, pan=0.6, gain=0.18, rv=0.4)
place(fizz(2.2), a + 0.3, pan=0.5, gain=0.25, rv=0.4)
place(shaker(4), a + 1.55, pan=0.7, gain=0.18, rv=0.35)

# --- trébuchement
st = CUES["stumble"]
place(kick(), st, pan=0.15, gain=0.6, rv=0.35)
place(whoosh(0.35, 400, 2200, 600, q=0.8, peak=0.3), st - 0.05, gain=0.18, rv=0.2)
place(footstep(1.3), st + 0.2, pan=-0.1, gain=0.45, rv=0.3)
place(shimmer(1.0, 50), CUES["lookDown"], gain=0.1, rv=0.6)

# --- ramassage et pose sur le mur invisible
for i, (p0, p1) in enumerate(PICK):
    place(rustle(0.22), p0 + 0.02, pan=0.1, gain=0.35, rv=0.25)
    place(whoosh(0.6, 300, 1600, 500, q=0.9, peak=0.5), p0 + 0.25, pan=0.1, gain=0.16, rv=0.3)
    place(wallchime([880, 987.8, 1174.7][i]), p1, pan=[-0.35, 0.0, 0.35][i], gain=0.32, rv=0.55)
    if i > 0:
        place(click(1.1 + 0.15 * i), p1 + 0.005, pan=[-0.35, 0.0, 0.35][i], gain=0.55, rv=0.3)
        place(shimmer(0.5, 40, env="decay"), p1 + 0.02, pan=[-0.35, 0.0, 0.35][i], gain=0.1, rv=0.5)

# --- « clac » final + accord
place(boom(3.2), press, gain=0.55, rv=0.45)
place(click(1.4), press, gain=0.45, rv=0.3)
place(chime([NOTE(n) for n in (74, 78, 81, 86, 90)], d=3.5, decay=1.4), press + 0.005, gain=0.3, rv=0.65)
place(shimmer(1.2, 60), CUES["sweep"], pan=0.0, gain=0.12, rv=0.6)
place(chime([NOTE(86), NOTE(93)], d=2.0, decay=0.8), CUES["tagline"] + 0.1, gain=0.08, rv=0.7)

# ============================================================================= réverbs + master
def make_ir(rt60, d, pre, lp):
    t = T(d)
    out = []
    for _ in range(2):
        n = rng.standard_normal(len(t)) * np.exp(-6.9 * t / rt60)
        n = filt(n, "lp", lp)
        n[: int(pre * SR)] = 0
        out.append(n / np.sqrt(np.sum(n**2)))
    return out


mix_ = dry.copy()
for bus, (rt, d, pre, lp, g) in ((room, (0.7, 1.2, 0.008, 7000, 0.6)), (dream, (3.6, 5.0, 0.03, 5500, 0.95))):
    ir = make_ir(rt, d, pre, lp)
    for c in range(2):
        mix_[c] += signal.fftconvolve(bus[c], ir[c])[:N] * g

hp = sos("hp", 30, 2)
for c in range(2):
    mix_[c] = signal.sosfilt(hp, mix_[c])
    mix_[c] -= 0.3 * filt(mix_[c], "lp", 110)
fade = np.ones(N)
f0 = int((DUR - 1.4) * SR)
fade[f0:] = np.cos(np.linspace(0, np.pi / 2, N - f0)) ** 2
fade[: int(0.3 * SR)] = np.linspace(0, 1, int(0.3 * SR))
mix_ *= fade
mix_ /= np.abs(mix_).max()
drive = 2.0
mix_ = np.tanh(mix_ * drive) / np.tanh(drive)
st_ = (mix_.T * 10 ** (-1.0 / 20)).clip(-1, 1)
pcm = (st_ * 32767).astype("<i2")
out = ROOT / "output" / "audio.wav"
out.parent.mkdir(exist_ok=True)
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("audio écrit :", out, f"({DUR:.1f} s)")
