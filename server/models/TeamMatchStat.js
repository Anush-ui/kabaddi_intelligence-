import mongoose from "mongoose";

const teamMatchStatSchema = new mongoose.Schema(
  {
    teamId: { type: Number, required: true, index: true },
    matchId: { type: Number, required: true, index: true },
    score: { type: Number, default: 0 },
    raidsSuccessful: { type: Number, default: 0 },
    raidsTotal: { type: Number, default: 0 },
    tacklesSuccessful: { type: Number, default: 0 },
    tacklesTotal: { type: Number, default: 0 },
    raidSuccess: { type: Number, default: 0 },
    tackleSuccess: { type: Number, default: 0 },
    raidRoll5: { type: Number, default: null },
    tackleRoll5: { type: Number, default: null },
  },
  { timestamps: true }
);

teamMatchStatSchema.index({ teamId: 1, matchId: 1 }, { unique: true });

export const TeamMatchStat = mongoose.model("TeamMatchStat", teamMatchStatSchema);
