
const { getDB } = require("../config/db");

const initializeIndexes = async () => {
  try {
    const db = getDB();

    const paymentsCollection = db.collection("payments");

    // One payment per booking
    await paymentsCollection.createIndex(
      { bookingId: 1 },
      {
        unique: true,
        name: "unique_bookingId",
      }
    );

    // Prevent duplicate Stripe Checkout Sessions
    await paymentsCollection.createIndex(
      { stripeSessionId: 1 },
      {
        unique: true,
        name: "unique_stripeSessionId",
      }
    );

    console.log("Database indexes created successfully!");
  } catch (error) {
    console.error(
      "Database index initialization failed:",
      error.message
    );

    throw error;
  }
};

module.exports = initializeIndexes;
