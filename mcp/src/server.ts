import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as data from "./data";
import * as edits from "./edits";
import { fail, ok } from "./respond";
import type { Actor } from "./trainer";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((d) => !Number.isNaN(new Date(`${d}T12:00:00.000Z`).getTime()), "Not a real date");

const plannedExerciseSchema = z.object({
  name: z.string().min(1).max(100).describe("Exercise name"),
  sets: z.number().int().positive().max(20).optional().describe("Number of planned sets"),
  weightLb: z.number().positive().max(2000).optional().describe("Planned weight in pounds"),
  reps: z.number().int().positive().max(200).optional().describe("Planned reps per set"),
});

export type ActorResolver = () => Promise<Actor>;

export function createServer(getActor: ActorResolver): McpServer {
  async function withTrainer<T>(fn: (actor: Actor) => Promise<T>) {
    try {
      return ok(await fn(await getActor()));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return fail(message);
    }
  }

  const server = new McpServer({
    name: "lifesport-workout-tracker",
    version: "1.0.0",
  });

  server.registerTool(
    "list_clients",
    {
      description:
        "List the clients this account can see (a trainer sees their clients; a client sees themselves) with last-session summary. Use before planning or progress questions.",
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
          .max(100)
          .optional()
          .describe("Override session name (defaults to template name)"),
        date: dateSchema.optional().describe("Session date YYYY-MM-DD (defaults to today UTC)"),
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
        sessionName: z.string().min(1).max(100),
        date: dateSchema.optional().describe("YYYY-MM-DD"),
        notes: z.string().max(2000).optional(),
        exercises: z.array(plannedExerciseSchema).min(1).max(30),
      }),
    },
    async (args) => withTrainer((trainer) => data.createPlannedSession(trainer, args))
  );

  server.registerTool(
    "update_session",
    {
      description:
        "Rename a workout, move it to another date, or change its notes. Only works on workouts that are not finished (finished workouts are locked). Returns a changeId you can pass to undo_ai_change.",
      inputSchema: z.object({
        sessionId: z.string(),
        name: z.string().min(1).max(100).optional(),
        date: dateSchema.optional().describe("YYYY-MM-DD"),
        notes: z.string().max(2000).optional().describe("Replaces the notes. Empty string clears them."),
      }),
    },
    async (args) => withTrainer((actor) => edits.updateSession(actor, args))
  );

  server.registerTool(
    "update_set",
    {
      description:
        "Change the planned weight (pounds) and/or reps of one planned set. Only works on sets that have not been performed, in workouts that are not finished. Get set ids from get_session. Returns a changeId you can pass to undo_ai_change.",
      inputSchema: z.object({
        setId: z.string(),
        weightLb: z.number().positive().max(2000).optional(),
        reps: z.number().int().positive().max(200).optional(),
      }),
    },
    async (args) => withTrainer((actor) => edits.updateSet(actor, args))
  );

  server.registerTool(
    "add_exercise_to_session",
    {
      description:
        "Add one exercise (with optional planned sets) to the end of a workout that is not finished. Prefer catalog names from list_exercise_catalog. Returns a changeId you can pass to undo_ai_change.",
      inputSchema: z.object({
        sessionId: z.string(),
        name: z.string().min(1).max(100),
        sets: z.number().int().positive().max(20).optional(),
        weightLb: z.number().positive().max(2000).optional(),
        reps: z.number().int().positive().max(200).optional(),
      }),
    },
    async (args) => withTrainer((actor) => edits.addExerciseToSession(actor, args))
  );

  server.registerTool(
    "list_ai_changes",
    {
      description:
        "List recent changes made through this AI connection, newest first, with the before/after values and whether each can be undone.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).optional().describe("Default 10"),
      }),
    },
    async ({ limit }) => withTrainer((actor) => edits.listChanges(actor, limit ?? 10))
  );

  server.registerTool(
    "undo_ai_change",
    {
      description:
        "Undo one AI edit by its changeId (from list_ai_changes or the edit's result). Refuses if the item was changed again since, or if the workout is now finished. Creating a workout cannot be undone here.",
      inputSchema: z.object({ changeId: z.string() }),
    },
    async ({ changeId }) => withTrainer((actor) => edits.undoChange(actor, changeId))
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
