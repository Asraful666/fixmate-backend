const { ObjectId } = require("mongodb");

const CATEGORIES = [
  "Smartphone",
  "Laptop & PC",
  "AC",
  "Refrigerator",
  "TV",
  "Washing Machine",
  "Electrical",
];

const SERVICE_MODES = ["Home Visit", "Shop Drop-off"];

const ROLES = ["customer", "technician", "admin"];

const BOOKING_STATUSES = [
  "requested",
  "accepted",
  "rejected",
  "in-progress",
  "completed",
  "cancelled",
];

const ACTIVE_BOOKING_STATUSES = ["requested", "accepted", "in-progress"];

const isValidObjectId = (value) =>
  typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value);

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const toPositiveNumber = (value) => {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : null;
};

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const parseDateOnly = (value) => {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  date.setHours(0, 0, 0, 0);

  return date;
};

const toObjectId = (value) => new ObjectId(value);

module.exports = {
  CATEGORIES,
  SERVICE_MODES,
  ROLES,
  BOOKING_STATUSES,
  ACTIVE_BOOKING_STATUSES,
  isValidObjectId,
  isNonEmptyString,
  toPositiveNumber,
  startOfToday,
  parseDateOnly,
  toObjectId,
};
