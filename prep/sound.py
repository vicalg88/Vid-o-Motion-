"""
Sound design procédural pour la vidéo Exprnc. (10 s, stéréo 48 kHz).
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
DUR = 10.0
N = int(SR * DUR)
rng = np.random.default_rng(7)

# ----------------------------------------------------------------------------- CUES depuis timeline.js
src = (ROOT / "src" / "timeline.js").read_text()
ACT2 = float(re.search(r"export const ACT2 = ([\d.]+)", src).group(1))
block = re.search(r"export const CUES = \{(.*?)\};", src, re.S).group(1)
CUES = {}
for k, v in re.findall(r"(\w+):\s*(\[[^\]]*\]|[\w.]+)", block):
    v = v.replace("ACT2", str(ACT2))
    CUES[k] = [float(x) for x in v.strip("[]").split(",")] if v.startswith("[") else float(v)

# ----------------------------------------------------------------------------- bus
dryL = np.zeros(N)
dryR = np.zeros(N)
sendL = np.zeros(N)
sendR = np.zeros(N)


def place(sig, t0, pan=0.0, gain=1.0, send=0.25):
    """Place un son mono (ou (2,n) stéréo) à t0 avec panoramique à puissance constante."""
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    if sig.ndim == 1:
        th = (pan + 1) * math.pi / 4
        st = np.stack([sig * math.cos(th), sig * math.sin(th)]) * math.sqrt(2)
    else:
        st = sig
    if i0 < 0:
        st = st[:, -i0:]
        i0 = 0
    n = min(st.shape[1], N - i0)
    st = st[:, :n] * gain
    dryL[i0 : i0 + n] += st[0]
    dryR[i0 : i0 + n] += st[1]
    sendL[i0 : i0 + n] += st[0] * send
    sendR[i0 : i0 + n] += st[1] * send


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
    """Filtre à variables d'état (TPT) à fréquence variable échantillon par échantillon."""
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


def env_ar(d, a, r_shape=3.0):
    t = T(d)
    e = np.where(t < a, (t / max(a, 1e-6)) ** 2, np.exp(-(t - a) / max(d - a, 1e-6) * r_shape))
    return e


def chirp(f0, f1, d, curve=4.0):
    t = T(d)
    f = f1 + (f0 - f1) * np.exp(-t / (d / curve))
    return np.sin(2 * np.pi * np.cumsum(f) / SR), f


# ----------------------------------------------------------------------------- instruments
def tick(freq=4200, d=0.03):
    t = T(d)
    s = np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.006)
    s += filt(noise(d), "hp", 5000) * np.exp(-t / 0.002) * 0.4
    return s


def whoosh(d, f0, f1, f2=None, q=1.2, peak=0.6, amp_shape=2.0, am=0.0, am_rate=0.0):
    t = T(d)
    u = t / d
    if f2 is None:
        fc = f0 * (f1 / f0) ** u
    else:
        fc = np.where(u < peak, f0 * (f1 / f0) ** (u / peak), f1 * (f2 / f1) ** ((u - peak) / (1 - peak)))
    x = noise(d)
    y = svf(x, fc, q, "bp") * 0.7 + svf(x, fc * 0.5, 0.6, "lp") * 0.3
    e = np.where(u < peak, (u / peak) ** amp_shape, ((1 - u) / (1 - peak)) ** (amp_shape * 0.8))
    if am:
        e *= 1 - am * 0.5 * (1 + np.sin(2 * np.pi * am_rate * t * (1 + 0.6 * u)))
    return y * e


def thump(f_hi=95, f_lo=42, d=0.6, body=0.6, slap=0.35, slap_f=2400):
    t = T(d)
    s, _ = chirp(f_hi, f_lo, d, curve=6)
    s *= np.exp(-t / 0.16)
    b = filt(noise(d), "bp", [180, 900]) * np.exp(-t / 0.045) * body
    sl = filt(noise(d), "bp", [slap_f, slap_f * 2.8]) * np.exp(-t / 0.01) * slap
    return s + b + sl


def click(d=0.25, bright=1.0):
    t = T(d)
    tr = filt(noise(d), "bp", [2500, 9000]) * np.exp(-t / 0.0035) * 0.9 * bright
    res = (
        np.sin(2 * np.pi * 1900 * t) * np.exp(-t / 0.022) * 0.55
        + np.sin(2 * np.pi * 2870 * t) * np.exp(-t / 0.016) * 0.35
        + np.sin(2 * np.pi * 4100 * t) * np.exp(-t / 0.01) * 0.2
    )
    body = np.sin(2 * np.pi * 165 * t) * np.exp(-t / 0.05) * 0.7
    return tr + res * 0.6 + body


