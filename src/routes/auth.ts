import express from "express";
import seedAdmin from "../AdminPrivilege/seeder.js";
import {
  signup,
  login,
  logout,
  getMe,
  refresh,
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
// Refresh & logout authenticate via the httpOnly refresh cookie, not the
// (possibly expired) access token — so no `protect` here.
router.get("/refresh", refresh);
router.post("/logout", logout);
router.get("/me", protect, getMe);

export default router;
