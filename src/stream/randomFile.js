const libraryService = require('../library.service');

// Async Function to get a random file from a path
module.exports = async (extensions, path) => {
  const allFiles = libraryService.listFiles(extensions, path);
  if (allFiles.length === 0) {
    throw new Error(`No supported files found in ${path}`);
  }

  // Return a random file
  return allFiles[Math.floor(Math.random() * allFiles.length)];
};
