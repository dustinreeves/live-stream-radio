# Web console

The web console is a page served by podcast-radio itself, at `/console`, for running the stream from a browser. There's nothing extra to install.

| Panel           | What you can do                                                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Now playing     | See the episode, its progress, and the stream's frame rate and bitrate. Start, stop, or skip to the next episode.                                                                                                    |
| Podcast feeds   | Add or remove RSS feeds, check them now, and watch downloads. See [Podcast feeds](podcast-feeds.md).                                                                                                                 |
| Up next         | The queue: episodes you picked to play next, in order.                                                                                                                                                               |
| Library         | Search every episode the stream can play. **Queue** adds one to Up next; **Play now** switches to it straight away.                                                                                                  |
| Recently played | The last 50 episodes and interludes.                                                                                                                                                                                 |
| Log             | The same output as the terminal or the system log, live.                                                                                                                                                             |
| Stream settings | The on-screen text (wording, size, colours, position, scrolling), overlay image, interludes, folders, play order, stream URL and key, and video and audio quality. **Advanced (JSON)** edits `config.json` directly. |

Queued episodes play in order and skip interludes, then the stream goes back to its [play order](configuration.md#play-order). The queue is kept in memory, so a restart clears it.

Settings apply from the next episode. **Save & apply now** applies them immediately by skipping to the next episode. The previous config is kept as `config.json.bak`. A few settings need a restart; see [Configuration](configuration.md#when-changes-apply).

## Signing in

Add a console user on the machine running the stream. You'll be asked for a username and a password of at least 10 characters:

```
podcast-radio --set-password my-podcast
```

Run it again with the same username to change that password. Users are stored in `config.json` under `console.users`, with the passwords hashed. With Docker, run it inside the container instead; see [Running on a server](running-on-a-server.md#docker).

Then open `http://localhost:8000/console` (or your `api.host` and `api.port`) and sign in. You can also sign in with the project's `api.key`, using **Use API key instead**.

- Sign-ins last 12 hours (`console.session_hours`) and end when podcast-radio restarts.
- After 5 wrong passwords from one address, sign-ins from it are refused for 15 minutes.
- The console won't load until a console user or an `api.key` exists.

## Reaching it from another computer

Keep `api.host` as `localhost`, and reach the console in one of these ways. Never expose it over plain `http://` on the internet: the sign-in page warns you if you do.

### SSH tunnel

This needs no setup and suits occasional use. From your own computer, run:

```
ssh -L 8000:localhost:8000 you@your-server
```

Then open http://localhost:8000/console while the tunnel is open.

### HTTPS with a reverse proxy

This is the way to go for everyday use. Ready-made configs are in [`proxy/`](../proxy), each with step-by-step instructions at the top:

| Config                                    | Use it when                                  | Certificate                                          |
| ----------------------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| [`proxy/Caddyfile`](../proxy/Caddyfile)   | Nothing else uses ports 80 and 443. Easiest. | Automatic: Caddy gets and renews it.                 |
| [`proxy/nginx.conf`](../proxy/nginx.conf) | nginx is already running on the server       | One `certbot --nginx` command, renewed automatically |

On Debian or Ubuntu, [`scripts/setup-caddy.sh`](../scripts/setup-caddy.sh) installs and configures Caddy for you.

In short:

1. Point a DNS name, such as `podcast.example.com`, at the server.
2. Copy the config and replace `radio.example.com` with your name (and `8000` if you changed `api.port`).
3. In `config.json`, add `"trust_proxy": true` to the `api` section, keeping `"host": "localhost"`, then restart podcast-radio.
4. Open `https://podcast.example.com`, which goes to the console.

`trust_proxy` matters because behind a proxy every request comes from localhost. With it on, the sign-in lockout uses each visitor's real address, so someone guessing passwords can't lock you out. Only turn it on behind a proxy.

### Behind Cloudflare

If Cloudflare proxies your domain, the address the proxy passes on is Cloudflare's, not the visitor's. One person's wrong passwords could then lock out everyone coming through the same Cloudflare server. In Caddy, pass on Cloudflare's visitor address instead, and accept requests only from Cloudflare:

```
podcast.example.com {
	@cloudflare remote_ip 173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22 2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32
	handle @cloudflare {
		redir / /console
		reverse_proxy localhost:8000 {
			header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}
		}
	}
	handle {
		respond "forbidden" 403
	}
}
```

Cloudflare publishes the current list of its addresses at [cloudflare.com/ips](https://www.cloudflare.com/ips/).
