import express from "express";
import seedAdmin from "../AdminPrivilege/seeder.js";
import {
  signup,
  login,
  logout,
  getMe,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Seed route (development only)
if (process.env.NODE_ENV === "development") {
  router.post("/seed", seedAdmin);
}

// Public provider — both verify a Firebase phone-OTP idToken client-side
// already completed before hitting the server.
router.post("/signup", signup);
router.post("/login", login);
// Logout is a stateless no-op (the client just discards its token) — public.
router.post("/logout", logout);
router.get("/me", protect, getMe);

export default router;
