# Original synthesized track for the promo: 120 BPM, 32 s, structure locked to the edit.
import numpy as np, wave, sys
SR = 48000; BPM = 120; B = 60 / BPM; DUR = 33.0
N = int(SR * DUR); L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(7)
t_ = lambda d: np.arange(int(SR * d)) / SR
def put(sig, at, gl=1.0, gr=None):
    gr = gl if gr is None else gr; i = int(at * SR); j = min(N, i + len(sig))
    if i >= N: return
    L[i:j] += sig[:j - i] * gl; R[i:j] += sig[:j - i] * gr
def lp(x, a):  # one-pole low-pass
    y = np.empty_like(x); s = 0.0
    for k in range(len(x)): s += a * (x[k] - s); y[k] = s
    return y
def kick(v=1.0):
    t = t_(0.45); f = 48 + 110 * np.exp(-t * 28); ph = 2 * np.pi * np.cumsum(f) / SR
    return v * (np.sin(ph) * np.exp(-t * 7.5) + 0.25 * np.exp(-t * 220) * rng.standard_normal(len(t)) * 0.3)
def clap(v=0.5):
    t = t_(0.28); n = rng.standard_normal(len(t)); env = np.exp(-t * 18) * (1 + 0.6 * (np.sin(2 * np.pi * 90 * t) > 0) * np.exp(-t * 60))
    x = n - lp(n, 0.25); return v * x * env
def hat(v=0.16, d=0.06):
    t = t_(d); n = rng.standard_normal(len(t)); x = n - lp(n, 0.5); return v * x * np.exp(-t * 70)
def saw(f, d):
    t = t_(d); return 2 * ((t * f) % 1) - 1
def bass(f, d, v=0.42):
    t = t_(d); x = 0.6 * saw(f, d) + 0.6 * np.sin(2 * np.pi * f * t); x = lp(x, 0.06)
    env = np.minimum(1, t * 200) * np.exp(-t * 2.2); return v * x * env
def stab(fs, d, v=0.13, a=0.18):
    t = t_(d); x = sum(saw(f * dt, d) for f in fs for dt in (0.997, 1.003)); x = lp(x, a)
    env = np.minimum(1, t * 120) * np.exp(-t * 5); return v * x * env / len(fs)
def pad(fs, d, v=0.07):
    t = t_(d); x = sum(saw(f * dt, d) for f in fs for dt in (0.993, 1.0, 1.007)); x = lp(x, 0.03)
    env = np.minimum(1, t / 0.4) * np.minimum(1, (d - t) / 0.4); return v * x * env / len(fs)
def pluck(f, v=0.16):
    t = t_(0.25); x = lp(saw(f, 0.25), 0.25) * np.exp(-t * 16); return v * x
def riser(d, v=0.22):
    t = t_(d); n = rng.standard_normal(len(t)); a = 0.02 + 0.5 * (t / d) ** 2
    y = np.empty_like(n); s = 0.0
    for k in range(len(n)): s += a[k] * (n[k] - s); y[k] = s
    return v * (y - lp(y, 0.01)) * (t / d) ** 1.5
def boom(v=0.9):
    t = t_(2.2); f = 34 + 60 * np.exp(-t * 6); ph = 2 * np.pi * np.cumsum(f) / SR
    n = rng.standard_normal(len(t)); return v * (np.sin(ph) * np.exp(-t * 1.6) + 0.35 * lp(n, 0.08) * np.exp(-t * 3))
def whoosh(d=0.35, v=0.12):
    t = t_(d); n = rng.standard_normal(len(t)); y = n - lp(n, 0.3); return v * y * np.sin(np.pi * t / d) ** 2
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
# chord progression (A minor feel): Am F C G, one chord per bar (2 s)
prog = [(45, [57, 60, 64]), (41, [57, 60, 65]), (48, [55, 60, 64]), (43, [55, 59, 62])]
def bar_chord(bar): return prog[bar % 4]
# --- intro 0-3 s: filtered arp + soft kick on beats 0..5
for k in range(6):
    put(kick(0.55), k * B)
for k in range(12):
    root, ch = bar_chord(k // 4); note = ch[k % 3] + 12
    put(pluck(hz(note), 0.13), k * B / 2, 0.8 if k % 2 else 1.0, 1.0 if k % 2 else 0.8)
put(riser(1.0, 0.18), 2.0)
# impact on the logo at 3.0
put(boom(0.85), 3.0)
# --- main groove 3-19 s
def groove(t0, t1, full=True):
    beat = 0; t = t0
    while t < t1 - 1e-6:
        bar = int(t // (4 * B)); root, ch = bar_chord(bar)
        put(kick(0.95), t)
        if beat % 2 == 1: put(clap(0.42), t, 0.9, 1.0)
        put(hat(0.12), t + B / 2, 0.7, 1.0); put(hat(0.07, 0.03), t + B / 4, 1.0, 0.7); put(hat(0.07, 0.03), t + 3 * B / 4, 0.8, 0.9)
        put(bass(hz(root), B * 0.45), t + B / 2)
        if full and beat % 4 in (0, 3): put(stab([hz(n) for n in ch], 0.3), t + (B / 2 if beat % 4 == 3 else 0), 0.9, 1.0)
        if full and beat % 2 == 0: put(pluck(hz(ch[(beat // 2) % 3] + 24), 0.06), t + 3 * B / 4, 1.0, 0.6)
        beat += 1; t += B
groove(3.0, 19.0)
for k in range(14): put(whoosh(0.25, 0.06), 5.0 + k * 1.0 - 0.12)
# --- breakdown 19-25: pads, light hats, no kick
for k in range(3):
    root, ch = bar_chord(k); put(pad([hz(n) for n in ch] + [hz(root + 12)], 2.0), 19.0 + k * 2.0)
    put(bass(hz(root), 1.6, 0.25), 19.0 + k * 2.0)
for k in range(24): put(hat(0.06, 0.04), 19.0 + k * B / 2 + B / 4, 0.8, 1.0)
for k in range(6): put(kick(0.35), 22.0 + k * B)
# --- build 25-28: snare roll + riser
put(riser(3.0, 0.26), 25.0)
n = 0; t = 25.0
while t < 28.0 - 1e-6:
    step = B / 2 if t < 26.5 else B / 4 if t < 27.5 else B / 8
    put(clap(0.18 + 0.2 * (t - 25) / 3), t); t += step
for k in range(6): put(kick(0.7), 25.0 + k * B)
# --- final 28-31.5 + boom ending
put(boom(0.75), 28.0); groove(28.0, 31.5)
put(boom(0.9), 31.5); put(stab([hz(n) for n in [57, 60, 64, 69]], 1.2, 0.18, 0.12), 31.5)
# master: soft clip, normalize to about -1 dBFS peak, fade tail
m = np.stack([L, R], 1); m = np.tanh(m * 1.15); m *= 0.89 / np.max(np.abs(m))
fade = int(0.6 * SR); m[-fade:] *= np.linspace(1, 0, fade)[:, None]
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((m * 32767).astype('<i2').tobytes())
print('ok', DUR)
