# Command line

```
podcast-radio [options] [project folder]
```

The project folder can be relative to where you are, or a full path. Without one, the current folder is used. The old command name, `live-stream-radio`, runs the same program.

| Option                    | Short | What it does                                                                                                                   |
| ------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| `--start <folder>`        | `-s`  | Start streaming the project. This is the default, so `podcast-radio my-podcast` does the same.                                 |
| `--generate <name>`       | `-g`  | Create a new project folder with sample media, settings and a random API key.                                                  |
| `--set-password <folder>` |       | Add a web console user, or change an existing user's password. Asks for the username and a password of at least 10 characters. |
| `--output <location>`     | `-o`  | Stream here instead of `stream_url` or `stream_outputs`, for example a file, to test without going live.                       |
| `--help`                  | `-h`  | Show the options.                                                                                                              |
| `--version`               | `-v`  | Show the installed version.                                                                                                    |

## Examples

```
# Create a project, add a console login, and start it
podcast-radio --generate my-podcast
podcast-radio --set-password my-podcast
podcast-radio my-podcast

# Test the output by streaming to a file for a while (Ctrl+C to stop)
podcast-radio my-podcast --output test.flv

# A project somewhere else
podcast-radio /srv/podcast
```

With Docker, the same options go after the image name, and `--set-password` runs inside the running container. See [Running on a server](running-on-a-server.md#docker).
