#!/bin/sh
# Fix the data volume's ownership, then drop out of root.
#
# WHY THIS EXISTS: the Dockerfile creates and chowns /data at BUILD time, but
# a container host mounts the persistent volume over that path at RUN time.
# The mount arrives owned by root and replaces whatever the image had, so a
# build-time chown is simply gone. The process — running as `node` — then
# cannot write, and every save silently fails.
#
# That failure is invisible until somebody plays: /health still answers 200,
# because it never touches disk. So this runs first, as root, fixes the mount,
# and only then becomes `node` for the actual server.
set -e

DATA_DIR="${PP_DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R node:node "$DATA_DIR"
  # Everything from here runs unprivileged.
  exec gosu node "$@"
fi

# Already non-root (someone set USER explicitly). Nothing to fix; carry on and
# let the server's own writability check decide whether this can work.
exec "$@"
