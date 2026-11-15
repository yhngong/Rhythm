import { DifficultyConfig, DifficultyId } from './types';

export const LANE_KEYS = ['d', 'f', 'j', 'k'] as const;
export const LANE_LABELS = ['D', 'F', 'J', 'K'] as const;

export const LANE_COLORS = [
  { main: '#FF2E93', glow: '#FF7AC3', dark: '#520B2F', name: 'Magenta' }, // D
  { main: '#00E5FF', glow: '#8CF6FF', dark: '#053B47', name: 'Cyan' },    // F
  { main: '#2BFF88', glow: '#9EFFC6', dark: '#0A4725', name: 'Lime' },    // J
  { main: '#FFB800', glow: '#FFE184', dark: '#4F3700', name: 'Amber' },   // K
] as const;

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  easy: {
    id: 'easy',
    name: 'EASY',
    subtitle: 'Chill Groove',
    bpm: 108,
    scrollSpeed: 430,
    measures: 24,
    accentColor: '#2BFF88',
    badgeText: '108 BPM • 1/4 & 1/8 Bars',
    description: 'Clean single-bar rhythms and relaxed downward scroll speed to lock in your DFJK muscle memory.',
    stepSubdivision: 2,
    baseDensity: 0.56,
    chordChance: 0.0,
    holdChance: 0.16,
    burstChance: 0.0,
    minSameLaneSteps: 2,
    missHpPenalty: 7.0,
    whiffHpPenalty: 6.5,
    sickHpGain: 2.8,
    goodHpGain: 1.5,
  },
  normal: {
    id: 'normal',
    name: 'NORMAL',
    subtitle: "Funkin' Flow",
    bpm: 132,
    scrollSpeed: 565,
    measures: 32,
    accentColor: '#00E5FF',
    badgeText: '132 BPM • Syncopated & Jumps',
    description: 'Call-and-response funk phrases with crisp 8th-note syncopation, double-bar jumps, and sustain trails.',
    stepSubdivision: 4,
    baseDensity: 0.42,
    chordChance: 0.12,
    holdChance: 0.18,
    burstChance: 0.22,
    minSameLaneSteps: 3,
    missHpPenalty: 8.0,
    whiffHpPenalty: 7.8,
    sickHpGain: 2.5,
    goodHpGain: 1.3,
  },
  hard: {
    id: 'hard',
    name: 'HARD',
    subtitle: 'Neon Overdrive',
    bpm: 158,
    scrollSpeed: 710,
    measures: 40,
    accentColor: '#FFB800',
    badgeText: '158 BPM • 16th Stairs & Chords',
    description: 'Fast downward bar streams, rolling DFJK stairs, trills, and tight anti-spam precision demands.',
    stepSubdivision: 4,
    baseDensity: 0.56,
    chordChance: 0.18,
    holdChance: 0.16,
    burstChance: 0.48,
    minSameLaneSteps: 2,
    missHpPenalty: 9.0,
    whiffHpPenalty: 8.8,
    sickHpGain: 2.3,
    goodHpGain: 1.1,
  },
  insane: {
    id: 'insane',
    name: 'INSANE',
    subtitle: 'Hypernova Boss',
    bpm: 184,
    scrollSpeed: 860,
    measures: 48,
    accentColor: '#FF2E93',
    badgeText: '184 BPM • Technical 4K Streams',
    description: 'Relentless 16th-note funk-mania streams, alternating hand weaves, and high-velocity chord patterns.',
    stepSubdivision: 4,
    baseDensity: 0.72,
    chordChance: 0.22,
    holdChance: 0.14,
    burstChance: 0.74,
    minSameLaneSteps: 2,
    missHpPenalty: 10.0,
    whiffHpPenalty: 9.5,
    sickHpGain: 2.1,
    goodHpGain: 1.0,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['easy', 'normal', 'hard', 'insane'];
