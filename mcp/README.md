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

| `update_session` | Rename a workout, change its date or notes |
| `update_set` | Change a planned set's weight / reps |
| `add_exercise_to_session` | Add an exercise (and planned sets) to a workout |
| `list_ai_changes` | See every AI edit with before/after values |
| `undo_ai_change` | Revert one AI edit |

Prompt: `plan_next_workout` — guided “build next session” flow.

Every connection acts as **one account**. A trainer key sees that trainer's clients; a client key sees only that client's own workouts. There is **no delete tool**.

### Safeguards on AI writes
- **Finished workouts are locked**, as are sets that were already performed. The AI can only touch upcoming/in-progress plans.
- **Every change is logged** (`McpChange` table) with the before/after values.
- **Undo** (`undo_ai_change`) reverts an edit, but refuses if the item was changed again since (so it never overwrites your own edits).
- **Hourly limit:** 20 AI writes per account per hour (`MAX_WRITES_PER_HOUR` in `mcp/src/safeguards.ts`). Undo doesn't count.

## Remote access (Claude web/mobile, ChatGPT, Grok…)

The app serves the same tools over HTTPS at `POST /api/mcp`. There are two ways in, and both end up as a Bearer token tied to one account:

### 1. Sign in (recommended; what Claude's "Add custom connector" uses)
Add the connector with just the URL `https://<your-site>/api/mcp`. Claude discovers the sign-in flow on its own, opens `/oauth/authorize`, and the person signs in with their normal app login and clicks **Allow**. A trainer gets trainer access; a client gets only their own data.

- Standard OAuth 2.1 + PKCE (S256), dynamic client registration; discovery at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`.
- Access tokens last 1 hour; refresh tokens last 90 days and rotate on every use.
- Tokens are stored hashed in `ApiKey`; revoke one with `scripts/create-api-key.ts revoke <id>` (see `list`).
- Optional env `PUBLIC_BASE_URL` overrides the site address advertised in the discovery documents.

### 2. Manual API key (Cursor, Claude Code, scripts)
Send `Authorization: Bearer wt_…`.

```bash
# create a key for an account (printed once — copy it immediately)
npx tsx scripts/create-api-key.ts create someone@example.com "Claude on my phone"
npx tsx scripts/create-api-key.ts list
npx tsx scripts/create-api-key.ts revoke <keyId>
```

Run these against the database you want the key to work on (production keys must be created with the production `DATABASE_URL`). Only a hash of the key is stored; a lost key must be replaced.

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
