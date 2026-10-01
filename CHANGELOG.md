# Changelog

## 3.0.0-vibe

The first release of podcast-radio, forked from [live-stream-radio](https://github.com/torch2424/live-stream-radio) 2.2.1. Projects and `config.json` files from live-stream-radio work unchanged.

**Breaking:** Node.js 22 or newer is required, or run it with [Docker](docs/running-on-a-server.md#docker).

### For podcasts

- **Renamed to podcast-radio.** The command, package and repository are now `podcast-radio`. The `live-stream-radio` command still works, so existing services don't need changing.
- **Podcast feeds.** Add a podcast's RSS feed and new episodes download by themselves into a folder for the show, where they join the rotation. The newest 10 are kept by default. See [Podcast feeds](docs/podcast-feeds.md).
- **No repeats.** The new default play order shuffles episodes so each one plays once before any repeats, or `in_order` plays them by file name. A restart carries on the same round. Before, each track was picked at random, so the same one could play twice in a row.
- **Missing tags don't show "undefined".** Files without an artist or album tag skip that line on screen, and files without a title show their file name.
- **More audio formats:** `.m4a`, `.aac`, `.ogg` and `.opus`, with extensions in any case.

### New

- **Web console** at `/console`, with username and password sign-in. See [Web console](docs/web-console.md).
- **Several stream outputs at once.** `stream_outputs` can list several URLs, and all of them are used. Before, only the first was.
- **Docker image** and `docker-compose.yml`.
- **Reverse proxy configs** for Caddy and nginx, with `api.trust_proxy`.

### Reliability

- **The stream keeps running when an episode fails.** An ffmpeg error, the stream server dropping the connection, an unreadable file or an empty folder used to stop the whole process. The next episode is now tried after 2 seconds, waiting up to a minute while failures continue, and the API and console stay up.
- **A broken config edit doesn't stop the stream.** The last config that worked is used until it's fixed. `PUT` and `POST /config` refuse configs the stream can't run, and write `config.json` atomically.
- **Config changes apply without a restart.** `config.json` is read again at the start of every episode, including the stream URL and key.
- **Quick skips can't crash or leave two ffmpegs streaming.**
- **History keeps the newest items.** After 100 tracks, it used to keep only the first one ever played.
- **Apostrophes and other characters in titles can't break the stream.** Overlay text is passed to ffmpeg through a file.
- **`"false"` means false.** On/off settings written as strings, as the old template did, were always treated as on.

### Audio and video

- **Full volume.** Mixing in the silent track halved the volume (-6 dB) unless `normalize_audio` was on.
- **Works with current ffmpeg**, including 5.x through 9.x. ffmpeg is run directly instead of through fluent-ffmpeg, which is no longer maintained.
- **The default video size is 854x480** (it was portrait, 480x854).
- **GIFs are converted once** and reused.

### Security

- **Every generated project gets its own random API key.** A config still using the old shared `super-secret-api-key` won't start if the API can be reached from other computers.
- **The stream key stays out of the logs**, which the console shows.
- **API keys are compared in constant time**, and expired console sessions are cleaned up.
- **Current dependencies:** fastify 5, music-metadata 11 and the rest. Several old packages were replaced by Node built-ins, and `npm audit` is clean.

### Other

- **Absolute project folders work**, e.g. `podcast-radio /srv/podcast`.
- **Tests** (`npm test`) and CI on Node 22 and 24.
- **New documentation** in [docs/](docs/README.md).
