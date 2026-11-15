export interface CreoTrack {
  id: 'sphere' | 'lost' | 'dimension' | 'epilogue';
  title: string;
  artist: 'Creo';
  src: string;
  newgroundsId: string;
  url: string;
  bpm: number;
  beatOffsetSec: number;
  durationSec: number;
  firstNoteSec: number;
  lastNoteSec: number;
  energyProfile: number[]; // 24 normalized RMS buckets across track duration
}

export const CREO_CREDITS = {
  artist: 'Creo',
  website: 'https://creo-music.com',
  youtube: 'https://www.youtube.com/@creomusic',
  newgrounds: 'https://creo.newgrounds.com',
} as const;

export const CREO_TRACKS: readonly CreoTrack[] = [
  {
    id: 'sphere',
    title: 'Sphere',
    artist: 'Creo',
    src: './music/sphere.mp3',
    newgroundsId: '739991',
    url: 'https://www.newgrounds.com/audio/listen/739991',
    bpm: 100,
    beatOffsetSec: 0.315,
    durationSec: 240.04,
    firstNoteSec: 1.5,
    lastNoteSec: 234.0,
    energyProfile: [
      0.21, 0.26, 0.19, 0.21, 0.32, 0.41, 0.44, 0.44,
      0.48, 0.45, 0.38, 0.39, 0.25, 0.32, 0.48, 0.42,
      0.36, 0.42, 0.44, 0.47, 0.45, 0.39, 0.26, 0.13,
    ],
  },
  {
    id: 'lost',
    title: 'Lost',
    artist: 'Creo',
    src: './music/lost.mp3',
    newgroundsId: '1237702',
    url: 'https://www.newgrounds.com/audio/listen/1237702',
    bpm: 144,
    beatOffsetSec: 0.185,
    durationSec: 184.11,
    firstNoteSec: 1.85,
    lastNoteSec: 174.5,
    energyProfile: [
      0.14, 0.20, 0.27, 0.22, 0.38, 0.39, 0.38, 0.33,
      0.32, 0.53, 0.45, 0.53, 0.23, 0.32, 0.49, 0.41,
      0.49, 0.39, 0.41, 0.29, 0.25, 0.26, 0.16, 0.01,
    ],
  },
  {
    id: 'dimension',
    title: 'Dimension',
    artist: 'Creo',
    src: './music/dimension.mp3',
    newgroundsId: '709578',
    url: 'https://www.newgrounds.com/audio/listen/709578',
    bpm: 115,
    beatOffsetSec: 0.068,
    durationSec: 192.03,
    firstNoteSec: 0.6,
    lastNoteSec: 184.0,
    energyProfile: [
      0.45, 0.44, 0.48, 0.50, 0.46, 0.34, 0.41, 0.49,
      0.48, 0.48, 0.52, 0.54, 0.52, 0.48, 0.45, 0.37,
      0.35, 0.46, 0.48, 0.48, 0.51, 0.52, 0.49, 0.01,
    ],
  },
  {
    id: 'epilogue',
    title: 'Epilogue',
    artist: 'Creo',
    src: './music/epilogue.mp3',
    newgroundsId: '723714',
    url: 'https://www.newgrounds.com/audio/listen/723714',
    bpm: 160,
    beatOffsetSec: 0.041,
    durationSec: 248.53,
    firstNoteSec: 1.54,
    lastNoteSec: 243.5,
    energyProfile: [
      0.11, 0.19, 0.27, 0.43, 0.46, 0.46, 0.47, 0.50,
      0.48, 0.26, 0.25, 0.30, 0.32, 0.38, 0.37, 0.44,
      0.48, 0.48, 0.47, 0.49, 0.35, 0.22, 0.16, 0.13,
    ],
  },
] as const;

export function pickRandomCreoTrack(): CreoTrack {
  const index = Math.floor(Math.random() * CREO_TRACKS.length);
  return CREO_TRACKS[index];
}

export function getTrackEnergyAt(track: CreoTrack, timeSec: number): number {
  if (timeSec < 0 || timeSec > track.durationSec) return 0.25;
  const idx = Math.min(
    track.energyProfile.length - 1,
    Math.max(0, Math.floor((timeSec / track.durationSec) * track.energyProfile.length))
  );
  return track.energyProfile[idx];
}
