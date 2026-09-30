import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as data from "./data";
import { loadProjectEnv } from "./env";
import { fail, ok } from "./respond";
import { resolveTrainer } from "./trainer";

loadProjectEnv();

const plannedExerciseSchema = z.object({
  name: z.string().describe("Exercise name"),
  sets: z.number().int().positive().optional().describe("Number of planned sets"),
  weightLb: z.number().positive().optional().describe("Planned weight in pounds"),
  reps: z.number().int().positive().optional().describe("Planned reps per set"),
});

async function withTrainer<T>(fn: (trainer: Awaited<ReturnType<typeof resolveTrainer>>) => Promise<T>) {
  try {
    const trainer = await resolveTrainer();
    return ok(await fn(trainer));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(message);
  }
}

function createServer(): McpServer {
  const server = new McpServer({
    name: "lifesport-workout-tracker",
    version: "1.0.0",
  });

  server.registerTool(
    "list_clients",
    {
      description:
        "List this trainer’s clients with last-session summary. Use before planning or progress questions.",
      inputSchema: z.object({}),
    },
    async () => withTrainer((trainer) => data.listClients(trainer))
  );

  server.registerTool(
    "get_client",
    {
      description: "Get one client’s profile (age, height, body weight).",
      inputSchema: z.object({
        clientId: z.string().describe("Client id from list_clients"),
      }),
    },
    async ({ clientId }) => withTrainer((trainer) => data.getClient(trainer, clientId))
  );

  server.registerTool(
    "list_sessions",
    {
      description: "List recent workout sessions for a client (newest first).",
      inputSchema: z.object({
        clientId: z.string(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Max sessions to return (default 10)"),
      }),
    },
    async ({ clientId, limit }) =>
      withTrainer((trainer) => data.listSessions(trainer, clientId, limit ?? 10))
  );

  server.registerTool(
    "get_session",
    {
      description:
        "Full session detail including exercises and sets (planned vs completed). Weights are in pounds.",
      inputSchema: z.object({
        sessionId: z.string(),
      }),
    },
    async ({ sessionId }) => withTrainer((trainer) => data.getSession(trainer, sessionId))
  );

  server.registerTool(
    "get_progress",
    {
      description:
        "Progress snapshot for a client over 7d / 30d / 90d: total volume and per-exercise PRs (e1RM, best weight). Use for “are they progressing?” questions.",
      inputSchema: z.object({
        clientId: z.string(),
        range: z.enum(["7d", "30d", "90d"]).default("30d"),
      }),
    },
    async ({ clientId, range }) =>
      withTrainer((trainer) => data.getProgress(trainer, clientId, range))
  );

  server.registerTool(
    "list_templates",
    {
      description: "List this trainer’s workout templates (optionally including archived).",
      inputSchema: z.object({
        includeArchived: z.boolean().optional().default(false),
      }),
    },
    async ({ includeArchived }) =>
      withTrainer((trainer) => data.listTemplates(trainer, includeArchived ?? false))
  );

  server.registerTool(
    "get_template",
    {
      description: "Get a template’s exercises and planned sets (weights in pounds).",
      inputSchema: z.object({
        templateId: z.string(),
      }),
    },
    async ({ templateId }) => withTrainer((trainer) => data.getTemplate(trainer, templateId))
  );

  server.registerTool(
    "list_exercise_catalog",
    {
      description: "List the trainer’s exercise catalog names (for consistent naming when planning).",
      inputSchema: z.object({}),
    },
    async () => withTrainer((trainer) => data.listCatalog(trainer))
  );

  server.registerTool(
    "create_session_from_template",
    {
      description:
        "Create a new workout session for a client by applying one of the trainer’s templates (including planned sets when the template has them).",
      inputSchema: z.object({
        clientId: z.string(),
        templateId: z.string(),
        sessionName: z
          .string()
          .optional()
          .describe("Override session name (defaults to template name)"),
        date: z
          .string()
          .optional()
          .describe("Session date YYYY-MM-DD (defaults to today UTC)"),
      }),
    },
    async (args) => withTrainer((trainer) => data.createSessionFromTemplate(trainer, args))
  );

  server.registerTool(
    "create_planned_session",
    {
      description:
        "Create a brand-new planned workout for a client with exercises and optional planned sets (weight in pounds). Prefer catalog names from list_exercise_catalog. Does not start or finish the workout — the athlete runs it in the app.",
      inputSchema: z.object({
        clientId: z.string(),
        sessionName: z.string(),
        date: z.string().optional().describe("YYYY-MM-DD"),
        notes: z.string().optional(),
        exercises: z.array(plannedExerciseSchema).min(1),
      }),
    },
    async (args) => withTrainer((trainer) => data.createPlannedSession(trainer, args))
  );

  server.registerPrompt(
    "plan_next_workout",
    {
      description:
        "Guide for planning the next workout from recent sessions and progress (uses MCP tools).",
      argsSchema: {
        clientName: z.string().describe("Client name to look up via list_clients"),
        focus: z
          .string()
          .optional()
          .describe("Optional focus, e.g. upper body, deload, strength"),
      },
    },
    async ({ clientName, focus }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Plan the next workout for client "${clientName}".`,
              focus ? `Focus: ${focus}.` : "",
              "Steps:",
              "1) list_clients and resolve the client id by name",
              "2) list_sessions (limit 5) and get_session on the most relevant recent workouts",
              "3) get_progress for 30d",
              "4) list_templates and list_exercise_catalog for naming consistency",
              "5) Propose a plan, then call create_planned_session OR create_session_from_template after confirming intent",
              "Keep weights in pounds. Prefer progressive overload when PRs/volume support it; deload if recent volume is high and sessions look fatigued.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    })
  );

  return server;
}

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("LifeSport workout MCP server running on stdio");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
