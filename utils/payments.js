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
  if (payment?.paymentStatus === "paid") {
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

  if (booking.paymentStatus === "paid") {
    return { paid: true, alreadyPaid: true };
  }

  const now = new Date();

  await payments.updateOne(
    { bookingId },
    {
      $set: {
        bookingId,
        serviceTitle: booking.serviceTitle,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        technicianName: booking.technicianName,
        technicianEmail: booking.technicianEmail,
        amount:
          Number(amount ?? booking.finalAmount ?? booking.basePrice) ||
          booking.basePrice,
        currency: currency || payment?.currency || "usd",
        paymentStatus: "paid",
        stripeSessionId:
          stripeSessionId || payment?.stripeSessionId || null,
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
    {
      $set: { paymentStatus: "paid", updatedAt: now },
      $push: {
        statusHistory: {
          status: "paid",
          changedAt: now,
          note: "Payment completed with Stripe.",
        },
      },
    }
  );

  return { paid: true, alreadyPaid: false };
};

// Activates the FixMate Pro plan for a technician after a Stripe subscription
// payment and records the transaction in the payments collection.
const activateProPlan = async ({
  technicianEmail,
  technicianId,
  stripeSessionId,
  paymentIntentId,
  amount,
  currency,
}) => {
  const db = getDB();
  const payments = db.collection("payments");
  const users = db.collection("users");

  const existing = await payments.findOne({ stripeSessionId });

  if (existing?.paymentStatus === "paid") {
    return { paid: true, alreadyPaid: true };
  }

  const technician = await users.findOne({ email: technicianEmail });

  if (!technician) {
    return { paid: false, reason: "technician-not-found" };
  }

  const now = new Date();
  const technicianObjectId = technician._id.toString();

  await payments.updateOne(
    { stripeSessionId },
    {
      $set: {
        paymentType: "subscription",
        plan: "pro",
        serviceTitle: "FixMate Pro Plan (monthly)",
        technicianId: technicianObjectId,
        technicianName: technician.name || "",
        technicianEmail,
        customerId: technicianObjectId,
        customerName: technician.name || "",
        customerEmail: technicianEmail,
        amount: Number(amount) || 0,
        currency: currency || "usd",
        paymentStatus: "paid",
        transactionId: paymentIntentId || stripeSessionId || null,
        paidAt: now,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  await users.updateOne(
    { _id: technician._id },
    { $set: { plan: "pro", updatedAt: now } }
  );

  // The public cards read the badge from the service document.
  await db.collection("services").updateMany(
    { technicianId: technicianId || technicianObjectId },
    { $set: { technicianPlan: "pro", updatedAt: now } }
  );

  return { paid: true, alreadyPaid: false };
};

module.exports = { markBookingPaid, activateProPlan };
