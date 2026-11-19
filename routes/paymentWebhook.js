const { getStripe } = require("../utils/stripe");
const { markBookingPaid, activateProPlan } = require("../utils/payments");

// Mounted before express.json() so Stripe can verify the raw body.
const handleStripeWebhook = async (req, res) => {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    return res.status(503).json({
      success: false,
      message: "Stripe webhook is not configured.",
    });
  }

  const signature = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      webhookSecret
    );
  } catch (error) {
    console.error("Stripe webhook signature error:", error.message);

    return res.status(400).json({
      success: false,
      message: "Invalid webhook signature.",
    });
  }

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object;

      if (session.payment_status === "paid") {
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;

        // Pro plan subscription payments activate the technician plan.
        if (session.metadata?.type === "subscription") {
          await activateProPlan({
            technicianEmail: session.metadata.technicianEmail,
            technicianId: session.metadata.technicianId,
            stripeSessionId: session.id,
            paymentIntentId,
            amount: session.amount_total ? session.amount_total / 100 : undefined,
            currency: session.currency,
          });
        } else {
          await markBookingPaid({
            bookingId: session.metadata?.bookingId,
            stripeSessionId: session.id,
            paymentIntentId,
            amount: session.amount_total ? session.amount_total / 100 : undefined,
            currency: session.currency,
          });
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Stripe webhook handling error:", error);

    // Non-2xx tells Stripe to retry later.
    return res.status(500).json({ received: false });
  }
};

module.exports = handleStripeWebhook;
