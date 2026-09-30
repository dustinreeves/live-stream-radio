// Singleton service that downloads new episodes from the podcast feeds in config.json:
//   "podcasts": {
//     "check_every_minutes": 60,
//     "feeds": [{ "url": "https://example.com/feed.xml", "keep_latest": 10, "directory": "./audio/My Show" }]
//   }
// A feed can also be just its url. Episodes are saved as "<date> <title>.<ext>", in the feed's directory
// (by default a folder named after the show, inside radio.audio_directory), so they join the rotation.
// With keep_latest, only the newest episodes are kept: older ones this service downloaded are deleted,
// never files it didn't download, and never the one playing. What was downloaded is kept in
// .podcast-radio-feeds.json in the project folder.
const crypto = require('crypto');
const fs = require('fs');
const nodePath = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const colors = require('../colors');
const feedReader = require('./feed');
const libraryService = require('../library.service');
const { projectPath } = require('../configValues');

const STATE_FILE_NAME = '.podcast-radio-feeds.json';
const DEFAULT_KEEP_LATEST = 10;
const DEFAULT_CHECK_EVERY_MINUTES = 60;
const MIN_CHECK_EVERY_MINUTES = 5;
const FIRST_CHECK_DELAY_MILLISECONDS = 10 * 1000;
const DOWNLOAD_TIMEOUT_MILLISECONDS = 60 * 60 * 1000;

let currentPath = undefined;
let currentGetConfig = undefined;
let currentGetPlayingFile = () => undefined;

let checkTimer = undefined;
let checkPromise = undefined;
let lastCheck = undefined;
let nextCheck = undefined;
let currentDownload = undefined;

// { feeds: { "<url>": { title, directory, lastChecked, lastError, episodes: { "<guid>": { file, title, date, removed } } } } }
let state = { feeds: {} };

const getStatePath = () => nodePath.join(currentPath, STATE_FILE_NAME);

const loadState = () => {
  try {
    state = JSON.parse(fs.readFileSync(getStatePath(), 'utf8'));
  } catch (e) {
    state = undefined;
  }
  if (!state || typeof state !== 'object' || !state.feeds || typeof state.feeds !== 'object') {
    state = { feeds: {} };
  }
};

// Write to a temp file, then rename it over the state file, so it is never half written
const saveState = () => {
  const statePath = getStatePath();
  const tempPath = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
  fs.renameSync(tempPath, statePath);
};

// A name that is safe as a file or folder name on Linux, macOS and Windows
const safeFileName = name => {
  let safe = String(name)
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .substr(0, 120)
    .trim();
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(safe)) {
    safe += '_';
  }
  return safe || 'podcast';
};

// "2026-09-30 Episode title.mp3", the date first so in_order plays oldest to newest
const getEpisodeFileName = episode => {
  const date = episode.date ? `${episode.date.substr(0, 10)} ` : '';
  return `${safeFileName(`${date}${episode.title}`)}${episode.extension}`;
};

// feeds from the config, as { url, keep_latest, directory } objects
const getFeedConfigs = config => {
  const feeds = config.podcasts && Array.isArray(config.podcasts.feeds) ? config.podcasts.feeds : [];
  return feeds
    .map(feed => (typeof feed === 'string' ? { url: feed } : feed))
    .filter(feed => feed && typeof feed.url === 'string' && feed.url.length > 0);
};

const getKeepLatest = feedConfig => {
  const keepLatest = parseInt(feedConfig.keep_latest, 10);
  return keepLatest >= 0 ? keepLatest : DEFAULT_KEEP_LATEST;
};

const getCheckEveryMinutes = config => {
  const minutes = parseFloat(config.podcasts && config.podcasts.check_every_minutes);
  return minutes > 0 ? Math.max(MIN_CHECK_EVERY_MINUTES, minutes) : DEFAULT_CHECK_EVERY_MINUTES;
};

// The folder for a feed's episodes, relative to the project, as it would be written in config.json
const getDefaultDirectory = (config, title) => {
  const audioDirectory = (config.radio && config.radio.audio_directory) || './audio';
  return `${audioDirectory.replace(/[\\/]+$/, '')}/${safeFileName(title)}`;
};

