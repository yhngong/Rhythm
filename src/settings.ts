import { LaneCount } from './types';

export type NoteShape = 'bar' | 'circle' | 'diamond' | 'arrow';

export type NotePaletteId = 'candy' | 'neon' | 'pastel' | 'sunset' | 'mono';

export type ThemeMode = 'dark' | 'light';

export type ScrollDirection = 'down' | 'up';

export interface LaneColorSpec {
  top: string;
  main: string;
  bottom: string;
  lip: string;
  glow: string;
  dark: string;
  name: string;
}

export interface GameSettings {
  noteShape: NoteShape;
  notePalette: NotePaletteId;
  scrollDirection: ScrollDirection;
  masterVolume: number; // 0..1
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  themeMode: ThemeMode;
}

export const SETTINGS_STORAGE_KEY = 'rhythm_fnf_dfjk_settings_v1';

export const DEFAULT_SETTINGS: GameSettings = {
  noteShape: 'bar',
  notePalette: 'candy',
  scrollDirection: 'down',
  masterVolume: 0.82,
  musicVolume: 0.9,
  sfxVolume: 0.85,
  themeMode: 'dark',
};

export const NOTE_SHAPE_OPTIONS: readonly {
  id: NoteShape;
  name: string;
  badge: string;
}[] = [
  { id: 'bar', name: 'Glossy Bar', badge: 'Classic' },
  { id: 'circle', name: 'Jelly Orb', badge: 'Mania' },
  { id: 'diamond', name: 'Crystal Gem', badge: 'Prism' },
  { id: 'arrow', name: 'Funk Arrow', badge: 'FNF 4K/6K' },
];

const LIME: LaneColorSpec = {
  top: '#6FFF1F',
  main: '#3CE00E',
  bottom: '#1EB506',
  lip: '#127503',
  glow: '#B2FF78',
  dark: '#163812',
  name: 'Lime',
};
const CYAN: LaneColorSpec = {
  top: '#5CEEFF',
  main: '#14C8FF',
  bottom: '#0695E0',
  lip: '#045E9C',
  glow: '#AEF6FF',
  dark: '#102F45',
  name: 'Cyan',
};
const GOLD: LaneColorSpec = {
  top: '#FFE44D',
  main: '#FFB30F',
  bottom: '#ED8200',
  lip: '#9E4F00',
  glow: '#FFF099',
  dark: '#3D290A',
  name: 'Gold',
};
const BERRY: LaneColorSpec = {
  top: '#FF7096',
  main: '#FF3366',
  bottom: '#D91147',
  lip: '#8C082B',
  glow: '#FFB3C7',
  dark: '#3D1222',
  name: 'Berry',
};
const VIOLET: LaneColorSpec = {
  top: '#C77DFF',
  main: '#9333EA',
  bottom: '#6B16B8',
  lip: '#420978',
  glow: '#E7C6FF',
  dark: '#280C4A',
  name: 'Violet',
};
const TANGERINE: LaneColorSpec = {
  top: '#FFA447',
  main: '#FF6B1A',
  bottom: '#D64500',
  lip: '#8A2900',
  glow: '#FFD0A1',
  dark: '#3D1906',
  name: 'Tangerine',
};

export const NOTE_PALETTES: Record<
  NotePaletteId,
  {
    id: NotePaletteId;
    name: string;
    lanes: readonly [LaneColorSpec, LaneColorSpec, LaneColorSpec, LaneColorSpec];
    lanes6: readonly [
      LaneColorSpec,
      LaneColorSpec,
      LaneColorSpec,
      LaneColorSpec,
      LaneColorSpec,
      LaneColorSpec
    ];
  }
