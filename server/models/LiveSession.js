import mongoose from "mongoose";

const lineupPlayerSchema = new mongoose.Schema(
  {
    playerId: { type: Number, required: true },
    name: { type: String, default: "" },
    mu: { type: Number, default: 0 },
    std: { type: Number, default: 0 },
    matches: { type: Number, default: 0 },
  },
  { _id: false }
);

const sessionTeamSchema = new mongoose.Schema(
  {
    teamId: { type: Number, required: true },
    name: { type: String, required: true },
    shortName: { type: String, default: "" },
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

const liveSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    teamA: { type: sessionTeamSchema, required: true },
    teamB: { type: sessionTeamSchema, required: true },
    startersA: { type: [lineupPlayerSchema], default: [] },
    benchA: { type: [lineupPlayerSchema], default: [] },
    startersB: { type: [lineupPlayerSchema], default: [] },
    benchB: { type: [lineupPlayerSchema], default: [] },
    scoreA: { type: Number, default: 0 },
    scoreB: { type: Number, default: 0 },
    features: { type: Object, default: null },
    probabilityA: { type: Number, default: 0.5 },
    baseProbabilityA: { type: Number, default: null },
    scoreShift: { type: Number, default: 0 },
    modelName: { type: String, default: "" },
    modelRocAuc: { type: Number, default: null },
    timeline: { type: [timelineEventSchema], default: [] },
  },
  { timestamps: true }
);

export const LiveSession = mongoose.model("LiveSession", liveSessionSchema);
