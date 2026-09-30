// Singleton service to list the audio / video files in a folder.
// Listings are kept for a minute, so big libraries aren't rescanned for every track and api request.
const fs = require('fs');
const find = require('find');

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

  let files = [];
  extensions.forEach(extension => {
    files = files.concat(find.fileSync(extension, directory));
  });
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
