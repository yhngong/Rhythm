import { DifficultyConfig, NoteBar, RivalNote } from './types';

// Funky C-minor pentatonic / Dorian scale intervals for melodic FNF-style synth hits
const PHRASE_SCALES: number[][] = [
  [60, 63, 65, 67, 70, 72, 75, 77], // Cm7
  [56, 60, 63, 67, 68, 72, 75, 79], // Abmaj7
  [53, 56, 60, 63, 65, 68, 72, 75], // Fm7
  [55, 59, 62, 65, 67, 71, 74, 75], // G7alt
];

export interface GeneratedSection {
  playerNotes: NoteBar[];
  rivalNotes: RivalNote[];
  nextNoteId: number;
  endMeasure: number;
}

/**
 * Generates randomized, musically beat-quantized falling bar patterns
 * with strict ergonomic lane-occupancy rules (no overlapping hold tails or unfair jacks).
 */
export function generateChartSection(
  config: DifficultyConfig,
  startMeasure: number,
  measureCount: number,
  leadInSec: number,
  startingNoteId = 1
): GeneratedSection {
  const secPerBeat = 60 / config.bpm;
  const stepsPerBeat = config.stepSubdivision; // 2 (8ths) or 4 (16ths)
  const stepsPerMeasure = 4 * stepsPerBeat;
  const secPerStep = secPerBeat / stepsPerBeat;

  const playerNotes: NoteBar[] = [];
  const rivalNotes: RivalNote[] = [];
  let nextId = startingNoteId;

  // Track up to which global step each lane is occupied (prevents hold collisions & inhumane jacks)
  const laneFreeAtStep = [0, 0, 0, 0];
  let lastLane: 0 | 1 | 2 | 3 = 1;

  for (let m = 0; m < measureCount; m++) {
    const measureIdx = startMeasure + m;
    const scale = PHRASE_SCALES[measureIdx % PHRASE_SCALES.length];
    const isChorus = measureIdx % 8 >= 4;
    const densityBoost = isChorus ? 1.15 : 1.0;

    // Pick a randomized musical motif style for this measure
    const motifRoll = Math.random();
    const useBurstMotif = motifRoll < config.burstChance;
    const stairDir = Math.random() < 0.5 ? 1 : -1;
    let stairCursor = Math.floor(Math.random() * 4);

    // Pre-pick a trill pair in case a trill burst occurs
    const trillA = (Math.floor(Math.random() * 2) as 0 | 1); // left hand D or F
    const trillB = (2 + Math.floor(Math.random() * 2)) as 2 | 3; // right hand J or K

    for (let s = 0; s < stepsPerMeasure; s++) {
      const globalStep = measureIdx * stepsPerMeasure + s;
      const stepTime = leadInSec + globalStep * secPerStep;

      const isQuarter = s % stepsPerBeat === 0;
      const isEighth = stepsPerBeat === 2 ? true : s % 2 === 0;
      const isDownbeat = s === 0 || s === 2 * stepsPerBeat;

      // Determine whether to spawn a note on this subdivision step
      let spawnProb = 0;
      if (isDownbeat) {
        spawnProb = Math.min(0.94, config.baseDensity * 1.45 * densityBoost);
      } else if (isQuarter) {
        spawnProb = Math.min(0.88, config.baseDensity * 1.2 * densityBoost);
      } else if (isEighth) {
        spawnProb = config.baseDensity * 0.88 * densityBoost;
      } else {
        // 16th off-beat subdivision
        spawnProb = useBurstMotif ? config.baseDensity * 0.72 * densityBoost : config.baseDensity * 0.16;
      }

      // Leave a tiny breath at the very end of every 8-measure phrase
      if (measureIdx % 8 === 7 && s >= stepsPerMeasure - Math.max(1, stepsPerBeat - 1)) {
        spawnProb *= 0.2;
      }

      if (Math.random() < spawnProb) {
        const availableLanes = ([0, 1, 2, 3] as const).filter(
          (l) => globalStep >= laneFreeAtStep[l]
        );

        if (availableLanes.length > 0) {
          let chosenLane: 0 | 1 | 2 | 3;

          if (useBurstMotif && !isQuarter) {
            // Structured stair or hand-alternating trill during fast bursts!
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

          // Decide if this bar is a Hold Sustain Bar (mostly on strong beats)
          let durationSteps = 0;
          if (
            (isQuarter || isEighth) &&
            s <= stepsPerMeasure - stepsPerBeat &&
            Math.random() < config.holdChance
          ) {
            const holdBeats = Math.random() < 0.65 ? 1 : 1.5;
            durationSteps = Math.max(2, Math.round(holdBeats * stepsPerBeat));
          }

          const durationSec = durationSteps > 0 ? durationSteps * secPerStep : 0;
          const pitchIdx = Math.min(
            scale.length - 1,
            chosenLane * 2 + (Math.random() < 0.45 ? 1 : 0)
          );

          playerNotes.push({
            id: nextId++,
            lane: chosenLane,
            time: stepTime,
            duration: durationSec,
            midiPitch: scale[pitchIdx],
            hit: false,
            missed: false,
            holding: false,
            holdCompleted: false,
            holdReleasedEarly: false,
            lastHoldTickTime: stepTime,
          });

          laneFreeAtStep[chosenLane] =
            globalStep + Math.max(config.minSameLaneSteps, durationSteps + 2);
          lastLane = chosenLane;

          // Optional Double-Bar Chord Jump on strong quarter/eighth beats
          if (
            durationSteps === 0 &&
            (isDownbeat || isQuarter) &&
            Math.random() < config.chordChance
          ) {
            const chordCandidates = availableLanes.filter((l) => l !== chosenLane);
            if (chordCandidates.length > 0) {
              // Prefer opposite hand for comfortable DF + JK chord jumps
              const oppositeHand = chordCandidates.filter((l) =>
                chosenLane < 2 ? l >= 2 : l < 2
              );
              const pool = oppositeHand.length > 0 ? oppositeHand : chordCandidates;
              const secondLane = pool[Math.floor(Math.random() * pool.length)];
              const pitchIdx2 = Math.min(scale.length - 1, secondLane * 2 + 1);

              playerNotes.push({
                id: nextId++,
                lane: secondLane,
                time: stepTime,
                duration: 0,
                midiPitch: scale[pitchIdx2],
                hit: false,
                missed: false,
                holding: false,
                holdCompleted: false,
                holdReleasedEarly: false,
                lastHoldTickTime: stepTime,
              });

              laneFreeAtStep[secondLane] = globalStep + config.minSameLaneSteps;
            }
          }
        }
      }

      // Generate synchronized Rival harmony/counter-rhythm notes for FNF stage battle flair!
      if ((isQuarter || (isEighth && Math.random() < 0.45)) && Math.random() < 0.55) {
        const rLane = Math.floor(Math.random() * 4) as 0 | 1 | 2 | 3;
        const rPitch = scale[(rLane * 2) % scale.length] - 12; // Rival sings a warm octave lower!
        rivalNotes.push({
          lane: rLane,
          time: stepTime,
          duration: isDownbeat && Math.random() < 0.25 ? secPerBeat * 0.75 : secPerBeat * 0.3,
          midiPitch: rPitch,
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
  // Strongly prefer switching lanes/hands so patterns flow smoothly across D-F-J-K
  const nonRepeat = available.filter((l) => l !== lastLane);
  const pool = nonRepeat.length > 0 ? nonRepeat : available;
  return pool[Math.floor(Math.random() * pool.length)];
}
