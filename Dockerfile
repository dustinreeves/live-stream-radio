# podcast-radio in a container: Node 22 and ffmpeg (with freetype, for the on-screen text) included.
# The project folder (config.json, audio, video, fonts, ...) is mounted at /project.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY src ./src

# No colors in docker logs
ENV NO_COLOR=1

# Run as the node user (uid 1000) unless docker run --user / compose user: says otherwise,
# e.g. to match the owner of the project folder
USER node

ENTRYPOINT ["node", "/app/src/index.js"]
CMD ["--start", "/project"]
