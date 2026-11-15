# Rhythm! 🎵⚡

A **Friday Night Funkin'**-inspired 4-key arcade rhythm battle game styled with glossy 3D pill & squircle UI, where **randomized beat-locked horizontal bars** scroll **downward** toward your **D · F · J · K** catcher bars—synced to randomly selected tracks by **Creo**.

## Music Credits — Creo 🎷

All music featured in **Rhythm!** is composed and produced by **[Creo](https://creo-music.com)**:

- **Creo — Sphere** ([Newgrounds #739991](https://www.newgrounds.com/audio/listen/739991)) — `100 BPM`
- **Creo — Lost** ([Newgrounds #1237702](https://www.newgrounds.com/audio/listen/1237702)) — `144 BPM`
- **Creo — Dimension** ([Newgrounds #709578](https://www.newgrounds.com/audio/listen/709578)) — `115 BPM`
- **Creo — Epilogue** ([Newgrounds #723714](https://www.newgrounds.com/audio/listen/723714)) — `160 BPM`

Official links: [creo-music.com](https://creo-music.com) · [Creo on Newgrounds](https://creo.newgrounds.com) · [Creo on YouTube](https://www.youtube.com/@creomusic)

## Features

- **Random Song Selection Across 4 Creo Tracks**:
  - Every run randomly selects one of Creo's 4 songs and generates a fresh 4-key chart locked to that song's exact BPM, beat offset, and audio energy envelope, with live WebAudio sub-bass speaker & camera pulses.
- **4-Lane Downscroll Bar Highway (`D` `F` `J` `K`)**:
  - Glossy 3D horizontal bars and hold-sustain ribbons scroll downward toward the four bottom catcher bars.
- **Difficulty Selection Menu + Two Modes**:
  - **Easy**, **Normal**, **Hard**, and **Insane** difficulties in either **Stage Battle** or **Endless** mode.
- **Strict Anti-Spam Mechanics**:
  - **No Ghost Tapping**: Pressing `D`, `F`, `J`, or `K` with no note in the catch window triggers an immediate **Ghost Whiff** (resets combo, deducts score & health, and lowers accuracy).
  - **OS Key-Repeat Filtering**: Holding a key down never auto-fires extra hits.
  - **Bar Jam Lockout**: Rapid empty-lane mashing fills the **No-Spam Guard** meter and temporarily **jams** the spammed catcher bar(s) with an extra health penalty.
- **Full Customization Settings (Persisted in `localStorage`)**:
  - **Note Shapes**: Switch between **Glossy Bar**, **Jelly Orb**, **Crystal Gem**, and **Funk Arrow** (`◀ ▼ ▲ ▶`) with a live animated 4-lane preview.
  - **Note Color Palettes**: Choose from **Candy Classic**, **Cyber Neon**, **Pastel Pop**, **Solar Sunset**, or **2-Hand Split**.
  - **Independent Volume Controls**: Real-time sliders for **Master Volume**, **Music Volume (Creo)**, and **Hit SFX Volume**.
  - **Dark & Light Modes**: Switch between **Dark Slate** and **Light Cloud** themes across both UI menus and gameplay canvas.

## Controls

| Key | Action |
| :--- | :--- |
| `D` `F` `J` `K` | Activate Lanes 1–4 Catcher Bars (tap for normal bars, hold for sustain trails) |
| `1`–`4` / Arrow Keys | Select Difficulty on Menu |
| `Enter` / `Space` | Start Selected Track |
| `Esc` | Pause / Resume |
| `R` | Quick Retry (randomly selects a Creo song & generates a new chart) |
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
