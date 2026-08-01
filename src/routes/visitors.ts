import express from "express";
import {
  getVisitorCount,
  hitVisitor,
} from "../controllers/visitorController.js";

const router = express.Router();

// Public: read the running visitor total.
router.get("/", getVisitorCount);

// Public: record a visit (once per browser session, client-guarded).
router.post("/hit", hitVisitor);

export default router;
