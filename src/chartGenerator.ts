import { CreoTrack, getTrackEnergyAt } from './songs';
import { DifficultyConfig, NoteBar, RivalNote } from './types';

export interface GeneratedSection {
  playerNotes: NoteBar[];
  rivalNotes: RivalNote[];
  nextNoteId: number;
  endMeasure: number;
}

const MIN_SAME_LANE_SEC: Record<DifficultyConfig['id'], number> = {
  easy: 0.24,
  normal: 0.19,
  hard: 0.155,
  insane: 0.13,
};

/**
 * Generates randomized, beat-locked falling bar patterns synced to a real Creo MP3 track's
 * exact BPM, beat phase offset, and RMS energy envelope!
 */
export function generateChartForTrack(
  config: DifficultyConfig,
  track: CreoTrack,
  startMeasure: number,
  measureCount: number,
  startingNoteId = 1,
  loopOffsetSec = 0
): GeneratedSection {
  const secPerBeat = 60 / track.bpm;
  // On 160 BPM tracks (like Epilogue), cap 16th flood slightly on Normal so difficulty stays consistent across BPMs
  const stepsPerBeat = config.stepSubdivision;
  const stepsPerMeasure = 4 * stepsPerBeat;
  const secPerStep = secPerBeat / stepsPerBeat;
  const bpmTempoScale = Math.min(1.15, Math.max(0.78, 125 / track.bpm));

  const playerNotes: NoteBar[] = [];
  const rivalNotes: RivalNote[] = [];
  let nextId = startingNoteId;

  const laneFreeAtTime = [-10, -10, -10, -10];
  const minJackGapSec = MIN_SAME_LANE_SEC[config.id];
  let lastLane: 0 | 1 | 2 | 3 = 1;

  for (let m = 0; m < measureCount; m++) {
    const measureIdx = startMeasure + m;
    const motifRoll = Math.random();
    const useBurstMotif = motifRoll < config.burstChance;
    const stairDir = Math.random() < 0.5 ? 1 : -1;
    let stairCursor = Math.floor(Math.random() * 4);

    const trillA = Math.floor(Math.random() * 2) as 0 | 1;
    const trillB = (2 + Math.floor(Math.random() * 2)) as 2 | 3;

    for (let s = 0; s < stepsPerMeasure; s++) {
      const globalStep = measureIdx * stepsPerMeasure + s;
      const stepTime = loopOffsetSec + track.beatOffsetSec + globalStep * secPerStep;
      const localTrackTime = (stepTime - loopOffsetSec) % track.durationSec;

      // Respect quiet fade-in / fade-out boundaries in Stage Battle mode, and loop seam in Endless mode
      if (loopOffsetSec === 0) {
        if (stepTime < track.firstNoteSec || stepTime > track.lastNoteSec) {
          continue;
        }
      } else if (stepTime >= loopOffsetSec + track.durationSec - 0.35) {
        continue;
      }

      // Modulate note density by Creo's actual audio energy at this moment!
      const rawEnergy = getTrackEnergyAt(track, localTrackTime);
      if (rawEnergy < 0.05) continue;
      // Map energy (0.10..0.54) -> multiplier (0.58..1.25)
      const energyFactor = Math.min(1.26, Math.max(0.55, 0.42 + rawEnergy * 1.65));

      const isQuarter = s % stepsPerBeat === 0;
      const isEighth = stepsPerBeat === 2 ? true : s % 2 === 0;
      const isDownbeat = s === 0 || s === 2 * stepsPerBeat;

      let spawnProb = 0;
      if (isDownbeat) {
        spawnProb = Math.min(0.95, config.baseDensity * 1.42 * energyFactor);
      } else if (isQuarter) {
        spawnProb = Math.min(0.88, config.baseDensity * 1.18 * energyFactor * bpmTempoScale);
      } else if (isEighth) {
        const easyDamp = config.id === 'easy' ? 0.52 : 1.0;
        spawnProb = config.baseDensity * 0.85 * energyFactor * bpmTempoScale * easyDamp;
      } else {
        // 16th subdivisions trigger mainly during energetic drops/choruses!
        const dropBoost = rawEnergy >= 0.4 ? 1.1 : 0.45;
        spawnProb =
          (useBurstMotif ? config.baseDensity * 0.68 : config.baseDensity * 0.14) *
          dropBoost *
          bpmTempoScale;
      }

      if (measureIdx % 8 === 7 && s >= stepsPerMeasure - Math.max(1, stepsPerBeat - 1)) {
        spawnProb *= 0.25;
      }

      if (Math.random() < spawnProb) {
        const availableLanes = ([0, 1, 2, 3] as const).filter(
          (l) => stepTime >= laneFreeAtTime[l]
        );

        if (availableLanes.length > 0) {
          let chosenLane: 0 | 1 | 2 | 3;

          if (useBurstMotif && !isQuarter) {
            if (motifRoll < config.burstChance * 0.55) {
              stairCursor = (stairCursor + stairDir + 4) % 4;
              const candidate = stairCursor as 0 | 1 | 2 | 3;
              chosenLane = availableLanes.includes(candidate)
                ? candidate
                : pickErgonomicLane(availableLanes, lastLane);
            } else {
              const candidate = s % 2 === 0 ? trillA : trillB;
              chosenLane = availableLanes.includes(candidate)
                ? candidate
                : pickErgonomicLane(availableLanes, lastLane);
            }
          } else {
            chosenLane = pickErgonomicLane(availableLanes, lastLane);
          }

          let durationSteps = 0;
          if (
            (isQuarter || isEighth) &&
            s <= stepsPerMeasure - stepsPerBeat &&
            Math.random() < config.holdChance
          ) {
            const holdBeats = Math.random() < 0.68 ? 1 : 1.5;
            durationSteps = Math.max(2, Math.round(holdBeats * stepsPerBeat));
          }

          const durationSec = durationSteps > 0 ? durationSteps * secPerStep : 0;

          playerNotes.push({
            id: nextId++,
            lane: chosenLane,
            time: stepTime,
            duration: durationSec,
            midiPitch: 60 + chosenLane * 3,
            hit: false,
            missed: false,
            holding: false,
            holdCompleted: false,
            holdReleasedEarly: false,
            lastHoldTickTime: stepTime,
          });

          laneFreeAtTime[chosenLane] =
            stepTime + durationSec + Math.max(minJackGapSec, secPerStep * 1.6);
          lastLane = chosenLane;

          // Double-Bar Chord Jump on energetic beats
          if (
            durationSteps === 0 &&
            (isDownbeat || (isQuarter && rawEnergy > 0.36)) &&
            Math.random() < config.chordChance * energyFactor
          ) {
            const chordCandidates = availableLanes.filter((l) => l !== chosenLane);
            if (chordCandidates.length > 0) {
              const oppositeHand = chordCandidates.filter((l) =>
                chosenLane < 2 ? l >= 2 : l < 2
              );
              const pool = oppositeHand.length > 0 ? oppositeHand : chordCandidates;
              const secondLane = pool[Math.floor(Math.random() * pool.length)];

              playerNotes.push({
                id: nextId++,
                lane: secondLane,
                time: stepTime,
                duration: 0,
                midiPitch: 67 + secondLane * 2,
                hit: false,
                missed: false,
                holding: false,
                holdCompleted: false,
                holdReleasedEarly: false,
                lastHoldTickTime: stepTime,
              });

              laneFreeAtTime[secondLane] =
                stepTime + Math.max(minJackGapSec, secPerStep * 1.6);
            }
          }
        }
      }

      // Rival stage animations synced to Creo's beat & energy!
      if ((isQuarter || (isEighth && rawEnergy > 0.38)) && Math.random() < 0.55) {
        const rLane = Math.floor(Math.random() * 4) as 0 | 1 | 2 | 3;
        rivalNotes.push({
          lane: rLane,
          time: stepTime,
          duration: isDownbeat ? secPerBeat * 0.65 : secPerBeat * 0.3,
          midiPitch: 48,
          triggered: false,
        });
      }
    }
  }

  playerNotes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  rivalNotes.sort((a, b) => a.time - b.time);

  return {
    playerNotes,
    rivalNotes,
    nextNoteId: nextId,
    endMeasure: startMeasure + measureCount,
  };
}

function pickErgonomicLane(
  available: readonly (0 | 1 | 2 | 3)[],
  lastLane: 0 | 1 | 2 | 3
): 0 | 1 | 2 | 3 {
  const nonRepeat = available.filter((l) => l !== lastLane);
  const pool = nonRepeat.length > 0 ? nonRepeat : available;
  return pool[Math.floor(Math.random() * pool.length)];
}
