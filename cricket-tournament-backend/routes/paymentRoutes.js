import express from "express";
import {
  checkout,
  paymentVerification,
  submitRegistration,
  cashfreeWebhook,
  getPendingRecoveryOrders,
  retryPendingOrder,
  retryAllPendingOrders,
} from "../controllers/paymentController.js";

const router = express.Router();

router.route("/checkout").post(checkout);

router.route("/paymentverification").post(paymentVerification);

router.route("/submit-registration").post(submitRegistration);

router.route("/recovery/pending").get(getPendingRecoveryOrders);

router.route("/recovery/retry-order").post(retryPendingOrder);

router.route("/recovery/retry-all").post(retryAllPendingOrders);

router
  .route("/cashfree/webhook")
  .get((req, res) => {
    res.status(200).json({
      success: true,
      message: "Cashfree webhook endpoint is live",
    });
  })
  .post(cashfreeWebhook);

export default router;
