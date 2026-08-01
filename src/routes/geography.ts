import express from "express";
import {
  createDistrict,
  getDistricts,
  updateDistrict,
  setDistrictBounds,
  deleteDistrict,
  createRevenueCircle,
  getRevenueCircles,
  updateRevenueCircle,
  setRevenueCircleBounds,
  deleteRevenueCircle,
  createVillage,
  getVillages,
  updateVillage,
  setVillageBounds,
  deleteVillage,
} from "../controllers/geographyController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// Reads are public (used for dropdowns on the provider form & homepage).
// Writes are Super-Admin only.
const admin = [protect, authorize("Super-Admin")];
// Marking an existing area as flood-affected (bounds only) is open to Providers
// too — they can't create/rename/delete catalog entries, only draw the rectangle.
const marker = [protect, authorize("Super-Admin", "Provider")];

// Districts
router.route("/districts").get(getDistricts).post(admin, createDistrict);
router
  .route("/districts/:id")
  .put(admin, updateDistrict)
  .delete(admin, deleteDistrict);
router.put("/districts/:id/bounds", marker, setDistrictBounds);

// Revenue circles
router
  .route("/revenue-circles")
  .get(getRevenueCircles)
  .post(admin, createRevenueCircle);
router
  .route("/revenue-circles/:id")
  .put(admin, updateRevenueCircle)
  .delete(admin, deleteRevenueCircle);
router.put("/revenue-circles/:id/bounds", marker, setRevenueCircleBounds);

// Villages
router.route("/villages").get(getVillages).post(admin, createVillage);
router
  .route("/villages/:id")
  .put(admin, updateVillage)
  .delete(admin, deleteVillage);
router.put("/villages/:id/bounds", marker, setVillageBounds);

export default router;
