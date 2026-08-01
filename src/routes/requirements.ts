import express from "express";
import {
  createRequirement,
  getRequirements,
  getMyRequirements,
  getRequirement,
  updateRequirement,
  updateRequirementStatus,
  deleteRequirement,
} from "../controllers/requirementController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", getRequirements);

// A Provider's own postings. Must be declared before "/:id".
router.get("/mine", protect, authorize("Provider"), getMyRequirements);

// A Provider posts a requirement.
router.post("/", protect, authorize("Provider"), createRequirement);

// Owner or Super-Admin.
router.get("/:id", protect, getRequirement);
router.patch("/:id", protect, updateRequirement);
router.patch(
  "/:id/status",
  protect,
  authorize("Provider", "Super-Admin"),
  updateRequirementStatus,
);
router.delete("/:id", protect, deleteRequirement);

export default router;
