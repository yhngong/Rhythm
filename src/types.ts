export type DifficultyId =
  | 'easy'
  | 'normal'
  | 'hard'
  | 'insane'
  | 'psychopath'
  | 'impossible';

export type LaneCount = 4 | 6;

export type LaneIndex = 0 | 1 | 2 | 3 | 4 | 5;

export type GameMode = 'stage' | 'endless';

export type ScreenState = 'menu' | 'countdown' | 'playing' | 'paused' | 'results' | 'gameover';

export type Judgment = 'SICK' | 'GOOD' | 'BAD' | 'SHIT' | 'MISS' | 'SPAM';

export interface DifficultyConfig {
  id: DifficultyId;
  name: string;
  subtitle: string;
  laneCount: LaneCount;
  bpm: number;
  scrollSpeed: number; // pixels per second downward
  measures: number; // 4/4 measures in Stage mode
  accentColor: string;
  badgeText: string;
  description: string;
  // Pattern generation tuning
  stepSubdivision: 2 | 4; // per beat: 2 = 8th notes, 4 = 16th notes
  baseDensity: number; // probability of note on active subdivision
  chordChance: number; // probability of simultaneous 2-bar jump
  tripleChordChance?: number; // probability of simultaneous 3-bar chord in 6K modes
  holdChance: number; // probability of sustain bar tail
  burstChance: number; // probability of short 16th stream/stair phrase
  minSameLaneSteps: number; // prevents unfair inhumane single-finger jack spam
  // Health tuning (0..100, starts at 50 like FNF tug-of-war!)
  missHpPenalty: number;
  whiffHpPenalty: number;
  sickHpGain: number;
  goodHpGain: number;
}

export interface NoteBar {
  id: number;
  lane: LaneIndex;
  time: number; // target catch timestamp in seconds
  duration: number; // 0 for tap bar, >0 for hold sustain bar
  midiPitch: number; // musical pitch triggered on hit/playback
  hit: boolean;
  missed: boolean;
  holding: boolean;
  holdCompleted: boolean;
  holdReleasedEarly: boolean;
  lastHoldTickTime: number;
}

export interface RivalNote {
  lane: LaneIndex;
  time: number;
  duration: number;
  midiPitch: number;
  triggered: boolean;
}

export interface FloatingPopup {
  text: string;
  subtext?: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  lifetime: number;
  scale: number;
}

export interface HitParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  age: number;
  lifetime: number;
}

export interface RunStats {
  score: number;
  combo: number;
  maxCombo: number;
  hp: number; // 0..100 (50 = balanced center, 100 = player dominating, 0 = KO)
  counts: {
    SICK: number;
    GOOD: number;
    BAD: number;
    SHIT: number;
    MISS: number;
    SPAM: number; // empty-lane ghost whiffs + jam penalties
  };
  totalJudgedWeight: number;
  totalJudgedEvents: number;
}

export interface HighScoreEntry {
  bestScore: number;
  bestAccuracy: number;
  bestGrade: string;
  maxCombo: number;
  clears: number;
}
