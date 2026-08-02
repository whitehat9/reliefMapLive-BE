import express, {
  type Application,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import connectDB from "./config/dbConnection.js";
import corsOptions from "./config/corOptions.js";
import auth from "./routes/auth.js";
import users from "./routes/users.js";
import geography from "./routes/geography.js";
import markers from "./routes/markers.js";
import needs from "./routes/needs.js";
import requirements from "./routes/requirements.js";
import zengMarkers from "./routes/zengMarkers.js";
import visitors from "./routes/visitors.js";
import { errorHandler, routeNotFound } from "./middleware/errorMiddleware.js";

dotenv.config();

// Create Express application
const app: Application = express();
const PORT = process.env.PORT || 8080;

// Behind Cloud Run's proxy: trust the first proxy hop so req.secure reflects the
// original HTTPS request and the rate limiter keys off the real client IP
// (X-Forwarded-For) rather than the proxy's.
app.set("trust proxy", 1);

//CORS
app.use(cors(corsOptions));
app.use(cookieParser());

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes",
});

// Health check endpoints (no rate limiting)
app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "relief Map API is running",
    version: "1.0.0",
  });
});
app.get("/_ah/health", (req: Request, res: Response) => {
  res.status(200).send("OK");
});

app.get("/_ah/start", (req: Request, res: Response) => {
  res.status(200).send("OK");
});

// Apply rate limiter to all /api routes
app.use("/api", apiLimiter);

// Auth & user management
app.use("/api/auth", auth);
app.use("/api/users", users);

// Geography (districts / revenue circles / villages) — Super-Admin managed
app.use("/api/geography", geography);

// Relief markers & urgent needs
app.use("/api/markers", markers);
app.use("/api/needs", needs);
app.use("/api/requirements", requirements);

// Zeng layer — public road-condition reports (boat / tractor / broken embankment)
app.use("/api/zeng-markers", zengMarkers);

// Public visitor counter
app.use("/api/visitors", visitors);

// 404 handler
app.use(routeNotFound);

// Custom error handler
app.use(errorHandler);

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to the database:", err);
    process.exit(1);
  });

export default app;
