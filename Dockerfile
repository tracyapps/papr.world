# The papr.world neighborhood server, for Railway (or any container host).
#
# WHY A CONTAINER AND NOT THE STATIC SITE: this process holds long-lived
# WebSocket connections and owns the authoritative world state. It cannot run
# as a serverless function. The site on Vercel is static; this is the other
# half, and the two only meet over wss:// and https://.
#
# WHY IT COPIES TWO DIRECTORIES: the server imports the protocol from
# ../../shared by relative path, so `shared/` has to sit beside `server/` in
# the image exactly as it does in the repository. Copying only server/ builds
# a perfectly good image that cannot resolve a single import.
#
# Build context is the REPOSITORY ROOT, not server/.
#   docker build -t papr-server .
#   docker run -p 2567:2567 -v papr-data:/data papr-server

FROM node:22-slim

# tini reaps zombies and forwards signals, so a redeploy actually stops the
# process instead of waiting out a timeout. gosu drops root cleanly once the
# entrypoint has fixed the data volume's ownership.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini gosu \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

WORKDIR /app

# Dependencies first, so editing source does not re-run the install layer.
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# The protocol, then the server. Order is cheapest-changing first.
COPY shared/ ./shared/
COPY server/tsconfig.json ./server/
COPY server/src/ ./server/src/

# The world, the passports, the feedback queue and the moderation queue all
# live here. Mount a persistent volume at /data or every redeploy is an
# amnesia event.
#
# The chown below is for the case where NO volume is mounted. When one is,
# it lands on top of this and arrives owned by root — docker-entrypoint.sh
# fixes that at startup, which is the only moment it can be fixed.
ENV PP_DATA_DIR=/data
RUN mkdir -p /data && chown -R node:node /data /app

# Railway injects PORT; this is only the default for a plain docker run.
ENV PORT=2567
EXPOSE 2567

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /app/server

# Deliberately still root here: the entrypoint needs root to chown the mounted
# volume, and then hands over to `node` via gosu. The server itself never runs
# as root.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]

# node directly, NOT `npm start`.
#
# `npm start` inserts two processes between the signal and the server:
#   tini -> npm -> sh -c "tsx src/index.ts" -> node
# SIGTERM then has to be relayed twice, npm reports the signal as an ERROR
# ("npm error signal SIGTERM") which makes an ordinary redeploy look like a
# crash in the logs, and Colyseus's graceful shutdown -- which flushes pending
# account writes -- may not get to run at all.
#
# Running node as the direct child of tini means the signal lands on the
# process that knows what to do with it. `--import tsx` is how tsx runs as a
# loader rather than as its own wrapper process.
CMD ["node", "--import", "tsx", "src/index.ts"]
