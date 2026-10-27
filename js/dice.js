// The eight custom dice. Faces are reconstructed from the printed rules and
// photos of the physical set; every face carries the data the engine needs.

export const POSITIONS = ['S', 'F', 'C', 'W', 'B'];

export const PLAYERS = {
  S: { name: 'Scrum Half', short: 'S' },
  F: { name: 'Forward', short: 'F' },
  C: { name: 'Centre', short: 'C' },
  W: { name: 'Wing', short: 'W' },
  B: { name: 'Back', short: 'B' },
};

const hitUp = value => ({ kind: 'run', label: 'Hit Up', value });
const special = (label, value) => ({ kind: 'run', label, value, special: true });
const passTo = to => ({ kind: 'pass', label: 'Pass', to });
const pass = () => ({ kind: 'pass', label: 'Pass' });
const drop = () => ({ kind: 'drop', label: 'Drop Goal' });
const knockOn = () => ({ kind: 'error', label: 'Knock On', error: 'knockon' });
const touch = () => ({ kind: 'error', label: 'Into Touch', error: 'touch' });
const intercept = () => ({ kind: 'intercept', label: 'Intercepted' });
const tackle = value => ({ kind: 'tackle', label: 'Tackle', value });
const bigHit = value => ({ kind: 'bighit', label: 'Big Hit', value });

export const DICE = {
  S: {
    name: 'Scrum Half',
    faces: [hitUp(4), passTo('F'), passTo('C'), passTo('W'), passTo('B'), passTo('F')],
  },
  F: {
    name: 'Forward',
    faces: [hitUp(5), hitUp(5), hitUp(4), special('Line Break', 6), pass(), knockOn()],
  },
  C: {
    name: 'Centre',
    faces: [hitUp(4), hitUp(5), special('Thru the Gap', 7), drop(), pass(), intercept()],
  },
  W: {
    name: 'Wing',
    faces: [hitUp(4), hitUp(5), special('Into the Corner', 8), pass(), touch(), knockOn()],
  },
  B: {
    name: 'Back',
    faces: [hitUp(3), hitUp(4), special('High Ball', 6), drop(), pass(), touch()],
  },
  // Brown. Two rolls make a tackle; one roll sets a kick's range.
  D: {
    name: 'Defence',
    faces: [tackle(1), tackle(2), tackle(3), tackle(3), tackle(4), bigHit(5)],
  },
  // Black. Try check, kick distance, ruck contest and the yellow-card dot.
  K: {
    name: 'Scoring',
    faces: [
      { label: 'TRY', result: 'try', kick: 6 },
      { label: 'TRY', result: 'try', kick: 4 },
      { label: 'TRY', result: 'try', kick: 2 },
      { label: 'NO TRY', result: 'notry', kick: 5 },
      { label: 'VIDEO REF', result: 'video', kick: 3 },
      { label: 'RUCK WIN', result: 'ruck', kick: 1, card: true },
    ],
  },
  // White. Each face settles a scrum and a lineout, or awards a penalty.
  R: {
    name: 'Referee',
    faces: [
      { scrum: 'win', lineout: 'win' },
      { scrum: 'win', lineout: 'lose' },
      { scrum: 'lose', lineout: 'win' },
      { scrum: 'reset', lineout: 'notstraight' },
      { penalty: 'won' },
      { penalty: 'against' },
    ],
  },
};

// Kick distances and ranges are small numbers on the dice; shown as metres.
export const METRES_PER_POINT = 10;
