# Getting started

This guide takes you from nothing to your podcast streaming live, in about 15 minutes. To run it on a server with Docker instead, read this page for the project setup, then follow [Running on a server](running-on-a-server.md#docker).

## 1. Install Node.js and FFmpeg

**Node.js 22 or newer.** Get the LTS installer from [nodejs.org](https://nodejs.org/en/download), or use a version manager such as [nvm](https://github.com/nvm-sh/nvm) (macOS and Linux) or [nvm-windows](https://github.com/coreybutler/nvm-windows). Check it with `node -v`.

**A recent FFmpeg**, built with libfreetype so it can draw text on the video. It's tested with FFmpeg 5.1 and 9.0, and most builds include libfreetype:

| System                          | Install                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| Ubuntu, Debian, Raspberry Pi OS | `sudo apt install ffmpeg`                                                                    |
| macOS                           | `brew install ffmpeg` ([Homebrew](https://brew.sh/))                                         |
| Windows                         | `winget install Gyan.FFmpeg`, or a build from [ffmpeg.org](https://ffmpeg.org/download.html) |

Check it with `ffmpeg -version`. If `ffmpeg` isn't on your PATH, set `ffmpeg_path` in your project's `config.json` instead.

## 2. Install podcast-radio

```
npm install -g github:dustinreeves/podcast-radio
podcast-radio --help
```

## 3. Create a project

A project is a folder that holds your settings, episodes, videos and fonts. Create one, named however you like:

```
podcast-radio --generate my-podcast
```

It comes with sample audio and videos, so it can stream straight away:

| Path                              | What goes there                                                     |
| --------------------------------- | ------------------------------------------------------------------- |
| `config.json`                     | All settings. You'll mostly change them in the web console.         |
| `audio/`                          | Your episodes. Subfolders are included.                             |
| `video/`                          | What plays behind the audio: videos or GIFs, which loop.            |
| `interludes/`                     | Optional short clips (station IDs, promos) played between episodes. |
| `fonts/`                          | The font for the on-screen text.                                    |
| `podcast-radio-overlay-image.png` | An image laid over the video. Use a PNG with transparency.          |

## 4. Add your episodes

Delete the sample audio in `audio/` and put your episodes there: `.mp3`, `.m4a`, `.aac`, `.ogg`, `.opus`, `.flac` or `.wav`. The episode title, artist and album shown on screen come from each file's tags, and the file name is used when there is no title.

If your podcast has an RSS feed, you can skip copying files: add the feed in the console after step 6 and episodes download by themselves. See [Podcast feeds](podcast-feeds.md).

Put something to look at in `video/`: your cover art as a short looping video, or a GIF. The samples work until you have your own.

## 5. Set your stream key

Open `config.json` and set `stream_key` to the key from your streaming platform. For YouTube, find it in YouTube Studio under Go live, then Stream. `stream_url` is already set for YouTube, and `$stream_key` in it is replaced with your key.

For Twitch or another platform, change `stream_url` to its RTMP address. To stream to several at once, see `stream_outputs` in [Configuration](configuration.md#streaming).

To test without going live, add `--output test.flv` to the start command in step 6: it streams to that file instead.

## 6. Go live

Add a login for the web console, then start the stream:

```
podcast-radio --set-password my-podcast
podcast-radio my-podcast
```

Open http://localhost:8000/console and sign in. You'll see what's playing, and you can skip, queue episodes and change the on-screen text and settings from there. See [Web console](web-console.md).

The stream keeps running until you stop it with Ctrl+C. To keep it running on a server, after reboots and logouts, see [Running on a server](running-on-a-server.md).

## Next steps

- [Add your podcast's RSS feed](podcast-feeds.md), so new episodes join by themselves.
- Choose the [play order](configuration.md#play-order): shuffle (the default) or in order.
- Change the [on-screen text](configuration.md#on-screen-text) to your show's name.
- [Reach the console from another computer](web-console.md#reaching-it-from-another-computer), safely.