const downloadEpisode = async (episode, filePath) => {
  const partPath = `${filePath}.part`;
  try {
    const response = await fetch(episode.url, {
      headers: { 'User-Agent': feedReader.USER_AGENT },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MILLISECONDS)
    });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }

    const totalBytes = parseInt(response.headers.get('content-length'), 10) || undefined;
    currentDownload = { title: episode.title, bytes: 0, totalBytes: totalBytes };
    const body = Readable.fromWeb(response.body);
    body.on('data', chunk => {
      currentDownload.bytes += chunk.length;
    });
    await pipeline(body, fs.createWriteStream(partPath));
    fs.renameSync(partPath, filePath);
  } catch (e) {
    fs.rmSync(partPath, { force: true });
    throw new Error(`Could not download "${episode.title}": ${e.cause ? e.cause.message : e.message}`);
  } finally {
    currentDownload = undefined;
  }
};

const isSameFile = (a, b) => Boolean(a && b) && nodePath.resolve(a) === nodePath.resolve(b);

// Bring one feed's folder up to date: download new episodes, remove ones past keep_latest
const syncFeed = async (config, feedConfig) => {
  const feedState = state.feeds[feedConfig.url] || { episodes: {} };
  state.feeds[feedConfig.url] = feedState;
  feedState.lastChecked = new Date().toISOString();

  const feed = await feedReader.fetchFeed(feedConfig.url);
  feedState.title = feed.title;
  feedState.directory = feedConfig.directory || feedState.directory || getDefaultDirectory(config, feed.title);
  const directory = projectPath(currentPath, feedState.directory);
  fs.mkdirSync(directory, { recursive: true });

  const keepLatest = getKeepLatest(feedConfig);
  const wanted = keepLatest > 0 ? feed.episodes.slice(0, keepLatest) : feed.episodes;
  const wantedGuids = new Set(wanted.map(episode => episode.guid));
  const errors = [];
  let downloaded = 0;

  // Newest first, so the newest episode is ready soonest. Episodes removed by hand are not downloaded
  // again, but ones this service removed are, if they are wanted again (e.g. keep_latest went up)
  for (const episode of wanted) {
    const known = feedState.episodes[episode.guid];
    if (known && !known.removed) {
      continue;
    }

    // Never overwrite another episode, or a file that was already there
    let fileName = getEpisodeFileName(episode);
    const usedNames = new Set(
      Object.keys(feedState.episodes)
        .filter(guid => guid !== episode.guid && !feedState.episodes[guid].removed)
        .map(guid => feedState.episodes[guid].file)
    );
    if (usedNames.has(fileName) || (fs.existsSync(nodePath.join(directory, fileName)) && !(known && known.file === fileName))) {
      const suffix = crypto.createHash('sha1').update(episode.guid).digest('hex').substr(0, 6);
      fileName = `${fileName.substr(0, fileName.length - episode.extension.length)} (${suffix})${episode.extension}`;
    }
    const filePath = nodePath.join(directory, fileName);
    try {
      console.log(`${colors.magenta('Downloading podcast episode:')} ${feed.title}: ${episode.title}`);
      await downloadEpisode(episode, filePath);
      feedState.episodes[episode.guid] = { file: fileName, title: episode.title, date: episode.date };
      downloaded++;
      saveState();
    } catch (e) {
      errors.push(e.message);
    }
  }

  // Remove downloads that are no longer among the newest, except the one playing
  if (keepLatest > 0) {
    const playingFile = currentGetPlayingFile();
    Object.keys(feedState.episodes).forEach(guid => {
      const known = feedState.episodes[guid];
      if (known.removed || wantedGuids.has(guid)) {
        return;
      }
      const filePath = nodePath.join(directory, known.file);
      if (isSameFile(filePath, playingFile)) {
        return;
      }
      fs.rmSync(filePath, { force: true });
      known.removed = true;
      console.log(`${colors.magenta('Removed an older podcast episode:')} ${feed.title}: ${known.title}`);
    });
  }

  // Forget removed episodes that have left the feed too
  const feedGuids = new Set(feed.episodes.map(episode => episode.guid));
  Object.keys(feedState.episodes).forEach(guid => {
    if (feedState.episodes[guid].removed && !feedGuids.has(guid)) {
      delete feedState.episodes[guid];
    }
  });

  feedState.lastError = errors.length > 0 ? errors.join('; ') : undefined;
  return { downloaded: downloaded, errors: errors };
};

