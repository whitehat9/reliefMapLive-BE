import express from "express";
import {
  getZengMarkers,
  createZengMarker,
  deleteZengMarker,
} from "../controllers/zengMarkerController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public: anyone can view or submit a road-condition report.
router.get("/", getZengMarkers);
router.post("/", createZengMarker);

// Moderation.
router.delete("/:id", protect, authorize("Super-Admin"), deleteZengMarker);

export default router;
