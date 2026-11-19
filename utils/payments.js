const { ObjectId } = require("mongodb");

const { getDB } = require("../config/db");
const { isValidObjectId } = require("./validation");

// Marks a booking paid exactly once. Safe to call from both the
// redirect verification and the Stripe webhook.
const markBookingPaid = async ({
  bookingId,
  stripeSessionId,
  paymentIntentId,
  amount,
  currency,
}) => {
  if (!isValidObjectId(bookingId)) {
    return { paid: false, reason: "invalid-booking" };
  }

  const db = getDB();
  const payments = db.collection("payments");
  const bookings = db.collection("bookings");

  const payment = await payments.findOne({ bookingId });

  // Idempotency: a paid payment never gets updated twice.
  if (payment?.status === "paid") {
    return { paid: true, alreadyPaid: true };
  }

  const booking = await bookings.findOne({ _id: new ObjectId(bookingId) });

  if (!booking) {
    return { paid: false, reason: "booking-not-found" };
  }

  if (booking.status !== "completed") {
    // Payment is only allowed for completed work.
    return { paid: false, reason: "booking-not-completed" };
  }

  const now = new Date();

  await payments.updateOne(
    { bookingId },
    {
      $set: {
        bookingId,
        customerId: booking.customerId,
        technicianId: booking.technicianId,
        amount: Number(amount ?? booking.price) || booking.price,
        currency: currency || payment?.currency || "usd",
        status: "paid",
        stripeSessionId: stripeSessionId || payment?.stripeSessionId || null,
        transactionId: paymentIntentId || stripeSessionId || null,
        paidAt: now,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  await bookings.updateOne(
    { _id: new ObjectId(bookingId) },
    { $set: { paymentStatus: "paid", updatedAt: now } }
  );

  return { paid: true, alreadyPaid: false };
};

module.exports = { markBookingPaid };
