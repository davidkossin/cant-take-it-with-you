/**
 * Backend list of default child first names (US-popular mix).
 * Setup picks one at random when the player leaves the name field defaulted.
 */

export const CHILD_FIRST_NAMES = [
  'Ava', 'Liam', 'Emma', 'Noah', 'Olivia', 'Oliver', 'Sophia', 'Elijah',
  'Isabella', 'Lucas', 'Mia', 'Mason', 'Charlotte', 'Ethan', 'Amelia',
  'James', 'Harper', 'Benjamin', 'Evelyn', 'Henry', 'Abigail', 'Alexander',
  'Emily', 'Michael', 'Elizabeth', 'Daniel', 'Sofia', 'Jacob', 'Ella',
  'Jack', 'Scarlett', 'Owen', 'Grace', 'Samuel', 'Chloe', 'Sebastian',
  'Victoria', 'David', 'Riley', 'Joseph', 'Aria', 'Carter', 'Lily',
  'Wyatt', 'Avery', 'John', 'Zoey', 'Luke', 'Nora', 'Gabriel', 'Camila',
  'Anthony', 'Hannah', 'Isaac', 'Lillian', 'Dylan', 'Addison', 'Julian',
  'Eleanor', 'Christopher', 'Natalie', 'Joshua', 'Luna', 'Andrew', 'Savannah',
  'Lincoln', 'Brooklyn', 'Mateo', 'Leah', 'Ryan', 'Zoe', 'Jaxon', 'Stella',
  'Nathan', 'Hazel', 'Aaron', 'Ellie', 'Isaiah', 'Paisley', 'Thomas', 'Audrey',
  'Charles', 'Skylar', 'Caleb', 'Violet', 'Josiah', 'Claire', 'Christian', 'Bella',
];

export function randomChildName(rng = Math.random) {
  const i = Math.floor(rng() * CHILD_FIRST_NAMES.length) % CHILD_FIRST_NAMES.length;
  return CHILD_FIRST_NAMES[i] || 'Alex';
}

/** Ordinal suffix for child index (0-based → 1st, 2nd, …). */
export function childOrdinal(index0) {
  const n = (index0 | 0) + 1;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
