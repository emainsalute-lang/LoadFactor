import { NextResponse } from "next/server";

export const runtime = "nodejs";

const exercise = {
  type: "object",
  required: ["exerciseId", "weightKg", "reps", "jumpHeightCm", "splitTimeSeconds", "rpe"],
  properties: {
    exerciseId: { type: "string", description: "Built-in exercise ID or an ID declared in customExercises." },
    weightKg: { type: "number", minimum: 0, maximum: 1500 },
    reps: { type: "integer", minimum: 1, maximum: 1000 },
    jumpHeightCm: { type: ["number", "null"], exclusiveMinimum: 0, maximum: 400 },
    splitTimeSeconds: { type: ["number", "null"], exclusiveMinimum: 0, maximum: 3600 },
    rpe: { type: "integer", minimum: 1, maximum: 10 },
    videoUrl: { type: ["string", "null"], format: "uri", description: "Optional HTTPS technique video link." },
    test: { anyOf: [{ type: "null" }, { type: "object", required: ["jumpCategory", "approach", "leg", "broadJumpCm", "distanceM", "splits", "protocol"], properties: {
      jumpCategory: { type: "string", enum: ["countermovement", "squat", "depth", "vertical", "broad"] },
      approach: { type: "string", enum: ["standing", "approach"] },
      leg: { type: "string", enum: ["both", "left", "right"] },
      broadJumpCm: { type: ["number", "null"], exclusiveMinimum: 0, maximum: 1500 },
      distanceM: { type: ["number", "null"], exclusiveMinimum: 0, maximum: 10000 },
      splits: { type: "array", maxItems: 20, items: { type: "object", required: ["distanceM", "seconds"], properties: { distanceM: { type: "number", exclusiveMinimum: 0 }, seconds: { type: "number", exclusiveMinimum: 0 } } } },
      protocol: { type: "string", maxLength: 1000 },
    } }], description: "Use the fields relevant to the exercise kind; broad jumps require broadJumpCm, and sprint tests require distanceM and cumulative splits." },
    setType: { type: "string", enum: ["working", "warmup", "drop"] },
    superset: { type: ["string", "null"] },
    dropGroup: { type: ["string", "null"] },
    tempo: { type: ["string", "null"] },
    pauseSeconds: { type: ["number", "null"], minimum: 0, maximum: 60 },
  },
};
const session = {
  type: "object",
  required: ["title", "date", "exercises"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 80 },
    date: { type: "string", format: "date", description: "Must not be in the future in the account timezone." },
    notes: { type: "string", maxLength: 1000 },
    tags: { type: "array", maxItems: 10, items: { type: "string", minLength: 1, maxLength: 24 } },
    bodyweightKg: { type: ["number", "null"], minimum: 1, maximum: 500 },
    durationMinutes: { type: ["number", "null"], exclusiveMinimum: 0, maximum: 1440 },
    sessionRpe: { type: ["number", "null"], minimum: 0, maximum: 10 },
    plannedWorkoutId: { type: ["string", "null"] },
    customExercises: { type: "array", maxItems: 100, items: { type: "object", required: ["id", "name", "kind"], properties: { id: { type: "string", pattern: "^custom-[a-zA-Z0-9-]+$" }, name: { type: "string", minLength: 1, maxLength: 80 }, kind: { type: "string", enum: ["strength", "jump", "sprint"] } } } },
    exercises: { type: "array", minItems: 1, maxItems: 100, items: exercise },
  },
};

export async function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: { title: "LoadFactor Integration API", version: "1.0.0", description: "Personal workout access using athlete-managed, revocable API tokens." },
    servers: [{ url: "/api/v1" }],
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "Create a read/write integration token in Account & data. Tokens are shown once and can be revoked." } } },
    paths: {
      "/sessions": {
        get: { summary: "List active workouts", security: [{ bearerAuth: [] }], responses: { "200": { description: "Active workout sessions for the token owner." }, "401": { description: "Missing or invalid token." }, "403": { description: "Token does not grant read access." } } },
        post: { summary: "Create a workout", security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: session } } }, responses: { "201": { description: "Workout saved; totals and metrics are calculated by the server.", content: { "application/json": { schema: { type: "object", required: ["session", "metrics"], properties: { session: { type: "object" }, metrics: { type: "array", items: { type: "object" } } } } } } }, "401": { description: "Missing or invalid token." }, "403": { description: "Token does not grant write access." }, "422": { description: "Invalid session payload." } } },
      },
    },
  });
}
