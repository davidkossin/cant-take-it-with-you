/**
 * Brief things the spouse says when the player talks to them in the Decision Room.
 * Every line is 1-5 words. A line may carry `maxAge` (shown only while the player
 * is younger than that) or `minAge`.
 */
export const SPOUSE_LINES = [
  { text: 'Hi!' },
  { text: 'Hello, you.' },
  { text: 'Hey there!' },
  { text: 'Good to see you.' },
  { text: "How's it going?" },
  { text: 'You\'re doing great!' },
  { text: 'Proud of you.' },
  { text: 'We make a good team.' },
  { text: 'Keep it up!' },
  { text: 'I believe in us.' },
  { text: 'Time is ticking.' },
  { text: "We're not getting younger." },
  { text: 'Money isn\'t everything.' },
  { text: 'Should we buy a car?' },
  { text: 'Should we have a kid?', maxAge: 45 },
  { text: 'Thinking about kids?', maxAge: 45 },
  { text: 'Nice room, isn\'t it?' },
  { text: 'Any big plans?' },
  { text: 'Check the budget?' },
  { text: 'Are we saving enough?' },
  { text: 'Slow and steady.' },
  { text: 'Remember to breathe.' },
  { text: 'Take your time.' },
  { text: 'Dinner tonight?' },
  { text: 'Love you!' },
  { text: 'What a day.' },
  { text: 'Look at us go.' },
  { text: 'Is it a good year?' },
  { text: 'Save a little more?' },
  { text: 'Ready for the hallway?' },
  { text: 'Let\'s not overthink it.' },
  { text: 'Worth a second look.' },
  { text: 'Stay curious.' },
  { text: 'Dream big!' },
  { text: 'One year at a time.' },
  { text: 'You\'ve got this.' },
  { text: 'Maybe a vacation?' },
  { text: 'Retire somewhere sunny?' },
  { text: 'Hope is a plan.' },
  { text: 'Enjoy today.' },
  { text: 'Is that a plan?' },
  { text: 'Sleep on it.' },
];

/**
 * Pick a random line valid for `age`, never the same text as `lastText` (when another exists).
 * @param {number} age player's age
 * @param {string|null} [lastText] previous line shown
 * @param {() => number} [random] uniform [0, 1)
 */
export function pickSpouseLine(age, lastText = null, random = Math.random) {
  const ok = SPOUSE_LINES.filter((l) =>
    (l.maxAge == null || age < l.maxAge) && (l.minAge == null || age >= l.minAge));
  const pool = ok.filter((l) => l.text !== lastText);
  const from = pool.length ? pool : ok;
  return from[Math.floor(random() * from.length)].text;
}
