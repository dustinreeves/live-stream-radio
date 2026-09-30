// Fetches and reads podcast RSS feeds
const { XMLParser } = require('fast-xml-parser');
const pkg = require('../../package.json');

const FEED_TIMEOUT_MILLISECONDS = 30 * 1000;
const USER_AGENT = `podcast-radio/${pkg.version} (+https://github.com/dustinreeves/podcast-radio)`;

// Audio file extensions the stream can play, and the enclosure types that map to them
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.flac', '.wav'];
const TYPE_EXTENSIONS = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/ogg': '.ogg',
  'audio/opus': '.opus',
  'audio/flac': '.flac',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav'
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Always arrays, even for feeds with one episode
  isArray: name => name === 'item' || name === 'enclosure',
  processEntities: true,
  htmlEntities: true
});

// The text of an element that may have attributes (e.g. <guid isPermaLink="false">)
const text = value => {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'object') {
    return text(value['#text']);
  }
  return String(value).trim();
};

// The audio extension for an enclosure, from its url or its type, or undefined if it isn't audio
const getAudioExtension = (url, type) => {
  let urlExtension = '';
  try {
    const pathname = new URL(url).pathname;
    const dot = pathname.lastIndexOf('.');
    urlExtension = dot === -1 ? '' : pathname.substr(dot).toLowerCase();
  } catch (e) {
    return undefined;
  }
  if (AUDIO_EXTENSIONS.indexOf(urlExtension) !== -1) {
    return urlExtension;
  }
  return TYPE_EXTENSIONS[String(type || '').toLowerCase()];
};

// Read feed XML into { title, episodes: [{ guid, title, date, url, extension }] }, newest first.
// Episodes without an audio enclosure (e.g. video podcasts) are counted in skipped
const parseFeed = xml => {
  let document;
  try {
    document = parser.parse(xml);
  } catch (e) {
    throw new Error(`That isn't a readable RSS feed: ${e.message}`);
  }
  const channel = document && document.rss && document.rss.channel;
  if (!channel) {
    throw new Error("That isn't an RSS podcast feed (there is no <rss><channel>)");
  }

  const episodes = [];
  let skipped = 0;
  (channel.item || []).forEach((item, index) => {
    const enclosure = (item.enclosure || [])[0];
    const url = enclosure && enclosure['@_url'];
    const extension = url && getAudioExtension(url, enclosure['@_type']);
    if (!extension) {
      skipped++;
      return;
    }
    const date = new Date(text(item.pubDate));
    episodes.push({
      guid: text(item.guid) || url,
      title: text(item.title) || text(item['itunes:title']) || `Episode ${index + 1}`,
      date: isNaN(date.getTime()) ? undefined : date.toISOString(),
      url: url,
      extension: extension,
      feedIndex: index
    });
  });

  // Newest first. Episodes without a date keep their place in the feed, which lists newest first
  episodes.sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    return a.feedIndex - b.feedIndex;
  });
  episodes.forEach(episode => delete episode.feedIndex);

  return {
    title: text(channel.title) || 'Podcast',
    episodes: episodes,
    skipped: skipped
  };
};

const fetchFeed = async url => {
  let response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(FEED_TIMEOUT_MILLISECONDS)
    });
  } catch (e) {
    throw new Error(`Could not fetch the feed: ${e.cause ? e.cause.message : e.message}`);
  }
  if (!response.ok) {
    throw new Error(`The feed answered HTTP ${response.status}`);
  }
  return parseFeed(await response.text());
};

module.exports = {
  USER_AGENT: USER_AGENT,
  parseFeed: parseFeed,
  fetchFeed: fetchFeed,
  getAudioExtension: getAudioExtension
};
