"""Paths and limits shared by the server modules. The cache limits can be changed with
environment variables (see docs/server-api.md)."""

import os
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent.parent
CACHE_DIR = SERVER_DIR / "cache"  # generated audio: <key>.mp3 plus <key>.json

MAX_TEXT = 3000  # characters in one request

# Cached clips not used for this many days are deleted; so are the least recently used
# ones once the cache is larger than CACHE_MAX_MB. Anything deleted is simply made again
# the next time it is asked for.
CACHE_DAYS = float(os.environ.get("TTS_CACHE_DAYS", "60"))
CACHE_MAX_MB = float(os.environ.get("TTS_CACHE_MAX_MB", "1000"))
PRUNE_EVERY = 6 * 3600  # seconds between cache clean-ups
