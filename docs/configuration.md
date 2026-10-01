# Configuration

All settings live in `config.json` in your project folder. Most of them can be changed in the web console's Stream settings panel, so you rarely need to edit the file. For a full example, see the [config.json that new projects start with](../src/generate/template/config.json).

On/off settings accept `true` and `false`, or the strings `"true"` and `"false"`. Paths are relative to the project folder unless they start with `/` (or a drive letter on Windows).

## When changes apply

`config.json` is read again at the start of every episode, so most changes apply from the next one. If an edit breaks the file, the stream keeps the last config that worked and logs the error until you fix it.

| Settings                                              | Take effect                    |
| ----------------------------------------------------- | ------------------------------ |
| Everything not listed below                           | From the next episode          |
| `api.host`, `api.port`, `api.number_of_history_items` | After restarting podcast-radio |
| `console.users`, `console.session_hours`              | At the next sign-in            |
| `podcasts.check_every_minutes`                        | After the next feed check      |

## Streaming

| Setting          | What it does                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `stream_url`     | Where to stream, an RTMP URL. `$stream_key` in it is replaced with `stream_key`. New projects are set up for YouTube.                                                                                                                |
| `stream_key`     | The stream key from your streaming platform. It's hidden in the logs.                                                                                                                                                                |
| `stream_outputs` | Use this instead of `stream_url` to stream to several places at once, for example YouTube and Twitch: a list of full URLs, keys included. The video is encoded once and sent to all of them, and if one fails the others keep going. |
| `ffmpeg_path`    | The ffmpeg program to use. Leave it empty to use the `ffmpeg` on your PATH.                                                                                                                                                          |

## Play order

| Setting                 | What it does                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `radio.audio_directory` | The folder your episodes are in. Subfolders are included.                                |
| `radio.play_order`      | How the next episode is picked (below).                                                  |
| `radio.video_directory` | The videos or GIFs that loop behind the audio. One is picked at random for each episode. |

| `play_order`        | Plays                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shuffle` (default) | In a random order, every episode once before any repeats. A new round never starts with the episode that just played.                                                       |
| `in_order`          | By file name, with numbers sorted as numbers (`Episode 9` before `Episode 10`), then from the start again. Feed downloads are named by date, so they play oldest to newest. |
| `random`            | Any episode, every time. Repeats are possible.                                                                                                                              |

What has played is saved in `.podcast-radio-state.json` in the project folder, so a restart carries on the same round. Episodes picked from the console's queue count as played.

## On-screen text

The text drawn over the video is set under `radio.overlay`. Each line is a text block with the settings below.

| Setting                   | What it shows                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `radio.overlay.enabled`   | Turns the text and image on or off.                                                        |
| `radio.overlay.font_path` | The font file, for example `./fonts/Lato-Regular.ttf`. TrueType and OpenType fonts work.   |
| `radio.overlay.title`     | Fixed text, such as your podcast's name. Can scroll across the screen.                     |
| `radio.overlay.artist`    | The episode file's artist tag, usually the host or show. Hidden when a file has no artist. |
| `radio.overlay.album`     | The episode file's album tag, usually the show name. Hidden when a file has no album.      |
| `radio.overlay.song`      | The episode title, from the title tag, or the file name when there is none.                |
| `radio.overlay.image`     | An image over the video, such as your logo (below).                                        |

Each text block has these settings:

| Setting                     | What it does                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `enabled`                   | Show this line or not.                                                                |
| `text`                      | The words to show (title only).                                                       |
| `label`                     | Words shown before the tag (artist, album, song), for example `"Episode: "`.          |
| `font_size`                 | Size, relative to the video's width. `10` is about a thirtieth of the width.          |
| `font_color`, `font_border` | Colours, as `#RRGGBB`.                                                                |
| `position_x`, `position_y`  | Position, as a percentage of the video's width and height from the top left.          |
| `enable_scroll`             | Scroll the text across the screen instead of placing it at `position_x` (title only). |
| `font_scroll_speed`         | Seconds for one pass across the screen, when scrolling.                               |

The image (`radio.overlay.image`) has `enabled`, `image_path`, and `position_x` and `position_y` in pixels. It's stretched to the video's size, so use a PNG of your stream's size with transparency where the video should show through. The layers, bottom to top, are: video, image, text.

