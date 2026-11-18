import mongoose from "mongoose";

const teamSchema = new mongoose.Schema(
  {
    externalId: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    shortName: { type: String, default: "" },
    aliases: { type: [String], default: [] },
    matchesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    ties: { type: Number, default: 0 },
    winRate: { type: Number, default: 0 },
    avgRaidSuccess: { type: Number, default: 0 },
    avgTackleSuccess: { type: Number, default: 0 },
    latestRaidRoll5: { type: Number, default: null },
    latestTackleRoll5: { type: Number, default: null },
    avgPlayerMu: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Team = mongoose.model("Team", teamSchema);