const checkAllFeeds = async () => {
  const config = await currentGetConfig();
  const feedConfigs = getFeedConfigs(config);
  let downloaded = 0;

  for (const feedConfig of feedConfigs) {
    try {
      const result = await syncFeed(config, feedConfig);
      downloaded += result.downloaded;
      result.errors.forEach(message => console.log(colors.yellow(message)));
    } catch (e) {
      const feedState = state.feeds[feedConfig.url];
      if (feedState) {
        feedState.lastError = e.message;
      }
      console.log(colors.yellow(`Could not check the podcast feed ${feedConfig.url}: ${e.message}`));
    }
    try {
      saveState();
    } catch (e) {
      console.log(colors.yellow(`Could not save ${STATE_FILE_NAME}: ${e.message}`));
    }
  }

  if (downloaded > 0) {
    // Let the new episodes into the rotation straight away
    libraryService.clearCache();
    console.log(`${colors.green(`Downloaded ${downloaded} new podcast episode${downloaded === 1 ? '' : 's'}`)} 🎙️`);
  }
  lastCheck = new Date().toISOString();
  return config;
};

// Check now, unless a check is already running, then wait for that one
const checkNow = () => {
  if (!checkPromise) {
    clearTimeout(checkTimer);
    checkPromise = checkAllFeeds()
      .catch(e => {
        console.log(colors.yellow(`Could not check the podcast feeds: ${e.message}`));
        return undefined;
      })
      .then(config => {
        checkPromise = undefined;
        scheduleCheck(config ? getCheckEveryMinutes(config) * 60 * 1000 : DEFAULT_CHECK_EVERY_MINUTES * 60 * 1000);
      });
  }
  return checkPromise;
};

const scheduleCheck = delayMilliseconds => {
  clearTimeout(checkTimer);
  nextCheck = new Date(Date.now() + delayMilliseconds).toISOString();
  checkTimer = setTimeout(checkNow, delayMilliseconds);
  // Don't keep the process alive just for the next check
  checkTimer.unref();
};

module.exports = {
  STATE_FILE_NAME: STATE_FILE_NAME,
  safeFileName: safeFileName,
  getEpisodeFileName: getEpisodeFileName,
  getFeedConfigs: getFeedConfigs,
  getDefaultDirectory: getDefaultDirectory,

  // Start checking the feeds. getPlayingFile returns the path of the file playing, which is never removed
  start: (path, getConfig, getPlayingFile) => {
    currentPath = path;
    currentGetConfig = getConfig;
    currentGetPlayingFile = getPlayingFile || (() => undefined);
    loadState();
    scheduleCheck(FIRST_CHECK_DELAY_MILLISECONDS);
  },
  checkNow: checkNow,
  stop: () => {
    clearTimeout(checkTimer);
  },

  getStatus: async () => {
    const config = await currentGetConfig();
    return {
      checking: Boolean(checkPromise),
      lastCheck: lastCheck,
      nextCheck: checkPromise ? undefined : nextCheck,
      checkEveryMinutes: getCheckEveryMinutes(config),
      download: currentDownload,
      feeds: getFeedConfigs(config).map(feedConfig => {
        const feedState = state.feeds[feedConfig.url] || { episodes: {} };
        const episodes = Object.keys(feedState.episodes)
          .map(guid => feedState.episodes[guid])
          .filter(episode => !episode.removed);
        episodes.sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1));
        return {
          url: feedConfig.url,
          title: feedState.title,
          directory: feedConfig.directory || feedState.directory,
          keepLatest: getKeepLatest(feedConfig),
          lastChecked: feedState.lastChecked,
          lastError: feedState.lastError,
          episodes: episodes.length,
          latest: episodes.length > 0 ? episodes[0].title : undefined
        };
      })
    };
  },

  // Fetch a feed, to check it works and learn its title, before it is added to the config
  readFeed: url => feedReader.fetchFeed(url)
};
