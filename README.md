# live-stream-radio

_formerly known as piStreamRadio._

![Galaxy Noise Radio Live Stream link](https://files.aaronthedev.com/$/zk7xg)

[CLI Usage Screenshot](./docz/assets/CLIUsage.png) 🖼️

[Documentation](https://torch2424.github.io/live-stream-radio/) 📚

`live-stream-radio` is a 24/7 live stream video radio station 📹 📻 CLI built with [Node.js](https://nodejs.org/) and powered by [FFmpeg](http://ffmpeg.org). Meaning, This will allow for live streaming a video of music, playing over a video/gif, with the music information, and other overlay items 🖼️. Music and video are chosen from their respective folders in a defined `config.json` that can be generated using the CLI. Generated projects come included with some songs and videos to get up and running quickly! Also, this project has a REST HTTP JSON Api, to allow for interfacing with your stream using a frontend 👩‍💻.

> **This is a fork** of [torch2424/live-stream-radio](https://github.com/torch2424/live-stream-radio), which was archived in 2022. It adds a built-in [web console](#web-console) for running your station from a browser, plus the fixes listed under [Changes in this fork](#changes-in-this-fork). Existing projects and `config.json` files work unchanged.

<!-- prettier-ignore -->
> [!WARNING]
> **🤖 AI SLOP ALERT 🤖** Everything added in this fork (the web console, the login system, the settings form, the bug fixes, and yes, this README) was written by an AI (Claude), with a human pointing at things and saying "do that". It has been run on exactly one Windows PC against the sample songs, and not yet on a real station. It might be fine. It might set your stream on fire. Read the code before you trust it with your stream key, and please open an issue when it inevitably does something dumb.

# Table of Contents

- [Getting Started](#getting-started)
- [Web Console](#web-console)
- [Changes in this fork](#changes-in-this-fork)
- [API Frontends](#api-frontends)
- [Compatibility](#compatibility)
- [Example Assets from the `--generate` template](#example-assets-from-the---generate-template)
- [Contributing](#contributing)
- [License](#license)

# Getting Started

Please see the [Documentation](https://torch2424.github.io/live-stream-radio/) 📚 for how to get started using `live-stream-radio`. In particular, the [Installation Guide](https://torch2424.github.io/live-stream-radio/#/cli/getting-started#installation) and [CLI Usage](https://torch2424.github.io/live-stream-radio/#/cli/usage) will be the most useful to new users. 😄

# Web Console

A browser page, served by `live-stream-radio` itself, for running the station without a shell:

- **Control** – start, stop and skip the current track.
- **Now playing** – the current track, its progress, and ffmpeg's live fps and bitrate.
- **History** – the last 50 tracks and interludes.
- **Live log** – the same output you'd see in the terminal or syslog.
- **Stream settings** – edit the on-screen text (title, artist / album / song lines: wording, size, colours, position, scrolling), the overlay image, interludes, media folders, stream URL and key, and video / audio quality, all in a form. An _Advanced (JSON)_ tab edits the raw `config.json`.
- **Library** – search the audio files the station can play.

Nothing extra to install: no build step and no new dependencies.

## Setting it up

1. **Add a console user** on the machine running the stream. You'll be asked for a username and a password (at least 10 characters, typed hidden):

   ```bash
   live-stream-radio --set-password my-radio-project
   ```

   Run it again with the same username to change that user's password. Users are stored in the project's `config.json` under `console.users`, with the passwords hashed (pbkdf2).

2. **Open the console** at `http://<api.host>:<api.port>/console` (for a generated project, `http://localhost:8000/console`) and sign in. You can also sign in with the project's `api.key` using _Use API key instead_.

The console refuses to load until a console user or an `api.key` exists.

## Reaching it from another computer

The console signs in with a password and then sends a session token with every request, so it must not be exposed over plain `http://` on the internet (the sign-in page warns you if it is). Keep `api.host` as `localhost` and use one of these.

### HTTPS with a reverse proxy (recommended)

Ready-made configs are in [`proxy/`](./proxy). Each file has step-by-step instructions at the top.

|                                          | Use it when                                    | Certificate                                 |
| ---------------------------------------- | ---------------------------------------------- | ------------------------------------------- |
| [`proxy/Caddyfile`](./proxy/Caddyfile)   | Nothing else is using ports 80 / 443. Easiest. | Automatic, Caddy gets and renews it         |
| [`proxy/nginx.conf`](./proxy/nginx.conf) | nginx is already running on the server         | One `certbot --nginx` command, auto-renewed |

Not sure? Check what's listening: `sudo ss -tlnp | grep -E ':(80|443) '`.

In short:

1. Point a DNS name (e.g. `radio.example.com`) at the server.
2. Copy the config, replacing `radio.example.com` (and `8000` if you changed `api.port`).
3. In `config.json`, add `"trust_proxy": true` to the `api` section, keeping `"host": "localhost"`, and restart `live-stream-radio`. Behind a proxy every request comes from localhost; this makes the login lockout use each visitor's real address (from `X-Forwarded-For`), so someone else guessing passwords can't lock you out. Only turn it on behind a proxy.
4. Open `https://radio.example.com`, which redirects to the console.

### SSH tunnel

No setup, good for occasional use: from your own computer run `ssh -L 8000:localhost:8000 you@your-server`, then open `http://localhost:8000/console` while the tunnel is open.

## When changes apply

| Setting                                                               | Takes effect                                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| On-screen text, image, interludes, folders, quality, stream URL / key | From the next track. _Save & apply now_ in the console skips to it immediately. |
| `api.host`, `api.port`, `api.number_of_history_items`                 | After restarting the process (e.g. `sudo systemctl restart my-radio.service`).  |
| Console users and `console.session_hours`                             | On the next sign in.                                                            |

Sessions last `console.session_hours` (default 12) and end if the process restarts. After 5 wrong passwords from one address, sign-ins from it are refused for 15 minutes.

New API endpoints used by the console (`GET /stream/status`, `GET /stream/log`, `PUT /config`, `POST /console/login`, `POST /console/logout`) are documented in [src/api/endpoints.mdx](./src/api/endpoints.mdx).

# Changes in this fork

_All AI-written, see the warning at the top._

- **Web console** with username / password sign-in, as above.
- **Config changes apply without a restart.** Before, `config.json` was cached when the process started, so edits (by hand or through `POST /config`) were ignored until a restart. It is now re-read at the start of every track, including the stream URL and key.
- **`"false"` now means false.** On/off settings written as strings (the generated template ships `"enabled": "true"`) were always treated as on, so `"false"` did nothing. `true` / `false` and `"true"` / `"false"` now both work.
- **Missing tags don't show "undefined".** Files with no artist or album tag skip that overlay line instead of showing `Artist: undefined`, and files with no title tag show their file name. Handy for podcast archives.
- **Apostrophes can't crash the stream.** A `'` in the overlay title or in a track's tags broke ffmpeg's filter and stopped the stream. Overlay text is now passed to ffmpeg through a temp file, so any text works.
- **Skipping can't crash the stream.** A skipped track's ffmpeg could report its (expected) kill after the next track had started, which was taken as the new track failing and shut the whole station down.
- **Works with current ffmpeg and Node.** fluent-ffmpeg is updated and patched for the newer `ffmpeg -formats` layout (ffmpeg 6+), and font paths work on Windows.
- **Reverse proxy configs** for Caddy and nginx, and `api.trust_proxy`.
- **The stream key stays out of the logs.** It is replaced with `<stream_key>` in log output, since the log is visible in the web console.
- **API keys are compared in constant time.**

# API Frontends

_For building your own API frontend, please see the [API Documentation](https://torch2424.github.io/live-stream-radio/#/api/endpoints) 📚 on API Endpoints._

This fork includes one: the [web console](#web-console) at `/console`. Other frontends are welcome too! If you make a `live-stream-radio` frontend, please open an issue and so we can add the project here 😄!

# Other Notable Projects

- [live-stream-radio control](https://github.com/BaileyMcKelway/live-stream-radio-api-frontend) - Web control for `live-stream-radio` for streams on Twitch.
- [lsr-wrapper](https://github.com/LSRemote/lsr-wrapper) - A Promise based wrapper around the `live-stream-radio` api.
- [live-stream-radio-cp](https://github.com/Tresmos/live-stream-radio-cp) - Simple web control panel for live-stream-radio.

# Radios built with `live-stream-radio`

Please feel free to share your radio if you are using `live-stream-radio`. Just open an issue, and we can add it to the README. 😄

# Compatibility

Currently, this should work under any OS with support for [Node](https://nodejs.org/en/) and [FFMPEG](https://www.ffmpeg.org/). Specifically in the tradition of this project being developed for Raspberry Pi, formerly as piStreamRadio , this also supports Raspbian as well.

# Example Assets from the `--generate` template

Music is by [Aviscerall](https://aviscerall.bandcamp.com/), and [Marquice Turner](https://marquiceturner.bandcamp.com/). Which is actually me (@torch2424), but I have a musical identitiy problem 😛 . The .mp4 and .webm of the rotating earth, is a [public domain video I found on Youtube](https://www.youtube.com/watch?v=uuY1RXZyUFs). The image overlay uses images from EmojiOne, in particular, their [video camera emoji](https://www.emojione.com/emoji/1f4f9), and their [radio emoji](https://www.emojione.com/emoji/1f4fb).

# Contributing

Feel free to fork the project, open up a PR, and give any contributions! I'd suggest opening an issue first however, just so everyone is aware and can discuss the proposed changes. 👍

# License

LICENSE under [Apache 2.0](https://choosealicense.com/licenses/apache-2.0/). 🐦

This software uses code of [FFmpeg](http://ffmpeg.org) licensed under the [LGPLv2.1](http://www.gnu.org/licenses/old-licenses/lgpl-2.1.html) and it's source can be downloaded [here](./deps/ffmpeg).

As such, this software tries to respect the LGPLv2 License as close as possible to respect FFmpeg and it's authors. Huge shoutout to them for building such an awesome and crazy tool!
