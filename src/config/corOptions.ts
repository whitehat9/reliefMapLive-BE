// src/config/corsOptions.ts

import type { CorsOptions } from "cors";
import allowOrigins from "./allowOrigins.js";

// Compare origins ignoring an accidental trailing slash on either side, since a
// browser Origin never has one but hand-maintained allow-lists sometimes do.
const stripSlash = (value: string) => value.replace(/\/+$/, "");
const allowSet = new Set(allowOrigins.map(stripSlash));

const corsOptions: CorsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in allowed list
    if (allowSet.has(stripSlash(origin))) {
      return callback(null, true);
    }

    // Log the rejected origin for debugging
    console.log(`CORS: Rejected origin - ${origin}`);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "Cache-Control",
    "X-Forwarded-For",
  ],
};

export default corsOptions;
