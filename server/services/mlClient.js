import axios from "axios";
import { env } from "../config/env.js";
import { ApiError } from "../utils/http.js";

const client = axios.create({
  baseURL: env.mlServiceUrl,
  timeout: 20000,
  headers: { "Content-Type": "application/json" },
});

function translate(error) {
  if (error.response) {
    const detail = error.response.data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((item) => item.msg || JSON.stringify(item)).join("; ")
          : "The ML service rejected the request.";
    return new ApiError(
      error.response.status === 400 || error.response.status === 422 ? 422 : 502,
      message
    );
  }
  return new ApiError(
    503,
    `The ML service is unreachable at ${env.mlServiceUrl}. Start it with: cd ml-service && uvicorn app.main:app --port 8000`
  );
}

async function call(path, payload) {
  try {
    const { data } = await client.post(path, payload);
    return data;
  } catch (error) {
    throw translate(error);
  }
}

export const mlClient = {
  predict(payload) {
    return call("/predict", payload);
  },
  bayesian(payload) {
    return call("/bayesian-update", payload);
  },
  substitutionImpact(payload) {
    return call("/substitution-impact", payload);
  },
  async health() {
    try {
      const { data } = await client.get("/health");
      return data;
    } catch (error) {
      throw translate(error);
    }
  },
  async modelInfo() {
    try {
      const { data } = await client.get("/model-info");
      return data;
    } catch (error) {
      throw translate(error);
    }
  },
  async safeModelInfo() {
    try {
      return await this.modelInfo();
    } catch {
      return null;
    }
  },
  async safeHealth() {
    try {
      return await this.health();
    } catch (error) {
      return { status: "unreachable", modelReady: false, message: error.message };
    }
  },
};
