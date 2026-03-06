import express from "express";
import { config } from "dotenv";
import paymentRoute from "./routes/paymentRoutes.js";
import cors from "cors";
config({ path: "./config/config.env" });

export const app = express();

// Configure CORS:
// - Always allow localhost for dev
// - In production, set FRONTEND_URLS to a comma-separated list
//   e.g. "https://dangercup.online,https://www.dangercup.online"
const allowedOrigins = new Set(["http://localhost:5173"]);
const envOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
envOrigins.forEach((o) => allowedOrigins.add(o));

const corsOptions = {
  origin: (origin, callback) => {
    // allow non-browser requests (no Origin header)
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`), false);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Increase body size limits to allow base64 images (passport + Aadhaar)
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

app.use("/api", paymentRoute);
