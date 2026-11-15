# Rhythm! 🎵⚡

A **Friday Night Funkin'**-inspired 4-key arcade rhythm battle game where **randomized beat-locked horizontal bars** scroll **downward** toward your **D · F · J · K** catcher bars—complete with difficulty selection, procedural WebAudio funk backing + vocal synths, tug-of-war health bar, and a strict **No-Spam Engine**.

## Features

- **4-Lane Downscroll Bar Highway (`D` `F` `J` `K`)**:
  - Notes and receptors are sleek neon **horizontal bars** (with vertical hold-sustain bar trails) scrolling **downward** toward the bottom catcher line.
- **Randomized Beat-Quantized Charts**:
  - Every run generates a fresh, musical 4-key chart (single grooves, stairs, alternating trills, double-bar chord jumps, and hold sustains) locked to a sample-accurate WebAudio clock.
- **Difficulty Selection Menu + Two Modes**:
  - **EASY** (*Chill Groove* — `108 BPM`, readable single bars)
  - **NORMAL** (*Funkin' Flow* — `132 BPM`, syncopated 8ths, chord jumps & holds)
  - **HARD** (*Neon Overdrive* — `158 BPM`, fast 16th stairs, trills & chords)
  - **INSANE** (*Hypernova Boss* — `184 BPM`, high-velocity technical 4K streams)
  - Play **Stage Battle** (survive and clear the track) or **Endless Groove** (infinite randomized bars).
- **Strict Anti-Spam Mechanics**:
  - **No Ghost Tapping**: Pressing `D`, `F`, `J`, or `K` when no note is in the catch window triggers an immediate **GHOST WHIFF** (resets combo, deducts score & health, and lowers accuracy).
  - **OS Key-Repeat Filtering**: Holding a key down never auto-fires hits.
  - **Bar Jam Lockout**: Mashing empty keys (`3+` whiffs in `0.68s` on a lane, or `5+` across lanes) overheats the **Anti-Spam Meter** and **jams** the spammed catcher bar(s) for `0.55s` with an additional health penalty.
- **Zero External Asset Dependencies**:
  - Procedural WebAudio drum breakbeats, slap-synth bassline, chord stabs, and formant-filtered FNF-style Rival & Player vocal synths.

## Controls

| Key | Action |
| :--- | :--- |
| `D` `F` `J` `K` | Activate Lanes 1–4 Catcher Bars (tap for normal bars, hold for sustain trails) |
| `1`–`4` / Arrow Keys | Select Difficulty on Menu |
| `Enter` / `Space` | Start Selected Track |
| `Esc` | Pause / Resume |
| `R` | Quick Retry (generates a brand-new randomized chart) |
| `M` | Mute / Unmute Sound |

## Run Locally

```bash
npm install
npm run dev
```

Build production bundle:

```bash
npm run build
```
