#!/bin/sh
cd /app
if [ -n "$SSH_ORIGINAL_COMMAND" ]; then
  exec /bin/sh -c "$SSH_ORIGINAL_COMMAND"
else
  exec "$SHELL"
fi
