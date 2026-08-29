import express from "express";
import {
  createNeed,
  getUrgentNeeds,
  getHelpRequests,
  resolveNeed,
  deleteNeed,
} from "../controllers/needController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public: homepage "Urgent need" tab. Phone numbers are projected away.
router.get("/", getUrgentNeeds);

// Responders' view — same requests, but with the victim's phone. Declared
// before any "/:id" route so the literal path wins.
router.get(
  "/help-requests",
  protect,
  authorize("Provider", "Super-Admin"),
  getHelpRequests,
);

// A provider reports a need they've seen; a flood victim asks for relief.
router.post("/", protect, authorize("Provider", "Flood-Victim"), createNeed);

// Owner or Super-Admin.
router.patch("/:id/resolve", protect, resolveNeed); //Provider or Super-Admin can resolve a need
router.delete("/:id", protect, deleteNeed);

export default router;
