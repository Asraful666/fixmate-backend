const express = require("express");
const { ObjectId } = require("mongodb");

const { getDB } = require("../config/db");
const { verifyCustomer } = require("../middleware/authMiddleware");
const { getStripe, getClientUrl } = require("../utils/stripe");
const { markBookingPaid } = require("../utils/payments");
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

// VERIFY A CHECKOUT SESSION AFTER THE STRIPE REDIRECT
router.get("/verify", verifyCustomer, async (req, res) => {
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

    if (session.metadata?.customerEmail !== req.user.email) {
      return res.status(403).json({
        success: false,
        message: "This payment does not belong to you.",
      });
    }

    if (session.payment_status !== "paid") {
      return res.status(409).json({
        success: false,
        message: "Payment is not completed yet.",
      });
    }

    const result = await markBookingPaid({
      bookingId: session.metadata?.bookingId,
      stripeSessionId: session.id,
      paymentIntentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id,
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
