# API

podcast-radio has an HTTP JSON API on `api.host` and `api.port` (by default http://localhost:8000). The web console uses it, and you can use it for your own tools: a status widget, a chat bot that queues episodes, or a script that skips on a schedule.

## Requests

Send request bodies as JSON (`Content-Type: application/json`) or as a form (`application/x-www-form-urlencoded`). For a POST without a body, leave `Content-Type` out: an empty body sent as JSON is refused with HTTP 400. Every response is JSON.

### Signing requests

Every endpoint except `/console`, `/console/login` and `/console/logout` needs one of:

| How                                                 | Example                            |
| --------------------------------------------------- | ---------------------------------- |
| The API key in the `Authorization` header           | `Authorization: <api.key>`         |
| A console session token, from `POST /console/login` | `Authorization: Session <token>`   |
| The API key as a query parameter                    | `/stream/status?api_key=<api.key>` |
| The API key in a POST body                          | `{ "api_key": "<api.key>" }`       |

Without them the answer is HTTP 401. Prefer the header: query parameters can end up in proxy logs. If a project has no `api.key` and no console users, the API is open to anyone who can reach it.

```
curl -H "Authorization: $API_KEY" http://localhost:8000/stream/status
curl -X POST -H "Authorization: $API_KEY" http://localhost:8000/stream/restart
```

## Endpoints

| Endpoint                                                                    | What it does                             |
| --------------------------------------------------------------------------- | ---------------------------------------- |
| [`GET /stream`](#get-stream)                                                | Is the stream running                    |
| [`GET /stream/status`](#get-streamstatus)                                   | What's playing, and how far along        |
| [`POST /stream/start`, `/stop`, `/restart`](#post-streamstart-stop-restart) | Start, stop, or skip to the next episode |
| [`GET /stream/history`](#get-streamhistory)                                 | Recently played                          |
| [`GET /stream/log`](#get-streamlog)                                         | Recent log lines                         |
| [`GET /stream/queue`, `POST /stream/queue`](#the-queue)                     | The queue, and adding to it              |
| [`POST /stream/queue/remove`, `/clear`](#the-queue)                         | Removing from the queue                  |
| [`GET /library/audio`](#get-libraryaudio)                                   | Every episode the stream can play        |
| [`GET /podcasts`](#get-podcasts)                                            | Podcast feeds and downloads              |
| [`POST /podcasts/check`, `/feeds`, `/feeds/remove`](#post-podcastscheck)    | Check feeds now, add or remove a feed    |
| [`GET`, `POST`, `PUT /config`](#config)                                     | Read and change settings                 |
| [`POST /console/login`, `/logout`](#console-sign-in)                        | Console sessions                         |

### GET /stream

```json
{ "isRunning": true }
```

### GET /stream/status

What's playing (the latest history item), ffmpeg's progress through it, and how long podcast-radio has been running, in seconds. `progress.seconds` includes the 3 seconds of silence before each episode.

```json
{
  "isRunning": true,
  "nowPlaying": {
    "type": "radio",
    "requested": false,
    "audio": {
      "path": "/srv/my-podcast/audio/My Show/2026-09-30 Episode 120.mp3",
      "duration": 3512.4,
      "metadata": { "title": "Episode 120", "artist": "My Show" }
    },
    "video": { "path": "/srv/my-podcast/video/loop.mp4" },
    "date": 1790000000000
  },
  "progress": { "seconds": 612, "fps": 24.1, "kbps": 640.2, "date": 1790000612000 },
  "uptime": 86400
}
```

### POST /stream/start, /stop, /restart

`start` starts the stream if it's stopped. `stop` stops it, and podcast-radio and the console keep running. `restart` stops the current episode and starts the next one a second later, which is how the console skips. Each answers `{ "message": "OK" }`.

### GET /stream/history

The most recent items, oldest first, up to `api.number_of_history_items` (100 by default). Each has the same shape as `nowPlaying` above. `type` is `radio` for an episode or `interlude`, and `requested` is `true` for episodes played from the queue.

```json
{ "history": [{ "type": "radio", "requested": false, "audio": { "...": "..." }, "video": { "...": "..." }, "date": 1790000000000 }] }
```

### GET /stream/log

Up to the last 500 lines of log output, with colour codes removed. Pass `?since=<id>` to get only lines newer than that one.

```json
{ "log": [{ "id": 41, "date": 1790000000000, "text": "Playing the audio:" }] }
```

### The queue

Episodes in the queue play next, in order, skipping interludes. Then the stream goes back to its play order. The queue is kept in memory, so a restart clears it.

| Endpoint                    | Body                                                                                                                                               | Answers                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `GET /stream/queue`         |                                                                                                                                                    | `{ "queue": [ { "path": "...", "date": 1790000000000 } ] }`                      |
| `POST /stream/queue`        | `path` (exactly as listed by `GET /library/audio`); optional `play_next: true` to put it first, or `play_now: true` to put it first and skip to it | The queue. 400 if the file isn't in the library, or the queue already holds 200. |
| `POST /stream/queue/remove` | `index` (from 0); optional `path`, to remove it only if it's still the episode at `index`                                                          | The queue. 409 if `path` no longer matches, 400 if there's nothing at `index`.   |
| `POST /stream/queue/clear`  |                                                                                                                                                    | The empty queue                                                                  |

### GET /library/audio

Every audio file in `radio.audio_directory`, including subfolders:

```json
{ "audio": ["/srv/my-podcast/audio/My Show/2026-09-30 Episode 120.mp3"] }
```

With `?include_metadata`, each file comes with its tags. A file that can't be read has an `error` instead.

```json
{
  "audio": [
    {
      "path": "/srv/my-podcast/audio/My Show/2026-09-30 Episode 120.mp3",
      "metadata": { "title": "Episode 120", "artist": "My Show", "album": "My Show" }
    }
  ]
}
```

### GET /podcasts

The podcast feeds and how downloading is going. `download` appears while an episode downloads, and `nextCheck` while waiting for the next check.

```json
{
  "checking": false,
  "lastCheck": "2026-09-30T16:00:00.000Z",
  "nextCheck": "2026-09-30T17:00:00.000Z",
  "checkEveryMinutes": 60,
  "feeds": [
    {
      "url": "https://example.com/feed.xml",
      "title": "My Show",
      "directory": "./audio/My Show",
      "keepLatest": 10,
      "lastChecked": "2026-09-30T16:00:00.000Z",
      "episodes": 10,
      "latest": "Episode 120"
    }
  ]
}
```

### POST /podcasts/check

Checks every feed now instead of waiting for the next check. It answers straight away, like `GET /podcasts`.

### POST /podcasts/feeds

Adds a feed to `config.json` and starts downloading. The feed is read first, so a wrong URL is caught. Its episodes go into a folder named after the show, inside `radio.audio_directory`.

| Body          |                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------- |
| `url`         | The feed's address, `http://` or `https://`                                               |
| `keep_latest` | Optional. How many of the newest episodes to keep. Default 10, and 0 keeps every episode. |

It answers with the feed's title, its episode count and the config entry. It answers 400 if the URL isn't a readable RSS feed, has no audio episodes, or is already added, or if the project uses a `config.js`.

### POST /podcasts/feeds/remove

Body: `url`. Removes the feed from `config.json`. Episodes already downloaded stay. It answers 404 if the feed isn't in the config.

### Config

| Endpoint                           | What it does                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /config`                      | The whole config: `{ "value": { ... } }`                                                                                                                      |
| `GET /config?key=radio.play_order` | One setting, by its dotted name: `{ "key": "radio.play_order", "value": "shuffle" }`. 404 if it isn't set.                                                    |
| `POST /config`                     | Change one setting. Body: `key` (dotted name) and `value` (JSON: `"\"in_order\""`, `5`, `true`). Answers `{ "response": { "key", "oldValue", "newValue" } }`. |
| `PUT /config`                      | Replace the whole config. Body: `{ "config": { ... } }`. The previous file is kept as `config.json.bak`.                                                      |

Both `POST` and `PUT` refuse, with 400, a change that would leave a config the stream can't run: a missing `api` or `radio` section, a missing audio or video folder setting, an unknown `play_order`, or a bad feed. Changes apply from the next episode; see [Configuration](configuration.md#when-changes-apply).

### Console sign-in

`POST /console/login` with `username` and `password` answers `{ "token", "username", "expires" }`. Send the token as `Authorization: Session <token>`. A wrong password answers 401, and after 5 wrong passwords from one address, 429 for 15 minutes. `POST /console/logout` ends the session in the `Authorization` header.

`GET /console` serves the [web console](web-console.md) page.
