from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator

from fastapi.responses import StreamingResponse


def encode_sse(event_name: str, payload: dict[str, Any]) -> str:
    return f"event: {event_name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def iter_sse(queue: "asyncio.Queue[str | None]") -> AsyncIterator[str]:
    while True:
        item = await queue.get()
        if item is None:
            break
        yield item


def sse_response(queue: "asyncio.Queue[str | None]") -> StreamingResponse:
    return StreamingResponse(
        iter_sse(queue),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