def woodblock(f=1150, d=0.4):
    t = T(d)
    s = np.sin(2 * np.pi * f * t * (1 - 0.02 * t)) * np.exp(-t / 0.05)
    s += np.sin(2 * np.pi * f * 2.13 * t) * np.exp(-t / 0.025) * 0.4
    s += filt(noise(d), "bp", [800, 3000]) * np.exp(-t / 0.004) * 0.5
    s += np.sin(2 * np.pi * 120 * t) * np.exp(-t / 0.06) * 0.5
    return s


def slice_fx(d=0.42, f0=2200, f1=6200):
    t = T(d)
    u = t / d
    fc = f0 * (f1 / f0) ** u
    x = noise(d)
    sizzle = svf(x, fc, 3.0, "bp") * (0.6 + 0.4 * np.sin(2 * np.pi * 63 * t))
    zing = np.sin(2 * np.pi * np.cumsum(fc * 0.55 + 30 * np.sin(2 * np.pi * 9 * t)) / SR) * 0.25
    e = np.minimum(1, u * 12) * (1 - u) ** 0.6
    return (sizzle + zing) * e


def crackle(d=0.12, density=0.25, f=(1500, 5000)):
    n = int(d * SR)
    imp = (rng.random(n) < density / 50) * rng.standard_normal(n)
    t = T(d)
    s = filt(imp, "bp", list(f)) * np.exp(-t / (d / 3))
    s += filt(noise(d), "bp", list(f)) * np.exp(-t / 0.01) * 0.4
    return s


def hiss(d=0.9, f=4500):
    t = T(d)
    n = int(d * SR)
    dens = np.exp(-t / 0.25)
    imp = (rng.random(n) < 0.02 * dens) * rng.standard_normal(n)
    return filt(imp, "hp", f) * 0.8 + filt(noise(d), "hp", f + 1500) * dens * 0.08


def riser(d=2.1, f0=180, f1=9000):
    t = T(d)
    u = t / d
    fc = f0 * (f1 / f0) ** (u ** 1.6)
    x = noise(d)
    nz = svf(x, fc, 1.4, "bp")
    p0, p1 = 110, 440
    pitch = p0 * (p1 / p0) ** (u ** 1.8)
    tone = sum(np.sin(2 * np.pi * np.cumsum(pitch * (1 + det)) / SR) / (i + 1) for i, det in enumerate([0, 0.006, -0.005, 0.5005]))
    e = (u ** 2.4) * np.minimum(1, (1 - u) * 60)
    return (nz * 0.8 + tone * 0.18) * e


def boom(d=2.8):
    t = T(d)
    s, _ = chirp(88, 31, d, curve=5)
    s *= np.exp(-t / 0.75)
    s += filt(noise(d), "lp", 160) * np.exp(-t / 0.2) * 1.6
    s += filt(noise(d), "bp", [400, 2400]) * np.exp(-t / 0.03) * 0.5
    return s


def chime(freqs, d=3.2, decay=1.1, detune=0.0025):
    t = T(d)
    out = np.zeros((2, len(t)))
    for i, f in enumerate(freqs):
        for side, dt in ((0, -detune), (1, detune)):
            ff = f * (1 + dt * (1 if i % 2 else -1))
            v = np.sin(2 * np.pi * ff * t) + 0.18 * np.sin(2 * np.pi * ff * 2.01 * t) * np.exp(-t / 0.3)
            v *= np.exp(-t / (decay * (1 - i * 0.08))) * np.minimum(1, t / 0.004)
            out[side] += v / len(freqs)
    return out


def pad(notes, d, attack=1.2, release=1.0, bright=1600):
    t = T(d)
    out = np.zeros((2, len(t)))
    for j, f in enumerate(notes):
        for side, cents in ((0, -5), (1, 6)):
            ff = f * 2 ** (cents / 1200)
            vib = 1 + 0.0012 * np.sin(2 * np.pi * (0.13 + 0.03 * j) * t + j)
            ph = 2 * np.pi * np.cumsum(ff * vib) / SR
            v = sum(np.sin(h * ph + j * h) / h ** 1.7 for h in range(1, 7))
            out[side] += v
    out /= len(notes) * 2
    e = np.minimum(1, t / attack) * np.minimum(1, (d - t) / release)
    out *= e ** 1.5
    for s in (0, 1):
        out[s] = filt(out[s], "lp", bright)
    return out