> = {
  candy: {
    id: 'candy',
    name: 'Candy Classic',
    lanes: [LIME, CYAN, GOLD, BERRY],
    lanes6: [VIOLET, LIME, CYAN, GOLD, BERRY, TANGERINE],
  },
  neon: {
    id: 'neon',
    name: 'Cyber Neon',
    lanes: [
      {
        top: '#D28BFF',
        main: '#A855F7',
        bottom: '#7E22CE',
        lip: '#4C1182',
        glow: '#EBD0FF',
        dark: '#2A1045',
        name: 'Violet',
      },
      {
        top: '#7DF9FF',
        main: '#00E5FF',
        bottom: '#009EC2',
        lip: '#005F78',
        glow: '#C4FCFF',
        dark: '#0B2F3B',
        name: 'Laser',
      },
      {
        top: '#D4FF59',
        main: '#A3F000',
        bottom: '#6BB800',
        lip: '#3F7000',
        glow: '#ECFFAD',
        dark: '#233608',
        name: 'Volt',
      },
      {
        top: '#FF73B9',
        main: '#FF1E8A',
        bottom: '#C90663',
        lip: '#7D023B',
        glow: '#FFB8DC',
        dark: '#3B0A24',
        name: 'Magenta',
      },
    ],
    lanes6: [
      {
        top: '#709BFF',
        main: '#3B6BFF',
        bottom: '#1D42C9',
        lip: '#0F257A',
        glow: '#BDCEFF',
        dark: '#0E1C47',
        name: 'Cobalt',
      },
      {
        top: '#D28BFF',
        main: '#A855F7',
        bottom: '#7E22CE',
        lip: '#4C1182',
        glow: '#EBD0FF',
        dark: '#2A1045',
        name: 'Violet',
      },
      {
        top: '#7DF9FF',
        main: '#00E5FF',
        bottom: '#009EC2',
        lip: '#005F78',
        glow: '#C4FCFF',
        dark: '#0B2F3B',
        name: 'Laser',
      },
      {
        top: '#D4FF59',
        main: '#A3F000',
        bottom: '#6BB800',
        lip: '#3F7000',
        glow: '#ECFFAD',
        dark: '#233608',
        name: 'Volt',
      },
      {
        top: '#FF73B9',
        main: '#FF1E8A',
        bottom: '#C90663',
        lip: '#7D023B',
        glow: '#FFB8DC',
        dark: '#3B0A24',
        name: 'Magenta',
      },
      {
        top: '#FFE95C',
        main: '#FFC400',
        bottom: '#D19000',
        lip: '#805500',
        glow: '#FFF4AD',
        dark: '#3B2805',
        name: 'Plasma',
      },
    ],
  },
  pastel: {
    id: 'pastel',
    name: 'Pastel Pop',
    lanes: [
      {
        top: '#80FFDB',
        main: '#34E0B0',
        bottom: '#12B588',
        lip: '#0A7557',
        glow: '#C2FFEE',
        dark: '#113B30',
        name: 'Mint',
      },
      {
        top: '#9EE0FF',
        main: '#52B6FF',
        bottom: '#1F87E0',
        lip: '#115494',
        glow: '#D1F0FF',
        dark: '#142E47',
        name: 'Sky',
      },
      {
        top: '#FFC491',
        main: '#FF9248',
        bottom: '#E06719',
        lip: '#943D08',
        glow: '#FFE1C7',
        dark: '#40220E',
        name: 'Peach',
      },
      {
        top: '#FFA6D5',
        main: '#FF66B5',
        bottom: '#DB378B',
        lip: '#8F1955',
        glow: '#FFD4EC',
        dark: '#3D152B',
        name: 'Rose',
      },
    ],
    lanes6: [
      {
        top: '#D4B3FF',
        main: '#A575FF',
        bottom: '#7C45E0',
        lip: '#4B2394',
        glow: '#ECDCFF',
        dark: '#271447',
        name: 'Lilac',
      },
      {
        top: '#80FFDB',
        main: '#34E0B0',
        bottom: '#12B588',
        lip: '#0A7557',
        glow: '#C2FFEE',
        dark: '#113B30',
        name: 'Mint',
      },
      {
        top: '#9EE0FF',
        main: '#52B6FF',
        bottom: '#1F87E0',
        lip: '#115494',
        glow: '#D1F0FF',
        dark: '#142E47',
        name: 'Sky',
      },
      {
        top: '#FFEE99',
        main: '#FFD147',
        bottom: '#E0A814',
        lip: '#8F6706',
        glow: '#FFF6C7',
        dark: '#3D2E08',
        name: 'Butter',
      },
      {
        top: '#FFC491',
        main: '#FF9248',
        bottom: '#E06719',
        lip: '#943D08',
        glow: '#FFE1C7',
        dark: '#40220E',
        name: 'Peach',
      },
      {
        top: '#FFA6D5',
        main: '#FF66B5',
        bottom: '#DB378B',
        lip: '#8F1955',
        glow: '#FFD4EC',
        dark: '#3D152B',
        name: 'Rose',
      },
    ],
  },
  sunset: {
    id: 'sunset',
    name: 'Solar Sunset',
    lanes: [
      {
        top: '#FF758F',
        main: '#FF3B5C',
        bottom: '#D11537',
        lip: '#85081E',
        glow: '#FFB8C6',
        dark: '#3B1018',
        name: 'Crimson',
      },
      {
        top: '#FFA654',
        main: '#FF7315',
        bottom: '#D44D00',
        lip: '#872E00',
        glow: '#FFD1A6',
        dark: '#3D1E08',
        name: 'Blaze',
      },
      {
        top: '#FFE866',
        main: '#FFC300',
        bottom: '#E09600',
        lip: '#8F5B00',
        glow: '#FFF4B3',
        dark: '#3D2C08',
        name: 'Solar',
      },
      {
        top: '#C785FF',
        main: '#9D4EDD',
        bottom: '#7324B5',
        lip: '#461075',
        glow: '#E4C2FF',
        dark: '#28113B',
        name: 'Dusk',
      },
    ],
    lanes6: [
      {
        top: '#FF758F',
        main: '#FF3B5C',
        bottom: '#D11537',
        lip: '#85081E',
        glow: '#FFB8C6',
        dark: '#3B1018',
        name: 'Crimson',
      },
      {
        top: '#FFA654',
        main: '#FF7315',
        bottom: '#D44D00',
        lip: '#872E00',
        glow: '#FFD1A6',
        dark: '#3D1E08',
        name: 'Blaze',
      },
      {
        top: '#FFE866',
        main: '#FFC300',
        bottom: '#E09600',
        lip: '#8F5B00',
        glow: '#FFF4B3',
        dark: '#3D2C08',
        name: 'Solar',
      },
      {
        top: '#FF85C2',
        main: '#F73893',
        bottom: '#C41468',
        lip: '#7A083E',
        glow: '#FFC2E0',
        dark: '#3B0C23',
        name: 'Horizon',
      },
      {
        top: '#C785FF',
        main: '#9D4EDD',
        bottom: '#7324B5',
        lip: '#461075',
        glow: '#E4C2FF',
        dark: '#28113B',
        name: 'Dusk',
      },
      {
        top: '#75B8FF',
        main: '#3A86FF',
        bottom: '#185ADB',
        lip: '#0B358F',
        glow: '#BFE0FF',
        dark: '#0F224A',
        name: 'Twilight',
      },
    ],
  },
  mono: {
    id: 'mono',
    name: '2-Hand Split',
    lanes: [LIME, LIME, CYAN, CYAN],
    lanes6: [LIME, LIME, LIME, CYAN, CYAN, CYAN],
  },
};

