// List of supported file types, as regex for pathnames (any case, so .MP3 works too)
// Lossless video formats decode better and perform better
// But gifs require pre-encoding
// https://superuser.com/questions/486325/lossless-universal-video-format
module.exports = {
  supportedAudioTypes: [/\.mp3$/i, /\.flac$/i, /\.wav$/i, /\.m4a$/i, /\.aac$/i, /\.ogg$/i, /\.opus$/i],
  supportedVideoTypes: [/\.mov$/i, /\.avi$/i, /\.mkv$/i, /\.webm$/i, /\.mp4$/i, /\.m4v$/i, /\.gif$/i]
};
