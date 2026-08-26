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

# tini reaps zombies and forwards signals, so a Railway redeploy actually
# stops the process instead of waiting out a timeout. Colyseus has a graceful
# shutdown; it only runs if SIGTERM reaches it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
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
ENV PP_DATA_DIR=/data
RUN mkdir -p /data && chown -R node:node /data /app

# Railway injects PORT; this is only the default for a plain docker run.
ENV PORT=2567
EXPOSE 2567

USER node
WORKDIR /app/server

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]
