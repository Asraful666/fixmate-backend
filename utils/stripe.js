const Stripe = require("stripe");

let client = null;

const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return null;
  }

  if (!client) {
    client = new Stripe(secretKey);
  }

  return client;
};

const getClientUrl = () =>
  (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/+$/, "");

module.exports = {
  getStripe,
  getClientUrl,
};
