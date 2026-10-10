# Project instructions for Claude

## Version bump on every push

Any time a change is pushed to a remote branch, bump the version number up by `0.0.1` first, in the same commit (or a commit in the same push) as the change. Update all of these together, keeping them in sync:

- `package.json` → `"version"`
- `js/config.js` → `GAME_VERSION`
- `docs/financial-model-v2.md` → the "Game development version" line near the top

This applies to every push, not just ones the maintainer flags as a release. `CHANGELOG.md`'s own convention of keeping unpublished work under `## [Unreleased]` until told to publish still applies separately — bump the version number regardless, even while the changelog entries stay under `[Unreleased]`.
