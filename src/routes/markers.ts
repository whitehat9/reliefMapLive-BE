import express from "express";
import {
  createRelief,
  getActiveMarkers,
  getPastMarkers,
  getMyMarkers,
  getTodayStats,
  updateMarker,
  deleteMarker,
} from "../controllers/markerController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public reads for the map / homepage.
router.get("/", getActiveMarkers);
router.get("/past", getPastMarkers);
router.get("/stats/today", getTodayStats);

// Provider actions.
router.get("/marker", protect, authorize("Provider"), getMyMarkers);
router.post("/reliefSubmit", protect, authorize("Provider"), createRelief);

// Owner or Super-Admin.
router.route("/:id").put(protect, updateMarker).delete(protect, deleteMarker); // Automatically delete after 24h if not resolved, but can be deleted manually by owner or Super-Admin.

export default router;