## Video and audio quality

| Setting                       | Default in new projects | What it does                                                                      |
| ----------------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| `video_width`, `video_height` | `1280` x `720`          | The stream's size. Without them, 854 x 480.                                       |
| `video_fps`                   | `25`                    | Frames per second. A podcast over a still or slow video looks fine at 24 or less. |
| `video_bit_rate`              | `2500k`                 | Video bitrate.                                                                    |
| `video_codec`                 | `libx264`               | Video encoder.                                                                    |
| `preset`                      | `superfast`             | x264 speed preset. Faster presets use less CPU, at lower quality.                 |
| `crf`, `bufsize`, `threads`   | `28`, `2500k`, `2`      | Passed to ffmpeg as `-crf`, `-bufsize` and `-threads`.                            |
| `audio_codec`                 | `aac`                   | Audio encoder.                                                                    |
| `audio_bit_rate`              | `128k`                  | Audio bitrate.                                                                    |
| `audio_sample_rate`           | `44100`                 | Audio sample rate.                                                                |
| `normalize_audio`             | `true`                  | Evens out loudness between episodes.                                              |
| `max_gif_size`                | `720`                   | GIFs are scaled to fit this many pixels, once, before streaming.                  |

Common sizes: 854 x 480 (480p), 1280 x 720 (720p), 1920 x 1080 (1080p). For the bitrates each platform recommends, see [YouTube's encoder settings](https://support.google.com/youtube/answer/2853702).

## Interludes

Interludes are short clips played between episodes, such as station IDs, promos or ads, from their own folders. They have their own text and image settings under `interlude.overlay`, the same as above.

| Setting                                                  | What it does                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `interlude.enabled`                                      | Play interludes or not.                                                            |
| `interlude.frequency`                                    | How often, from `0` (never) to `1` (between every episode). `0.2` is about 1 in 5. |
| `interlude.audio_directory`, `interlude.video_directory` | The interludes' audio and the video shown during them.                             |
| `interlude.play_order`                                   | Like `radio.play_order`.                                                           |

## Podcast feeds

`podcasts.feeds` and `podcasts.check_every_minutes` are covered in [Podcast feeds](podcast-feeds.md).

## API and console

| Setting                       | What it does                                                                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.host`                    | The address the console and API listen on. Keep `localhost`, and use a [reverse proxy or SSH tunnel](web-console.md#reaching-it-from-another-computer) to reach it from elsewhere. |
| `api.port`                    | Port for the console and API. Default `8000`.                                                                                                                                      |
| `api.key`                     | A key for the [API](api.md), and an alternative console sign-in. New projects get a random one. Keep it secret.                                                                    |
| `api.trust_proxy`             | Set to `true` only when the console is behind a reverse proxy. See [Web console](web-console.md#https-with-a-reverse-proxy).                                                       |
| `api.number_of_history_items` | How many played items the history keeps. Default 100.                                                                                                                              |
| `console.users`               | Console logins. Add them with `podcast-radio --set-password`, not by hand.                                                                                                         |
| `console.session_hours`       | How long a console sign-in lasts. Default 12.                                                                                                                                      |

## Changing settings with code (config.js)

For settings that change on their own, such as a different folder at different times of day, put a `config.js` next to `config.json`. podcast-radio then uses it instead of `config.json`. It exports a function that is called before every episode and returns the config to use:

```js
// config.js: a morning show folder before noon, the full archive the rest of the day
const fs = require('fs');

module.exports = async (path, streamState) => {
  // Read config.json fresh each time, so edits made in the console still apply
  const config = JSON.parse(fs.readFileSync(`${path}config.json`, 'utf8'));
  config.radio.audio_directory = new Date().getHours() < 12 ? './audio/morning' : './audio';
  return config;
};
```

- `path` is the project folder, ending in a path separator.
- `streamState.history` is the list of recently played items, as returned by [`GET /stream/history`](api.md#get-streamhistory).
- If it throws, the last config that worked is used.
- The console's settings panel still edits `config.json`. Read the file fresh, as in the example, so those edits apply. Adding feeds from the console isn't available with a `config.js`; list them under `podcasts.feeds` in `config.json` instead.
