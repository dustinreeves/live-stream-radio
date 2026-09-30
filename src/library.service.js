// Singleton service to list the audio / video files in a folder.
// Listings are kept for a minute, so big libraries aren't rescanned for every track and api request.
const fs = require('fs');
const nodePath = require('path');

const CACHE_MILLISECONDS = 60 * 1000;

let cache = {};

// All files in directory (and its subfolders) matching any of the extension regexes, sorted
const listFiles = (extensions, directory) => {
  const cacheKey = `${directory}\n${extensions.map(String).join('\n')}`;
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.date < CACHE_MILLISECONDS) {
    return cached.files;
  }

  if (!fs.existsSync(directory)) {
    throw new Error(`The folder ${directory} does not exist`);
  }

  const files = [];
  // Real paths of the folders seen, so a symlink loop can't make this go forever
  const seenFolders = new Set();
  const walk = folder => {
    let realFolder;
    try {
      realFolder = fs.realpathSync(folder);
    } catch (e) {
      return;
    }
    if (seenFolders.has(realFolder)) {
      return;
    }
    seenFolders.add(realFolder);

    fs.readdirSync(folder).forEach(name => {
      const filePath = nodePath.join(folder, name);
      let stats;
      try {
        // stat follows symlinks, so linked files and folders are included
        stats = fs.statSync(filePath);
      } catch (e) {
        // A broken link, or removed while listing
        return;
      }
      if (stats.isDirectory()) {
        walk(filePath);
      } else if (stats.isFile() && extensions.some(extension => extension.test(filePath))) {
        files.push(filePath);
      }
    });
  };
  walk(directory);
  files.sort();

  cache[cacheKey] = { date: Date.now(), files: files };
  return files;
};

module.exports = {
  listFiles: listFiles,
  // Forget all listings, e.g. after a file turned out to be missing
  clearCache: () => {
    cache = {};
  }
};
