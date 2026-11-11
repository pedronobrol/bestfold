// Deterministic names for designs, derived from the genome, so every visitor sees the same name
// for the same plane without storing anything. Format: "<Adjective> <Noun> <numeral>", where the
// noun fits the mission (fast birds and winds for distance, soaring birds and sky for time aloft)
// and the Roman numeral is the number of nose folds before the body fold (none for zero).

const ADJECTIVES = [
  'Amber', 'Ashen', 'Azure', 'Boreal', 'Cobalt', 'Copper', 'Crimson', 'Dawn', 'Ember', 'Glass',
  'Golden', 'Granite', 'Hollow', 'Indigo', 'Iron', 'Ivory', 'Jade', 'Lone', 'Lunar', 'Midnight',
  'Northern', 'Obsidian', 'Onyx', 'Pale', 'Polar', 'Quiet', 'Saffron', 'Scarlet', 'Silent', 'Silver',
  'Slate', 'Solar', 'Steel', 'Storm', 'Tidal', 'Umber', 'Velvet', 'Violet', 'Wild', 'Winter',
];
const DISTANCE_NOUNS = [
  'Kestrel', 'Peregrine', 'Merlin', 'Hobby', 'Swift', 'Martin', 'Falcon', 'Goshawk', 'Shrike', 'Tern',
  'Mistral', 'Sirocco', 'Bora', 'Levant', 'Tramontane', 'Squall', 'Comet', 'Meteor', 'Javelin', 'Lance',
  'Arrow', 'Bolt', 'Needle', 'Quill',
];
const HANGTIME_NOUNS = [
  'Albatross', 'Condor', 'Kite', 'Heron', 'Petrel', 'Shearwater', 'Fulmar', 'Harrier', 'Osprey', 'Gannet',
  'Buzzard', 'Crane', 'Cirrus', 'Nimbus', 'Updraft', 'Thermal', 'Zephyr', 'Drift', 'Feather', 'Lantern',
  'Seraph', 'Halo', 'Ember', 'Dandelion',
];
const NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];

// FNV-1a over the genome rounded to 4 decimals (stable across browsers and the server).
function hash(genome) {
  let h = 0x811c9dc5;
  const s = genome.map((x) => Math.round(x * 1e4)).join(',');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function designName(genome, mission, nFolds) {
  const h = hash(genome);
  const nouns = mission === 'hangtime' ? HANGTIME_NOUNS : DISTANCE_NOUNS;
  let adj = ADJECTIVES[h % ADJECTIVES.length];
  const noun = nouns[Math.floor(h / ADJECTIVES.length) % nouns.length];
  if (adj === noun) adj = ADJECTIVES[(h + 7) % ADJECTIVES.length];
  const num = NUMERALS[Math.min(NUMERALS.length - 1, nFolds || 0)];
  return num ? `${adj} ${noun} ${num}` : `${adj} ${noun}`;
}
