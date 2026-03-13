# Heartbeat Memory

This project uses a local-first heartbeat-style memory flow inspired by OpenClaw.

## Layers

- Short-term memory:
  Stored in `data/agent_memory.db -> agent_memory`
  Keeps recent turn-by-turn chat history for each `session_id`

- Long-term profile:
  Stored in `data/agent_memory.db -> agent_profile`
  Keeps stable preferences such as:
  - preferred market
  - last discussed stock
  - watchlist

- Heartbeat summary:
  Stored in `data/agent_memory.db -> agent_profile_summary`
  Also mirrored to `data/agent_memory/<session_id>.md`

## Heartbeat behavior

- Triggered opportunistically after agent replies
- Default interval: every 15 minutes
- Controlled by env var: `AGENT_HEARTBEAT_MINUTES`

## What heartbeat consolidates

- Recent user topics
- Last discussed stock
- Preferred market
- Watchlist summary
- Recent context snapshot

## Design goal

- Keep online answers fast
- Avoid sending full history to the model every time
- Preserve a readable markdown memory artifact on disk
