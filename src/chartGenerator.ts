import { CreoTrack, getTrackEnergyAt } from './songs';
import { DifficultyConfig, LaneIndex, NoteBar, RivalNote } from './types';

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
  psychopath: 0.112,
  impossible: 0.095,
};

/**
 * Generates randomized, beat-locked falling note patterns (4K DFJK or 6K SDFJKL)
 * synced to a real Creo MP3 track's exact BPM, beat phase offset, and RMS energy envelope!
 */
export function generateChartForTrack(
  config: DifficultyConfig,
  track: CreoTrack,
  startMeasure: number,
  measureCount: number,
  startingNoteId = 1,
  loopOffsetSec = 0
): GeneratedSection {
  const laneCount = config.laneCount;
  const halfHand = laneCount / 2; // 2 for 4K, 3 for 6K
  const allLanes: LaneIndex[] = Array.from({ length: laneCount }, (_, i) => i as LaneIndex);

  const secPerBeat = 60 / track.bpm;
  const stepsPerBeat = config.stepSubdivision;
  const stepsPerMeasure = 4 * stepsPerBeat;
  const secPerStep = secPerBeat / stepsPerBeat;
  const bpmTempoScale = Math.min(1.15, Math.max(0.78, 125 / track.bpm));

  const playerNotes: NoteBar[] = [];
  const rivalNotes: RivalNote[] = [];
  let nextId = startingNoteId;

  const laneFreeAtTime = new Array<number>(laneCount).fill(-10);
  const minJackGapSec = MIN_SAME_LANE_SEC[config.id];
  let lastLane: LaneIndex = 1;

  for (let m = 0; m < measureCount; m++) {
    const measureIdx = startMeasure + m;
    const motifRoll = Math.random();
    const useBurstMotif = motifRoll < config.burstChance;
    const stairDir = Math.random() < 0.5 ? 1 : -1;
    let stairCursor = Math.floor(Math.random() * laneCount);

    const trillA = Math.floor(Math.random() * halfHand) as LaneIndex;
    const trillB = (halfHand + Math.floor(Math.random() * halfHand)) as LaneIndex;

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
      const energyFactor = Math.min(1.28, Math.max(0.55, 0.42 + rawEnergy * 1.65));

      const isQuarter = s % stepsPerBeat === 0;
      const isEighth = stepsPerBeat === 2 ? true : s % 2 === 0;
      const isDownbeat = s === 0 || s === 2 * stepsPerBeat;

      let spawnProb = 0;
      if (isDownbeat) {
        spawnProb = Math.min(0.98, config.baseDensity * 1.42 * energyFactor);
      } else if (isQuarter) {
        spawnProb = Math.min(0.94, config.baseDensity * 1.18 * energyFactor * bpmTempoScale);
      } else if (isEighth) {
        const easyDamp = config.id === 'easy' ? 0.52 : 1.0;
        spawnProb = Math.min(
          0.95,
          config.baseDensity * 0.88 * energyFactor * bpmTempoScale * easyDamp
        );
      } else {
        // 16th subdivisions: cranked up on Psychopath & Impossible for true 6K bullet streams!
        const isExtreme6K = config.id === 'impossible' || config.id === 'psychopath';
        const dropBoost = isExtreme6K
          ? rawEnergy >= 0.35
            ? 1.24
            : 0.82
          : rawEnergy >= 0.4
          ? 1.1
          : 0.45;
        const burstFactor =
          config.id === 'impossible'
            ? 0.94
            : config.id === 'psychopath'
            ? 0.82
            : 0.68;
        spawnProb =
          (useBurstMotif ? config.baseDensity * burstFactor : config.baseDensity * 0.16) *
          dropBoost *
          bpmTempoScale;
      }

      // Brief breath at the end of every 8-bar phrase (slightly shorter on Impossible!)
      if (
        config.id !== 'impossible' &&
        measureIdx % 8 === 7 &&
        s >= stepsPerMeasure - Math.max(1, stepsPerBeat - 1)
      ) {
        spawnProb *= 0.28;
      }

      if (Math.random() < spawnProb) {
        const availableLanes = allLanes.filter((l) => stepTime >= laneFreeAtTime[l]);

        if (availableLanes.length > 0) {
          let chosenLane: LaneIndex;

          if (useBurstMotif && !isQuarter) {
            if (motifRoll < config.burstChance * 0.58) {
              stairCursor = (stairCursor + stairDir + laneCount) % laneCount;
              const candidate = stairCursor as LaneIndex;
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
          const minGap =
            config.id === 'impossible'
              ? Math.max(minJackGapSec, secPerStep * 1.15)
              : Math.max(minJackGapSec, secPerStep * 1.55);

          playerNotes.push({
            id: nextId++,
            lane: chosenLane,
            time: stepTime,
            duration: durationSec,
            midiPitch: 60 + chosenLane * 2,
            hit: false,
            missed: false,
            holding: false,
            holdCompleted: false,
            holdReleasedEarly: false,
            lastHoldTickTime: stepTime,
          });

          laneFreeAtTime[chosenLane] = stepTime + durationSec + minGap;
          lastLane = chosenLane;

          // Multi-Note Chord Jumps (Double Jumps + 6K Triple Bracket Chords!)
          const allowChordHere =
            durationSteps === 0 &&
            (isDownbeat ||
              (isQuarter && rawEnergy > 0.34) ||
              (config.id === 'impossible' && isEighth && rawEnergy > 0.38));

          if (allowChordHere && Math.random() < config.chordChance * energyFactor) {
            const chordCandidates = availableLanes.filter((l) => l !== chosenLane);
            if (chordCandidates.length > 0) {
              const oppositeHand = chordCandidates.filter((l) =>
                chosenLane < halfHand ? l >= halfHand : l < halfHand
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

              laneFreeAtTime[secondLane] = stepTime + minGap;

              // Optional 3-Note Bracket Chord in 6-Key modes (Psychopath & Impossible!)
              if (
                laneCount === 6 &&
                config.tripleChordChance &&
                (isDownbeat || (config.id === 'impossible' && isQuarter)) &&
                Math.random() < config.tripleChordChance * energyFactor
              ) {
                const thirdPool = chordCandidates.filter((l) => l !== secondLane);
                if (thirdPool.length > 0) {
                  const thirdLane = thirdPool[Math.floor(Math.random() * thirdPool.length)];
                  playerNotes.push({
                    id: nextId++,
                    lane: thirdLane,
                    time: stepTime,
                    duration: 0,
                    midiPitch: 72 + thirdLane,
                    hit: false,
                    missed: false,
                    holding: false,
                    holdCompleted: false,
                    holdReleasedEarly: false,
                    lastHoldTickTime: stepTime,
                  });
                  laneFreeAtTime[thirdLane] = stepTime + minGap;
                }
              }
            }
          }
        }
      }

      // Rival stage animations synced to Creo's beat & energy!
      if ((isQuarter || (isEighth && rawEnergy > 0.38)) && Math.random() < 0.55) {
        const rLane = Math.floor(Math.random() * laneCount) as LaneIndex;
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
  available: readonly LaneIndex[],
  lastLane: LaneIndex
): LaneIndex {
  const nonRepeat = available.filter((l) => l !== lastLane);
  const pool = nonRepeat.length > 0 ? nonRepeat : available;
  return pool[Math.floor(Math.random() * pool.length)];
}
