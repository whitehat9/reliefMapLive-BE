import express from "express";
import {
  getUsers,
  getUser,
  setUserStatus,
  deleteUser,
} from "../controllers/userController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", getUsers);
router.get("/:id", getUser);
router.patch("/:id/status", protect, authorize("Super-Admin"), setUserStatus);
router.delete("/:id", protect, authorize("Super-Admin"), deleteUser);

export default router;
