import { z } from "zod";

const optionalInt = z.preprocess(
  (value) => (value === undefined || value === "" ? undefined : Number(value)),
  z.number().int().positive().optional()
);

const playerId = z.coerce.number().int().positive();

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password is too long."),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export const playerListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(80).optional().default(""),
  team: optionalInt,
  sort: z
    .enum(["avgPoints", "totalPoints", "raidPoints", "tacklePoints", "matches", "name"])
    .default("avgPoints"),
  order: z.enum(["asc", "desc"]).default("desc"),
  minMatches: z.coerce.number().int().min(0).max(1000).default(0),
});

export const matchListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(15),
  source: z.enum(["dataset", "manual"]).optional(),
  team: optionalInt,
  q: z.string().trim().max(80).optional().default(""),
});

export const headToHeadQuery = z.object({
  teamA: z.coerce.number().int().positive(),
  teamB: z.coerce.number().int().positive(),
});

export const playerPerformanceQuery = z.object({
  team: optionalInt,
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const createLiveSchema = z
  .object({
    teamAId: z.coerce.number().int().positive(),
    teamBId: z.coerce.number().int().positive(),
    startersA: z.array(playerId).min(5).max(7),
    benchA: z.array(playerId).max(7).default([]),
    startersB: z.array(playerId).min(5).max(7),
    benchB: z.array(playerId).max(7).default([]),
  })
  .refine((data) => data.teamAId !== data.teamBId, {
    message: "Team A and Team B must be different.",
    path: ["teamBId"],
  });

export const updateScoreSchema = z.object({
  scoreA: z.coerce.number().int().min(0).max(200),
  scoreB: z.coerce.number().int().min(0).max(200),
});

export const bayesianSchema = z.object({
  playerId: z.coerce.number().int().positive(),
  observedPoints: z.coerce.number().min(0).max(60),
});

export const substitutionSchema = z.object({
  side: z.enum(["A", "B"]),
  outPlayerId: z.coerce.number().int().positive(),
  inPlayerId: z.coerce.number().int().positive(),
});

export const saveMatchSchema = z.object({
  performances: z
    .array(
      z.object({
        playerId: z.coerce.number().int().positive(),
        points: z.coerce.number().min(0).max(80).default(0),
        raidPoints: z.coerce.number().min(0).max(80).optional(),
        tacklePoints: z.coerce.number().min(0).max(80).optional(),
      })
    )
    .max(30)
    .default([]),
  dateLabel: z.string().trim().max(40).optional(),
  venue: z.string().trim().max(120).optional().default(""),
  notes: z.string().trim().max(500).optional().default(""),
});

export const updateMatchSchema = z
  .object({
    notes: z.string().trim().max(500).optional(),
    venue: z.string().trim().max(120).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "Nothing to update." });
