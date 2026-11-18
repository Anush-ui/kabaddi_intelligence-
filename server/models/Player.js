import mongoose from "mongoose";

const playerSchema = new mongoose.Schema(
  {
    playerId: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    shortName: { type: String, default: "" },
    teamId: { type: Number, required: true, index: true },
    teamName: { type: String, default: "" },
    teamIds: { type: [Number], default: [] },
    matches: { type: Number, default: 0 },
    avgPoints: { type: Number, default: 0 },
    stdPoints: { type: Number, default: 0.1 },
    totalPoints: { type: Number, default: 0 },
    raidPoints: { type: Number, default: 0 },
    tacklePoints: { type: Number, default: 0 },
    raidsTotal: { type: Number, default: 0 },
    raidsSuccessful: { type: Number, default: 0 },
    tacklesTotal: { type: Number, default: 0 },
    tacklesSuccessful: { type: Number, default: 0 },
    latestMatchId: { type: Number, default: null },
    latestStarter: { type: Boolean, default: false },
  },
  { timestamps: true }
);

playerSchema.index({ avgPoints: -1 });
playerSchema.index({ teamIds: 1 });

export const Player = mongoose.model("Player", playerSchema);
