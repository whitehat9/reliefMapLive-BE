import express from "express";
import {
  createNeed,
  getUrgentNeeds,
  resolveNeed,
  deleteNeed,
} from "../controllers/needController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public: homepage "Urgent need" tab.
router.get("/", getUrgentNeeds);

// Provider raises a need.
router.post("/", protect, authorize("Provider"), createNeed);

// Owner or Super-Admin.
router.patch("/:id/resolve", protect, resolveNeed); //Provider or Super-Admin can resolve a need
router.delete("/:id", protect, deleteNeed);

export default router;
