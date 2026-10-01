# podcast-radio

Run your podcast as a 24/7 live stream on YouTube, Twitch, or anywhere that takes RTMP.

podcast-radio plays your episodes one after another over a looping video or image, with the show and episode title on screen. It can download new episodes from your podcast's RSS feed by itself, and you run it all from a web console in your browser.

- **Every episode before any repeats.** Episodes are shuffled so each one plays once per round, or they play in order, oldest to newest. A restart carries on where it left off.
- **New episodes arrive by themselves.** Add your podcast's RSS feed and new episodes download into the rotation, keeping the newest 10 (or as many as you choose).
- **A web console** to start, stop and skip, queue an episode to play next or right now, edit the on-screen text and settings, and watch the live log.
- **Keeps going.** If an episode or the connection fails, it tries the next one instead of taking the stream down.
- **Runs anywhere Docker or Node.js 22 runs**, including a small VPS. Stream to several platforms at once.

## Quick start

You need [Node.js](https://nodejs.org/) 22 or newer and [FFmpeg](https://ffmpeg.org/download.html), or just [Docker](docs/running-on-a-server.md#docker).

```
npm install -g github:dustinreeves/podcast-radio
podcast-radio --generate my-podcast
```

Put your episodes in `my-podcast/audio`, set `stream_key` in `my-podcast/config.json` to your YouTube stream key, then:

```
podcast-radio --set-password my-podcast
podcast-radio my-podcast
```

Open http://localhost:8000/console and sign in. The [getting started guide](docs/getting-started.md) walks through each step.

## Documentation

| Page                                               | What's in it                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| [Getting started](docs/getting-started.md)         | Install, create a project, add episodes, go live                    |
| [Podcast feeds](docs/podcast-feeds.md)             | Download new episodes from RSS automatically                        |
| [Web console](docs/web-console.md)                 | Run the stream from your browser, and reach it from other computers |
| [Configuration](docs/configuration.md)             | Every `config.json` setting, the on-screen text, play order         |
| [Running on a server](docs/running-on-a-server.md) | Docker, systemd, HTTPS with Caddy or nginx, updating                |
| [Command line](docs/cli.md)                        | The `podcast-radio` command and its options                         |
| [API](docs/api.md)                                 | The HTTP JSON API the console uses, for your own tools              |
| [FAQ](docs/faq.md)                                 | File types, performance, stream settings, common problems           |

## About this project

podcast-radio is a fork of [live-stream-radio](https://github.com/torch2424/live-stream-radio) by Aaron Turner, which was archived in 2022, reworked for podcasts. Projects and `config.json` files from live-stream-radio still work, and the old `live-stream-radio` command still runs it. See the [changelog](CHANGELOG.md) for what changed.

<!-- prettier-ignore -->
> [!WARNING]
> Everything added in this fork (the web console, podcast feeds, the Docker setup, the fixes, and these docs) was written by an AI (Claude), with a human pointing at things and saying "do that". It runs a real podcast stream, but read the code before you trust it with your stream key, and please [open an issue](https://github.com/dustinreeves/podcast-radio/issues) when something breaks.

## License

[Apache 2.0](LICENSE). podcast-radio runs [FFmpeg](https://ffmpeg.org/), which is licensed separately under the LGPL or GPL depending on how it was built ([FFmpeg's license page](https://ffmpeg.org/legal.html)). The sample media in generated projects is credited in the [FAQ](docs/faq.md#where-does-the-sample-media-come-from).