export function getPaletteLanes(
  paletteId: NotePaletteId,
  laneCount: LaneCount
): readonly LaneColorSpec[] {
  const pal = NOTE_PALETTES[paletteId] ?? NOTE_PALETTES.candy;
  return laneCount === 6 ? pal.lanes6 : pal.lanes;
}

export const NOTE_PALETTE_ORDER: readonly NotePaletteId[] = [
  'candy',
  'neon',
  'pastel',
  'sunset',
  'mono',
];

function clamp01(val: unknown, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(0, Math.min(1, val));
}

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;

    const validShapes: NoteShape[] = ['bar', 'circle', 'diamond', 'arrow'];
    const noteShape = validShapes.includes(parsed.noteShape as NoteShape)
      ? (parsed.noteShape as NoteShape)
      : DEFAULT_SETTINGS.noteShape;

    const notePalette =
      parsed.notePalette && parsed.notePalette in NOTE_PALETTES
        ? parsed.notePalette
        : DEFAULT_SETTINGS.notePalette;

    const themeMode: ThemeMode = parsed.themeMode === 'light' ? 'light' : 'dark';
    const scrollDirection: ScrollDirection = parsed.scrollDirection === 'up' ? 'up' : 'down';

    return {
      noteShape,
      notePalette,
      scrollDirection,
      masterVolume: clamp01(parsed.masterVolume, DEFAULT_SETTINGS.masterVolume),
      musicVolume: clamp01(parsed.musicVolume, DEFAULT_SETTINGS.musicVolume),
      sfxVolume: clamp01(parsed.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
      themeMode,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}
