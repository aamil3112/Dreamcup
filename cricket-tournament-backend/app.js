import express from "express";
import { config } from "dotenv";
import paymentRoute from "./routes/paymentRoutes.js";
import cors from "cors";
config({ path: "./config/config.env" });

export const app = express();

// Configure CORS to allow requests from your frontend
app.use(cors({
  origin: 'http://localhost:5173', // Update this to match your Vite dev server port
  methods: ['GET', 'POST'],
  credentials: true
}));

// Increase body size limits to allow base64 images (passport + Aadhaar)
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

app.use("/api", paymentRoute);
