import express from "express";
import {
  checkout,
  paymentVerification,
  submitRegistration,
} from "../controllers/paymentController.js";

const router = express.Router();

router.route("/checkout").post(checkout);

router.route("/paymentverification").post(paymentVerification);

router.route("/submit-registration").post(submitRegistration);

export default router;
