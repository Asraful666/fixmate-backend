const { ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose");

const { getDB } = require("../config/db");

// BetterAuth signs JWTs with this base URL as issuer and audience.
// Keep this value identical to BETTER_AUTH_URL in the frontend .env.local.
const authBaseUrl = (
  process.env.BETTER_AUTH_URL || "http://localhost:3000"
).replace(/\/+$/, "");

const jwksUrl = new URL(`${authBaseUrl}/api/auth/jwks`);

// Caches keys in memory and refreshes them when an unknown `kid` appears.
const jwks = createRemoteJWKSet(jwksUrl);

const getBearerToken = (req) => {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice(7).trim();

  return token || null;
};

const findUser = async (payload) => {
  const users = getDB().collection("users");

  // BetterAuth's MongoDB adapter maps user.id to the ObjectId in _id.
  if (payload.sub && ObjectId.isValid(payload.sub)) {
    const byId = await users.findOne({
      _id: new ObjectId(payload.sub),
    });

    if (byId) {
      return byId;
    }
  }

  // Fallback for tokens whose subject is not an ObjectId string.
  if (payload.email) {
    return users.findOne({
      email: String(payload.email).toLowerCase(),
    });
  }

  return null;
};

const verifyToken = async (req, res, next) => {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const { payload } = await jwtVerify(token, jwks, {
      issuer: authBaseUrl,
      audience: authBaseUrl,
      algorithms: ["EdDSA"],
    });

    const user = await findUser(payload);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account not found.",
      });
    }

    req.auth = payload;

    // Load the role from MongoDB on every request instead of trusting
    // the token, so role changes and deleted accounts take effect at once.
    req.user = {
      id: user._id.toString(),
      name: user.name || "",
      email: user.email || "",
      image: user.image || "",
      role: user.role || "customer",
      phone: user.phone || "",
      area: user.area || "",
      bio: user.bio || "",
    };

    return next();
  } catch (error) {
    console.error("JWT verification failed:", error.message);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to perform this action.",
    });
  }

  return next();
};

// Convenience guards that always authenticate before checking the role.
// Express accepts arrays of middleware, so these can be used directly:
//   router.get("/path", verifyCustomer, handler)
const verifyCustomer = [verifyToken, requireRole("customer")];
const verifyTechnician = [verifyToken, requireRole("technician")];
const verifyAdmin = [verifyToken, requireRole("admin")];

module.exports = {
  verifyToken,
  verifyCustomer,
  verifyTechnician,
  verifyAdmin,
  requireRole,
};
