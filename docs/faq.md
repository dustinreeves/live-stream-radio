# FAQ

## Which files can I use?

| Kind                           | Formats                                                  |
| ------------------------------ | -------------------------------------------------------- |
| Episodes and interlude audio   | `.mp3`, `.m4a`, `.aac`, `.ogg`, `.opus`, `.flac`, `.wav` |
| Video (loops behind the audio) | `.mp4`, `.m4v`, `.webm`, `.mkv`, `.mov`, `.avi`, `.gif`  |
| Font for the on-screen text    | `.ttf`, `.otf`                                           |
| Overlay image                  | `.png`, with transparency                                |

Extensions match in any case, so `.MP3` works too. New files are picked up within a minute. GIFs are converted once before they're first used, then reused.

## Where does the episode title on screen come from?

From the episode file's tags, read with [music-metadata](https://github.com/Borewit/music-metadata). The title tag is the episode title, falling back to the file name. The artist and album tags (often the host and show name) show on their own lines, which are hidden when a file doesn't have them. Fix the tags in your editing software or a tag editor before uploading. Episodes downloaded from a [feed](podcast-feeds.md) usually come tagged by your podcast host.

## Can I just show my cover art instead of a video?

Yes. Make a short video of your cover art and put it in `video/`, since it's looped anyway. With FFmpeg:

```
ffmpeg -loop 1 -i cover.png -t 10 -r 1 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" -pix_fmt yuv420p cover.mp4
```

A still video is also the cheapest thing to stream, so it uses less CPU.

## Can I add or change files while it's streaming?

Yes. New episodes join within a minute, and deleted ones leave the rotation. Avoid deleting the episode that's playing: if it can't be read to the end, the stream moves on to the next one. Settings changes apply from the next episode, and a broken `config.json` doesn't stop the stream: it keeps the last config that worked until you fix it.

## What stream settings should I use?

Your platform's recommendations are the place to start: [YouTube's live encoder settings](https://support.google.com/youtube/answer/2853702) and [Twitch's broadcasting guidelines](https://help.twitch.tv/s/article/broadcasting-guidelines). A podcast is mostly a still or slow image, so 720p at a low bitrate (1000k to 2500k) and 24 fps or less looks fine and saves bandwidth and CPU. See [Configuration](configuration.md#video-and-audio-quality) for the settings.

## It uses too much CPU, or the frame rate drops

Encoding video is the expensive part. In order of effect:

1. Use a faster `preset`, such as `ultrafast` or `superfast`.
2. Lower the size, for example to 854 x 480.
3. Use a simpler background: a still or slow video costs much less than detailed motion, and a `.webm` or `.mp4` decodes faster than a GIF.
4. Lower `video_fps` a little. Halving it saves less than you'd expect, because the background video still has to be decoded.

The console's Now playing panel shows the live frame rate. It should stay close to `video_fps`.

## Does it run on a Raspberry Pi?

It should, but this fork hasn't been tested on one. The original project started out on the Raspberry Pi. Use a Raspberry Pi 4 or 5 with 64-bit Raspberry Pi OS, Node.js 22, and FFmpeg from `sudo apt install ffmpeg`, or [Docker](running-on-a-server.md#docker). Start with `preset` set to `ultrafast`, 854 x 480 and a still background, and watch the frame rate in the console.

## The stream stopped. What happened?

Look at the log, in the console or with `docker logs podcast-radio`. When an episode fails, podcast-radio logs the reason and tries the next one, waiting longer each time (up to a minute) while failures continue. Common reasons:

| The log says                                                  | Usually means                                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `The folder ... does not exist` or `No supported files found` | The audio folder is missing or empty, for example a network drive that isn't mounted.                              |
| `ffmpeg encountered an error` with an `rtmp://` address       | The streaming platform refused the connection. Check the stream key and that the stream is set up on the platform. |
| `ffmpeg encountered an error` naming one file                 | That file is damaged or in a format FFmpeg can't read. It moves on to another episode.                             |
| `error reading the config.json`                               | The JSON in `config.json` is broken. Fix it, or restore `config.json.bak`.                                         |

## Where does the sample media come from?

New projects come with sample media so they can stream straight away. Replace it with your own.

- The music is by [Aviscerall](https://aviscerall.bandcamp.com/) and [Marquice Turner](https://marquiceturner.bandcamp.com/), from the original live-stream-radio project.
- The rotating Earth video is a [public domain video](https://www.youtube.com/watch?v=uuY1RXZyUFs).
- The overlay image uses the video camera and radio emoji from EmojiOne, now [JoyPixels](https://www.joypixels.com/).
- The font is [Lato](https://fonts.google.com/specimen/Lato), under the SIL Open Font License.