def hum(d=0.6, f=110):
    t = T(d)
    s = sum(np.sin(2 * np.pi * f * h * t) / h for h in (1, 2, 3, 5))
    am = 0.6 + 0.4 * np.sin(2 * np.pi * 31 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 3.3 * t))
    e = np.minimum(1, t / (d * 0.7)) * np.minimum(1, (d - t) / 0.08)
    return s * am * e


def shine(d=1.0):
    t = T(d)
    u = t / d
    fc = 3000 * (9500 / 3000) ** u
    nz = svf(noise(d), fc, 4.0, "bp")
    tw = sum(np.sin(2 * np.pi * f * t) * (0.5 + 0.5 * np.sin(2 * np.pi * (7 + i) * t)) for i, f in enumerate([6270, 7040, 8370]))
    e = np.sin(np.pi * u) ** 2
    return (nz * 0.7 + tw * 0.05) * e


# ----------------------------------------------------------------------------- ACTE 1
# nappe d'ambiance (Ré mineur 9) qui se résout en Ré majeur 9 au « clac » final
press = CUES["press"]
dm9 = [146.83, 174.61, 220.0, 261.63, 329.63]
dmaj9 = [146.83, 185.0, 220.0, 277.18, 329.63, 440.0]
place(pad(dm9, press + 0.25, attack=1.6, release=0.35, bright=1800), 0.0, gain=0.17, send=0.35)
place(pad(dmaj9, DUR - press + 0.1, attack=0.06, release=1.4, bright=3000), press - 0.02, gain=0.16, send=0.5)

# souffle d'air léger
air = filt(noise(DUR), "bp", [300, 2500]) * 0.03
air *= np.minimum(1, T(DUR) / 1.0)
place(np.stack([air, np.roll(air, 900)]), 0.0, gain=0.6, send=0.1)

# lettres « Expérience » : petits ticks + montée
for i in range(10):
    t0 = CUES["lettersIn"] + i * 0.055 + 0.07
    place(tick(3300 + i * 140), t0, pan=-0.6 + i * 0.13, gain=0.18, send=0.35)
place(whoosh(1.0, 300, 2400, 900, peak=0.35), CUES["lettersIn"] - 0.15, gain=0.3, send=0.3)

# chute des voyelles
for k in range(4):
    t0 = CUES["vowelsDrop"] + k * 0.075
    s, _ = chirp(1300 - k * 90, 160, 0.55, curve=2.5)
    s *= env_ar(0.55, 0.01, 4)
    place(s, t0, pan=[-0.25, 0.05, 0.2, 0.62][k], gain=0.1, send=0.4)
    place(whoosh(0.55, 2500, 300, q=0.9, peak=0.15), t0, pan=[-0.25, 0.05, 0.2, 0.62][k], gain=0.24, send=0.2)

# resserrement des consonnes
place(whoosh(0.5, 600, 3000, 800, peak=0.45, q=1.5), CUES["closeUp"] - 0.05, gain=0.34, send=0.25)
place(thump(120, 60, 0.4, body=0.3, slap=0.15), CUES["closeUp"] + 0.36, gain=0.25, send=0.2)

# le point tombe : « toc » + petits rebonds
place(whoosh(0.28, 1200, 3500, q=1.2, peak=0.9), CUES["dotLand"] - 0.26, pan=0.35, gain=0.1)
place(woodblock(1150), CUES["dotLand"], pan=0.35, gain=0.5, send=0.35)
place(woodblock(1240, 0.2), CUES["dotLand"] + 0.095, pan=0.35, gain=0.1, send=0.3)
place(woodblock(1290, 0.15), CUES["dotLand"] + 0.19, pan=0.35, gain=0.04, send=0.3)

# découpe laser x2
place(slice_fx(0.42), CUES["cut1"], pan=-0.15, gain=0.22, send=0.3)
place(slice_fx(0.42, 2600, 7000), CUES["cut2"], pan=0.12, gain=0.2, send=0.3)
# séparation : craquement
place(crackle(0.14), 3.79, pan=0.0, gain=0.45, send=0.25)
# chute des morceaux hors champ
place(whoosh(0.5, 3000, 220, q=0.8, peak=0.1), 3.86, gain=0.45, send=0.2)

# ----------------------------------------------------------------------------- ACTE 2
# impacts au sol (une pièce après l'autre)
for i, (tl, pan) in enumerate(zip(CUES["land"], [-0.5, 0.05, 0.55])):
    place(thump(100 - i * 6, 48, 0.8, body=1.1, slap=0.7), tl, pan=pan, gain=[0.6, 0.5, 0.55][i], send=0.3)
    place(hiss(0.9), tl + 0.01, pan=pan, gain=0.4, send=0.2)
