"""Local server for the MOJi browser extension.

Puts together the parts in the jpstudy package (speech, words, translation). Started by
start.ps1; by hand:

    uv run uvicorn app:app --port 8000
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from jpstudy import speech, translate, words
from jpstudy.config import CACHE_DIR


@asynccontextmanager
async def lifespan(_app):
    task = asyncio.create_task(speech.prune_forever())
    yield
    task.cancel()


CACHE_DIR.mkdir(exist_ok=True)
app = FastAPI(title="MOJi study server", lifespan=lifespan)
for part in (speech, words, translate):
    app.include_router(part.router)
