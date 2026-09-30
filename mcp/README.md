# LifeSport Workout Tracker MCP

Talk to your locker-room data from **Cursor** or **Claude Desktop** using your existing LLM plan. This server exposes tools over stdio — the model runs in the host app (no Claude/OpenAI API bill from this repo).

## What it can do

| Tool | Purpose |
|------|---------|
| `list_clients` / `get_client` | Find clients |
| `list_sessions` / `get_session` | Recent + full workout detail |
| `get_progress` | 7d / 30d / 90d PRs + volume |
| `list_templates` / `get_template` | Your templates + planned sets |
| `list_exercise_catalog` | Consistent exercise names |
| `create_session_from_template` | Apply a template to a client |
| `create_planned_session` | Create a new planned workout (AI-designed) |

Prompt: `plan_next_workout` — guided “build next session” flow.

All tools are **scoped to one trainer** (your account). Writes only create sessions/plans; they never delete clients or history.

## Setup

1. Local Postgres is fine for development (`DATABASE_URL` in repo `.env`). For production data, point `.env` at Neon **only when you intend to** — prefer local + your Desktop dump for experiments.
2. Set which trainer the MCP acts as (required):

```bash
# add to .env (recommended) or MCP config env
WORKOUT_TRACKER_TRAINER_EMAIL=you@example.com
# or:
# WORKOUT_TRACKER_TRAINER_ID=clxxxxxxxx
```

3. From repo root:

```bash
npm install
npx prisma generate
npm run mcp
```

(`npm run mcp` should sit waiting on stdio — that’s correct.)

## Cursor

Project config is at `.cursor/mcp.json`. Restart Cursor (or reload MCP) after setting `WORKOUT_TRACKER_TRAINER_EMAIL` in `.env`.

Then ask things like:

- “Which clients haven’t trained in a week?”
- “Show Jordan’s 30-day progress and suggest next upper-body day”
- “Create a planned session from my Push template for client X next Tuesday”

## Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lifesport-workouts": {
      "command": "npx",
      "args": ["tsx", "mcp/src/index.ts"],
      "cwd": "/Users/YOU/workout-tracker",
      "env": {
        "WORKOUT_TRACKER_TRAINER_EMAIL": "you@example.com"
      }
    }
  }
}
```

`DATABASE_URL` is loaded from the project `.env` when `cwd` is the repo root.

## Safety

- Prefer **local** `workout_tracker_dev` while iterating on AI plans.
- You already have Desktop dumps under `~/Desktop/workout-tracker-backups/`.
- Rotate any Neon password that was pasted into chat history.
