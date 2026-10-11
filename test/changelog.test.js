import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChangelog, formatChangelogBody, paginateChangelogText } from '../js/state/Changelog.js';
import { GAME_VERSION } from '../js/config.js';

const SAMPLE = `# Changelog

## [Unreleased]

### Added
- Some unpublished work still awaiting a version bump announcement.

## [0.7.7] — 2026-10-10

### Changed
- Already-published notes keep their own dated heading.
`;

test('parseChangelog shows the live GAME_VERSION for the "Unreleased" heading instead of the literal word', () => {
  const [unreleased, published] = parseChangelog(SAMPLE);
  assert.equal(unreleased.version, GAME_VERSION);
  assert.equal(unreleased.title, GAME_VERSION);
  assert.equal(unreleased.label, GAME_VERSION);
  assert.equal(unreleased.id, 'Unreleased'); // internal lookup key is unaffected
  assert.ok(unreleased.body.includes('unpublished work'));

  assert.equal(published.version, '0.7.7');
  assert.equal(published.label, '0.7.7 — 2026-10-10');
  assert.equal(published.title, '0.7.7');
});

test('formatChangelogBody/paginateChangelogText still work for a normal section', () => {
  const [, published] = parseChangelog(SAMPLE);
  const body = formatChangelogBody('### Changed\n- A bullet');
  assert.equal(body, 'Changed:\n• A bullet');
  const pages = paginateChangelogText(published.body, 40, 8);
  assert.ok(pages.length >= 1);
  assert.ok(pages[0].includes('dated heading'));
});
