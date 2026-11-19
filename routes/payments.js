const express = require("express");
const { ObjectId } = require("mongodb");

const { getDB } = require("../config/db");
const {
  verifyToken,
  verifyCustomer,
  verifyTechnician,
} = require("../middleware/authMiddleware");
const { getStripe, getClientUrl } = require("../utils/stripe");
const { markBookingPaid, activateProPlan } = require("../utils/payments");
const { isValidObjectId, toPositiveNumber } = require("../utils/validation");

const router = express.Router();

// CREATE A STRIPE CHECKOUT SESSION FOR A COMPLETED, UNPAID BOOKING
const createCheckoutSession = async (req, res) => {
  try {
    const stripe = getStripe();

    if (!stripe) {
      return res.status(503).json({
        success: false,
        message: "Stripe is not configured on the server yet.",
      });
    }

    const { bookingId } = req.body || {};

    if (!isValidObjectId(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const db = getDB();
    const booking = await db
      .collection("bookings")
      .findOne({ _id: new ObjectId(bookingId) });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    if (booking.customerEmail !== req.user.email) {
      return res.status(403).json({
        success: false,
        message: "You can only pay for your own bookings.",
      });
    }

    // Payment gate: completed + unpaid only.
    if (booking.status !== "completed") {
      return res.status(409).json({
        success: false,
        message: "Payment is only available after the service is completed.",
      });
    }

    if (booking.paymentStatus === "paid") {
      return res.status(409).json({
        success: false,
        message: "This booking is already paid.",
      });
    }

    const existingPayment = await db
      .collection("payments")
      .findOne({ bookingId });

    if (existingPayment?.paymentStatus === "paid") {
      return res.status(409).json({
        success: false,
        message: "This booking is already paid.",
      });
    }

    // Never trust an amount from the client: use the completed final amount.
    const amount = toPositiveNumber(
      booking.finalAmount ?? booking.basePrice
    );

    if (amount === null) {
      return res.status(409).json({
        success: false,
        message: "This booking has no payable amount yet.",
      });
    }

    const clientUrl = getClientUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: req.user.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: booking.serviceTitle,
              description: `FixMate booking #${bookingId}`,
            },
          },
        },
      ],
      metadata: {
        bookingId,
        customerEmail: booking.customerEmail,
      },
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/payment/cancel?booking_id=${bookingId}`,
    });

    const now = new Date();

    await db.collection("payments").updateOne(
      { bookingId },
      {
        $set: {
          bookingId,
          serviceTitle: booking.serviceTitle,
          customerName: booking.customerName,
          customerEmail: booking.customerEmail,
          technicianName: booking.technicianName,
          technicianEmail: booking.technicianEmail,
          amount,
          currency: "usd",
          paymentStatus: "unpaid",
          stripeSessionId: session.id,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );

    return res.status(200).json({
      success: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error("Create checkout error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to start the payment.",
    });
  }
};

// The assignment names the API /create-checkout-session; keep the short
// alias so older clients keep working.
router.post("/create-checkout-session", verifyCustomer, createCheckoutSession);
router.post("/create-checkout", verifyCustomer, createCheckoutSession);

// PRO PLAN SUBSCRIPTION CHECKOUT (technician)
router.post("/subscribe", verifyTechnician, async (req, res) => {
  try {
    const stripe = getStripe();

    if (!stripe) {
      return res.status(503).json({
        success: false,
        message: "Stripe is not configured on the server yet.",
      });
    }

    if (req.user.plan === "pro") {
      return res.status(409).json({
        success: false,
        message: "You are already on the FixMate Pro plan.",
      });
    }

    const envPrice = Number(process.env.PRO_PLAN_PRICE);
    const price = Number.isFinite(envPrice) && envPrice > 0 ? envPrice : 19;

    const clientUrl = getClientUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: req.user.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(price * 100),
            product_data: {
              name: "FixMate Pro Plan",
              description:
                "Unlimited service listings plus a Verified Pro badge on every card.",
            },
          },
        },
      ],
      metadata: {
        type: "subscription",
        plan: "pro",
        technicianEmail: req.user.email,
        technicianId: req.user.id,
      },
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&type=subscription`,
      cancel_url: `${clientUrl}/payment/cancel?plan=1`,
    });

    return res.status(200).json({
      success: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error("Create subscription checkout error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to start the Pro plan checkout.",
    });
  }
});

// VERIFY A CHECKOUT SESSION AFTER THE STRIPE REDIRECT
router.get("/verify", verifyToken, async (req, res) => {
  try {
    const stripe = getStripe();

    if (!stripe) {
      return res.status(503).json({
        success: false,
        message: "Stripe is not configured on the server yet.",
      });
    }

    const sessionId = String(req.query.session_id || "");

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Missing Stripe session ID.",
      });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const meta = session.metadata || {};

    if (session.payment_status !== "paid") {
      return res.status(409).json({
        success: false,
        message: "Payment is not completed yet.",
      });
    }

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;

    // Pro plan checkout: activate the plan for the technician.
    if (meta.type === "subscription") {
      if (meta.technicianEmail !== req.user.email) {
        return res.status(403).json({
          success: false,
          message: "This payment does not belong to you.",
        });
      }

      const activation = await activateProPlan({
        technicianEmail: meta.technicianEmail,
        technicianId: meta.technicianId,
        stripeSessionId: session.id,
        paymentIntentId,
        amount: session.amount_total ? session.amount_total / 100 : undefined,
        currency: session.currency,
      });

      if (!activation.paid) {
        return res.status(409).json({
          success: false,
          message: "The Pro plan could not be activated.",
        });
      }

      const db = getDB();
      const payment = await db
        .collection("payments")
        .findOne({ stripeSessionId: session.id });
      const user = await db
        .collection("users")
        .findOne(
          { email: req.user.email },
          { projection: { plan: 1, name: 1, email: 1 } }
        );

      return res.status(200).json({
        success: true,
        message: "FixMate Pro activated.",
        plan: user?.plan || "pro",
        payment,
      });
    }

    if (meta.customerEmail !== req.user.email) {
      return res.status(403).json({
        success: false,
        message: "This payment does not belong to you.",
      });
    }

    const result = await markBookingPaid({
      bookingId: meta.bookingId,
      stripeSessionId: session.id,
      paymentIntentId,
      amount: session.amount_total ? session.amount_total / 100 : undefined,
      currency: session.currency,
    });

    if (!result.paid) {
      return res.status(409).json({
        success: false,
        message: "Payment could not be applied to this booking.",
      });
    }

    const db = getDB();
    const booking = await db.collection("bookings").findOne({
      _id: new ObjectId(session.metadata.bookingId),
    });
    const payment = await db.collection("payments").findOne({
      bookingId: session.metadata.bookingId,
    });

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully.",
      booking,
      payment,
    });
  } catch (error) {
    console.error("Verify payment error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to verify the payment.",
    });
  }
});

// CUSTOMER PAYMENT HISTORY
router.get("/my", verifyCustomer, async (req, res) => {
  try {
    const payments = await getDB()
      .collection("payments")
      .find({ customerEmail: req.user.email })
      .sort({ paidAt: -1, createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      total: payments.length,
      payments,
    });
  } catch (error) {
    console.error("Get my payments error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load payments.",
    });
  }
});

module.exports = router;