place(boom(1.6) * 0.5, CUES["land"][0], gain=0.25, send=0.35)

# tension : bourdonnement « magnétique » + montée
place(hum(CUES["lift"][1] - CUES["tremble"] + 0.15, 98), CUES["tremble"], gain=0.05, send=0.3)
place(riser(press - CUES["tremble"]), CUES["tremble"], gain=0.3, send=0.35)

# envols
for i, pan in zip(range(3), [-0.45, 0.0, 0.5]):
    lt, lk = CUES["lift"][i], CUES["lock"][i]
    d = lk - lt
    if i == 1:  # tonneau
        w = whoosh(d, 250, 2200, 500, peak=0.5, q=1.0, am=0.7, am_rate=4.5)
    elif i == 2:  # pirouette
        w = whoosh(d, 300, 2600, 600, peak=0.55, q=1.1, am=0.8, am_rate=6.0)
    else:
        w = whoosh(d, 220, 1800, 450, peak=0.5, q=0.9)
    place(w, lt, pan=pan, gain=0.36, send=0.3)

# emboîtements
place(thump(140, 70, 0.4, body=0.5, slap=0.25), CUES["lock"][1], pan=0.0, gain=0.45, send=0.25)
place(click(), CUES["lock"][0], pan=-0.3, gain=0.75, send=0.3)
place(click(bright=1.2), CUES["lock"][2], pan=0.35, gain=0.8, send=0.3)
for tl, pan in ((CUES["lock"][0], -0.3), (CUES["lock"][2], 0.35)):
    place(chime([3136, 4186], d=0.6, decay=0.18), tl + 0.01, gain=0.08, send=0.5)

# « CLAC » final : boom + accord cristallin
place(boom(2.8), press, gain=0.6, send=0.4)
place(click(0.3, bright=1.4), press, gain=0.6, send=0.3)
place(chime([587.33, 739.99, 880.0, 1174.66, 1479.98], d=3.0, decay=1.25), press + 0.005, gain=0.33, send=0.6)

# reflet balayant
place(shine(0.95), CUES["sweep"], gain=0.14, send=0.5)
place(np.stack([np.linspace(1, 0, int(0.95 * SR)), np.linspace(0, 1, int(0.95 * SR))]) * shine(0.95), CUES["sweep"], gain=0.06, send=0.4)

# signature
place(chime([1174.66, 1760.0], d=1.8, decay=0.7), CUES["tagline"] + 0.1, gain=0.08, send=0.6)

# ----------------------------------------------------------------------------- réverbération (IR synthétique)
def make_ir(rt60=1.9, d=2.6, pre=0.018):
    t = T(d)
    irs = []
    for s in range(2):
        n = rng.standard_normal(len(t)) * np.exp(-6.9 * t / rt60)
        n = filt(n, "lp", 6500)
        n[: int(pre * SR)] = 0
        irs.append(n / np.sqrt(np.sum(n**2)))
    return irs


irL, irR = make_ir()
wetL = signal.fftconvolve(sendL, irL)[:N]
wetR = signal.fftconvolve(sendR, irR)[:N]
mixL = dryL + wetL * 0.9
mixR = dryR + wetR * 0.9
hp = sos("hp", 30, 2)
mixL = signal.sosfilt(hp, mixL)
mixR = signal.sosfilt(hp, mixR)
lowL = filt(mixL, "lp", 110)
lowR = filt(mixR, "lp", 110)
mixL -= 0.35 * lowL
mixR -= 0.35 * lowR

# fondu de fin + limiteur doux
fade = np.ones(N)
fs0 = int(9.2 * SR)
fade[fs0:] = np.cos(np.linspace(0, np.pi / 2, N - fs0)) ** 2
mixL *= fade
mixR *= fade
pk = max(np.abs(mixL).max(), np.abs(mixR).max())
mixL /= pk
mixR /= pk
drive = 2.0
mixL = np.tanh(mixL * drive) / np.tanh(drive)
mixR = np.tanh(mixR * drive) / np.tanh(drive)
gain = 10 ** (-1.0 / 20)
st = np.stack([mixL, mixR], 1) * gain
pcm = (np.clip(st, -1, 1) * 32767).astype("<i2")
out = ROOT / "output" / "audio.wav"
out.parent.mkdir(exist_ok=True)
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("audio écrit :", out, "| CUES:", CUES)
