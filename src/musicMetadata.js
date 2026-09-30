// music-metadata is an ES module, so it is loaded with import() the first time it's needed
let musicMetadataPromise = undefined;

module.exports = {
  // Read the tags and format (duration etc) of an audio file
  parseFile: async (filePath, options) => {
    if (!musicMetadataPromise) {
      musicMetadataPromise = import('music-metadata');
    }
    const musicMetadata = await musicMetadataPromise;
    return musicMetadata.parseFile(filePath, options);
  }
};
