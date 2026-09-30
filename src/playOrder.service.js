// Singleton service that picks the next audio file from a folder, following its play_order:
//   shuffle  (default) random, but every file plays once before any repeats
//   in_order in name order (numbers sorted as numbers, so "Episode 9" comes before "Episode 10"), then from the start again
//   random   any file, every time
// What played is remembered in the project folder, so restarting doesn't start the round over.
const fs = require('fs');
const nodePath = require('path');

const STATE_FILE_NAME = '.podcast-radio-state.json';
const PLAY_ORDERS = ['shuffle', 'in_order', 'random'];
const DEFAULT_PLAY_ORDER = 'shuffle';

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// { folders: { "<folder, relative to the project>": { played: ["<file, relative to the folder>"], last: "<file>" } } }
let state = { folders: {} };
let statePath = undefined;
let warnedAboutSaving = false;

const loadState = projectPath => {
  const path = nodePath.join(projectPath, STATE_FILE_NAME);
  if (path === statePath) {
    return;
  }
  statePath = path;
  try {
    state = JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (e) {
    state = undefined;
  }
  if (!state || typeof state !== 'object' || !state.folders || typeof state.folders !== 'object') {
    state = { folders: {} };
  }
};

// Write to a temp file, then rename it over the state file, so it is never half written
const saveState = () => {
  try {
    const tempPath = `${statePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
    fs.renameSync(tempPath, statePath);
  } catch (e) {
    // Playing matters more than remembering, but say so once
    if (!warnedAboutSaving) {
      warnedAboutSaving = true;
      console.log(`Could not save what has played to ${statePath}, a restart will start the shuffle over: ${e.message}`);
    }
  }
};

const getPlayOrder = playOrder => {
  return PLAY_ORDERS.indexOf(playOrder) !== -1 ? playOrder : DEFAULT_PLAY_ORDER;
};

const getFolderState = (projectPath, folder) => {
  const key = nodePath.relative(projectPath, folder).split(nodePath.sep).join('/') || '.';
  const folderState = state.folders[key];
  if (!folderState || !Array.isArray(folderState.played)) {
    state.folders[key] = { played: [], last: undefined };
  }
  return state.folders[key];
};

// A file's name within its folder, with / on every OS, or undefined if it isn't in the folder
const getName = (folder, file) => {
  const name = nodePath.relative(folder, file);
  if (!name || name.startsWith('..') || nodePath.isAbsolute(name)) {
    return undefined;
  }
  return name.split(nodePath.sep).join('/');
};

// Remember that file played. Files from outside folder are ignored
const markPlayed = (projectPath, folder, file) => {
  const name = getName(folder, file);
  if (!name) {
    return;
  }
  loadState(projectPath);
  const folderState = getFolderState(projectPath, folder);
  if (folderState.played.indexOf(name) === -1) {
    folderState.played.push(name);
  }
  folderState.last = name;
  saveState();
};

// Pick the next file to play from files (all in folder), and remember it
const pickNext = (projectPath, folder, files, playOrder) => {
  if (files.length === 0) {
    throw new Error(`No supported files found in ${folder}`);
  }
  loadState(projectPath);
  const folderState = getFolderState(projectPath, folder);
  const order = getPlayOrder(playOrder);

  let pick;
  if (order === 'random') {
    pick = files[Math.floor(Math.random() * files.length)];
  } else if (order === 'in_order') {
    const sorted = files.slice().sort((a, b) => nameCollator.compare(getName(folder, a), getName(folder, b)));
    // The first file after the last one played. Works when that file has since been removed too
    const next = folderState.last ? sorted.find(file => nameCollator.compare(getName(folder, file), folderState.last) > 0) : undefined;
    pick = next || sorted[0];
  } else {
    // Forget files that are gone, then pick from those not played yet this round
    const names = new Set(files.map(file => getName(folder, file)));
    folderState.played = folderState.played.filter(name => names.has(name));
    const played = new Set(folderState.played);
    let remaining = files.filter(file => !played.has(getName(folder, file)));
    if (remaining.length === 0) {
      // Everything has played: start a new round, but not with the file that just played
      folderState.played = [];
      remaining = files.length > 1 ? files.filter(file => getName(folder, file) !== folderState.last) : files;
    }
    pick = remaining[Math.floor(Math.random() * remaining.length)];
  }

  markPlayed(projectPath, folder, pick);
  return pick;
};

module.exports = {
  PLAY_ORDERS: PLAY_ORDERS,
  STATE_FILE_NAME: STATE_FILE_NAME,
  pickNext: pickNext,
  markPlayed: markPlayed
};
