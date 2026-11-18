import mongoose from "mongoose";

const lineupPlayerSchema = new mongoose.Schema(
  {
    playerId: { type: Number, required: true },
    name: { type: String, default: "" },
    mu: { type: Number, default: 0 },
  },
  { _id: false }
);

const performanceSchema = new mongoose.Schema(
  {
    playerId: { type: Number, required: true },
    name: { type: String, default: "" },
    teamId: { type: Number, required: true },
    points: { type: Number, default: 0 },
    raidPoints: { type: Number, default: null },
    tacklePoints: { type: Number, default: null },
    starter: { type: Boolean, default: false },
  },
  { _id: false }
);

const timelineEventSchema = new mongoose.Schema(
  {
    label: { type: String, default: "" },
    probabilityA: { type: Number, required: true },
    scoreA: { type: Number, default: 0 },
    scoreB: { type: Number, default: 0 },
    type: {
      type: String,
      enum: ["start", "score", "bayesian", "substitution"],
      default: "score",
    },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const matchSideSchema = new mongoose.Schema(
  {
    teamId: { type: Number, required: true },
    name: { type: String, required: true },
    score: { type: Number, default: 0 },
  },
  { _id: false }
);

const matchSchema = new mongoose.Schema(
  {
    matchId: { type: Number, required: true, unique: true, index: true },
    source: { type: String, enum: ["dataset", "manual"], default: "dataset", index: true },
    matchDate: { type: Date, default: null, index: true },
    dateLabel: { type: String, default: "" },
    seriesName: { type: String, default: "" },
    status: { type: String, default: "Full Time" },
    venue: { type: String, default: "" },
    result: { type: String, default: "" },
    winnerTeamId: { type: Number, default: null },
    tie: { type: Boolean, default: false },
    teamA: { type: matchSideSchema, required: true },
    teamB: { type: matchSideSchema, required: true },
    lineups: {
      startersA: { type: [lineupPlayerSchema], default: [] },
      benchA: { type: [lineupPlayerSchema], default: [] },
      startersB: { type: [lineupPlayerSchema], default: [] },
      benchB: { type: [lineupPlayerSchema], default: [] },
    },
    playerPerformances: { type: [performanceSchema], default: [] },
    prediction: {
      probabilityA: { type: Number, default: null },
      baseProbabilityA: { type: Number, default: null },
      scoreShift: { type: Number, default: null },
      features: { type: Object, default: null },
      modelName: { type: String, default: "" },
    },
    timeline: { type: [timelineEventSchema], default: [] },
    notes: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

matchSchema.index({ "teamA.teamId": 1 });
matchSchema.index({ "teamB.teamId": 1 });

export const Match = mongoose.model("Match", matchSchema);
