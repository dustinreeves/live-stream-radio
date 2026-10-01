# Running on a server

To stream around the clock, run podcast-radio on a server or always-on machine, so it starts at boot and restarts if it stops. A small VPS with 2 GB of RAM handles a 720p stream: expect about 40% of one CPU core and 300 MB of memory.

There are two ways to run it:

- **Docker** (recommended): Node.js and FFmpeg come inside the container, so the server's own versions don't matter. This also works on older systems, such as Ubuntu 18.04.
- **Installed with npm and run by systemd**: no Docker needed, but the server needs Node.js 22 and FFmpeg.

## Docker

Create a project first (see [Getting started](getting-started.md#3-create-a-project)), on the server or elsewhere, and copy it over. Then build the image from this repository:

```
docker build -t podcast-radio "https://github.com/dustinreeves/podcast-radio.git#master"
```

### With Docker Compose

[`docker-compose.yml`](../docker-compose.yml) in this repository is ready to use. Copy it next to your project, set `PROJECT` and the `user:` line, then:

```
PROJECT=/srv/my-podcast docker compose up -d
docker compose logs -f
```

### With docker run

```
docker run -d --name podcast-radio --restart unless-stopped --init \
  --user "$(id -u):$(id -g)" --network host \
  --log-opt max-size=10m --log-opt max-file=3 \
  -v /srv/my-podcast:/project \
  podcast-radio --start /project
```

What the options do:

| Option                     | Why                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `--restart unless-stopped` | Starts at boot and after a crash, unless you stopped it yourself.                                                               |
| `--user`                   | Runs as the owner of the project folder, so config edits and feed downloads can be saved. Use the IDs from `id -u` and `id -g`. |
| `--network host`           | The console listens on `api.host` and `api.port` as set in `config.json`, so a reverse proxy on the server works unchanged.     |
| `--log-opt`                | Keeps at most 30 MB of logs.                                                                                                    |
| `-v ...:/project`          | Your project folder.                                                                                                            |

**Audio on another disk or a network mount.** If your audio folder is a symlink to somewhere outside the project, such as `/mnt/media`, mount that path too, at the same place. For network mounts (rclone, sshfs, NFS), add `rslave` so the container sees remounts:

```
--mount type=bind,source=/mnt,target=/mnt,bind-propagation=rslave
```

rclone and sshfs mounts also need `--allow-other` (and `user_allow_other` in `/etc/fuse.conf`), or the container can't read them.

### Everyday commands

| Task               | Command                                                                        |
| ------------------ | ------------------------------------------------------------------------------ |
| Follow the log     | `docker logs -f --tail 100 podcast-radio`                                      |
| Restart            | `docker restart podcast-radio`                                                 |
| Stop or start      | `docker stop podcast-radio`, `docker start podcast-radio`                      |
| Add a console user | `docker exec -it podcast-radio node /app/src/index.js --set-password /project` |
| CPU and memory     | `docker stats --no-stream podcast-radio`                                       |

### Updating

The stream keeps running while the new image builds, then is down for about a minute while the container is replaced:

```
docker tag podcast-radio:latest podcast-radio:previous
docker build -t podcast-radio "https://github.com/dustinreeves/podcast-radio.git#master"
docker rm -f podcast-radio
```

Then run the same `docker run` command as before (or `docker compose up -d`). To go back, run it with `podcast-radio:previous` instead.

## Installed with npm, run by systemd

Install Node.js 22 and FFmpeg as in [Getting started](getting-started.md#1-install-nodejs-and-ffmpeg), then podcast-radio:

```
sudo npm install -g github:dustinreeves/podcast-radio
```

Create `/etc/systemd/system/podcast-radio.service`, with your user and project folder:

```ini
[Unit]
Description=podcast-radio
After=network-online.target
Wants=network-online.target

[Service]
User=me
ExecStart=/usr/bin/env podcast-radio --start /home/me/my-podcast
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

If Node.js was installed with nvm, use the full path to `podcast-radio` instead, from `command -v podcast-radio`. Then start it:

```
sudo systemctl daemon-reload
sudo systemctl enable --now podcast-radio
journalctl -fu podcast-radio
```

### Updating

[`scripts/update-install.sh`](../scripts/update-install.sh) updates an npm install, including one of the original live-stream-radio. It backs up the current install, installs the new version and its dependencies, restarts the services you name, and prints how to roll back:

```
curl -fsSLO https://raw.githubusercontent.com/dustinreeves/podcast-radio/master/scripts/update-install.sh
bash update-install.sh podcast-radio
```

It needs Node.js 22 or newer on the server. On older systems, use Docker instead.

## Reaching the console

Keep the console on `localhost` and reach it through an SSH tunnel, or through HTTPS with Caddy or nginx. See [Web console](web-console.md#reaching-it-from-another-computer).

## After a reboot

Docker or systemd starts the stream by itself. If the audio folder isn't there yet, for example because a network drive mounts a little later, the stream retries after 2, 4, 8, 16 and 32 seconds, then every minute, and starts as soon as the folder appears.
