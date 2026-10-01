# Podcast feeds

Give podcast-radio your podcast's RSS feed and new episodes download by themselves into the stream's rotation. It checks every hour and keeps the newest 10 episodes by default.

## Adding a feed

In the web console, paste the feed URL into the **Podcast feeds** panel, choose how many episodes to keep, and click **Add feed**. podcast-radio reads the feed first, so a wrong URL is caught straight away, then starts downloading.

Your feed URL is usually listed in your podcast host's dashboard (Buzzsprout, Libsyn, Anchor and others), or in Apple Podcasts Connect.

You can also add feeds to `config.json` by hand, as a URL or with options:

```json
"podcasts": {
  "check_every_minutes": 60,
  "feeds": [
    "https://example.com/feed.xml",
    { "url": "https://example.com/other-show.xml", "keep_latest": 25, "directory": "./audio/Other Show" }
  ]
}
```

| Setting               | Default                                                 | What it does                                                                                                         |
| --------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `url`                 |                                                         | The feed's address.                                                                                                  |
| `keep_latest`         | `10`                                                    | How many of the newest episodes to download and keep. `0` downloads every episode in the feed and never deletes any. |
| `directory`           | a folder named after the show, inside your audio folder | Where this feed's episodes are saved.                                                                                |
| `check_every_minutes` | `60`                                                    | How often all feeds are checked. At least 5. The first check is 10 seconds after starting.                           |

## Where episodes go

Each show gets its own folder inside your audio folder, for example `audio/My Show/`. Because it's inside the audio folder, new episodes join the rotation as soon as they finish downloading.

Episodes are named `<date> <title>.<ext>`, for example `2026-09-30 Episode 120 The Big One.mp3`. With the `in_order` play order, a show then plays oldest to newest.

## Keeping the newest

With `keep_latest` set, when a new episode arrives the oldest one is deleted, so the folder holds the newest episodes only. It's careful about what it deletes:

- Only files it downloaded itself, never episodes you put there.
- Never the episode that's playing. That one is removed at a later check.
- An episode you delete by hand isn't downloaded again.

`keep_latest: 0` keeps every episode, and on the first check downloads the whole back catalogue. For a long-running show that can be thousands of files, so check your disk space first.

## Checking on it

The console's Podcast feeds panel shows, for each feed, how many episodes are downloaded, the latest one, when it last checked, and any error, with download progress while one is running. **Check now** checks every feed straight away.

A feed that's down or returns an error shows that error on the feed and is tried again at the next check. Nothing else is affected. Removing a feed stops its downloads, and its episodes stay until you delete the show's folder.

What was downloaded is recorded in `.podcast-radio-feeds.json` in the project folder. Don't delete it, or episodes deleted by hand may download again.

## Limits

- Only audio episodes are downloaded. Video podcasts are skipped.
- Feeds that need a login, such as private or premium feeds, work only if the login is in the feed URL itself.
- The stream needs write access to the audio folder, and to the project folder for the state file.
