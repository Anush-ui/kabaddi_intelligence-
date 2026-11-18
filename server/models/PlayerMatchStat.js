import mongoose from "mongoose";

const playerMatchStatSchema = new mongoose.Schema(
  {
    playerId: { type: Number, required: true, index: true },
    teamId: { type: Number, required: true, index: true },
    matchId: { type: Number, required: true, index: true },
    points: { type: Number, default: 0 },
    raidPoints: { type: Number, default: null },
    tacklePoints: { type: Number, default: null },
    raidsTotal: { type: Number, default: 0 },
    raidsSuccessful: { type: Number, default: 0 },
    tacklesTotal: { type: Number, default: 0 },
    tacklesSuccessful: { type: Number, default: 0 },
    starter: { type: Boolean, default: false },
    source: { type: String, enum: ["dataset", "manual"], default: "dataset" },
  },
  { timestamps: true }
);

playerMatchStatSchema.index({ playerId: 1, matchId: 1 }, { unique: true });

export const PlayerMatchStat = mongoose.model("PlayerMatchStat", playerMatchStatSchema);
