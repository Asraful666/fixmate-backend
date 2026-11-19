/**
 * FixMate demo data seeder.
 *
 * Usage: npm run seed
 *
 * It resets the demo content of `services`, `bookings` and `payments`,
 * recreates the demo accounts and inserts 12+ approved services with
 * bookings in different statuses.
 *
 * Real user accounts are never touched; only demo accounts with the
 * @fixmate.test domain (and old jwt.test accounts) are replaced.
 */

require("dotenv").config();

const { randomBytes, scrypt } = require("node:crypto");
const { promisify } = require("node:util");
const { MongoClient, ObjectId } = require("mongodb");

const scryptAsync = promisify(scrypt);

const PASSWORD_CONFIG = {
  N: 16384,
  r: 16,
  p: 1,
  dkLen: 64,
};

// Matches BetterAuth's credential password hashing (salt:key).
const hashPassword = async (password) => {
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(password.normalize("NFKC"), salt, PASSWORD_CONFIG.dkLen, {
    N: PASSWORD_CONFIG.N,
    r: PASSWORD_CONFIG.r,
    p: PASSWORD_CONFIG.p,
    maxmem: 128 * PASSWORD_CONFIG.N * PASSWORD_CONFIG.r * 2,
  });

  return `${salt}:${key.toString("hex")}`;
};

const demoPassword = "Demo@1234";

const ids = {
  admin: "6a0000000000000000000001",
  customer: "6a0000000000000000000002",
  rahim: "6a0000000000000000000003",
  karim: "6a0000000000000000000004",
};

const images = {
  smartphone:
    "https://images.unsplash.com/photo-1511709268805-1e6c1a5e8c9b?w=800",
  laptop:
    "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=800",
  ac: "https://images.unsplash.com/photo-1631545806609-9c6b7e3c9c7a?w=800",
  refrigerator:
    "https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=800",
  tv: "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=800",
  washing:
    "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=800",
  electrical:
    "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800",
};

const daysFromNow = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(10, 0, 0, 0);
  return date;
};

const buildUsers = () => [
  {
    _id: new ObjectId(ids.admin),
    name: "FixMate Admin",
    email: "admin@fixmate.test",
    emailVerified: true,
    role: "admin",
    phone: "+8801700000000",
    area: "Dhaka",
    bio: "FixMate platform administrator.",
  },
  {
    _id: new ObjectId(ids.customer),
    name: "Arif Hasan",
    email: "customer@fixmate.test",
    emailVerified: true,
    role: "customer",
    phone: "+8801700000001",
    area: "Dhanmondi, Dhaka",
    bio: "",
  },
  {
    _id: new ObjectId(ids.rahim),
    name: "Rahim Ahmed",
    email: "rahim@fixmate.test",
    emailVerified: true,
    role: "technician",
    phone: "+8801700000002",
    area: "Dhanmondi, Dhaka",
    bio: "Certified technician with 8 years of experience in smartphones, laptops and home appliances.",
  },
  {
    _id: new ObjectId(ids.karim),
    name: "Karim Uddin",
    email: "karim@fixmate.test",
    emailVerified: true,
    role: "technician",
    phone: "+8801700000003",
    area: "Mirpur, Dhaka",
    bio: "AC, refrigerator and electrical repair specialist serving Dhaka since 2015.",
  },
].map((user) => {
  const now = new Date();
  return {
    ...user,
    image: "",
    createdAt: now,
    updatedAt: now,
  };
});

const services = [
  {
    title: "iPhone Screen Replacement",
    category: "Smartphone",
    description:
      "Original quality screen replacement for iPhone models with free diagnostics and 7-day service warranty.",
    image: images.smartphone,
    technician: "rahim",
    basePrice: 60,
    serviceMode: "Shop Drop-off",
    estimatedDuration: "1-2 hours",
    serviceArea: "Dhanmondi, Dhaka",
  },
  {
    title: "Samsung Battery Replacement",
    category: "Smartphone",
    description:
      "Battery replacement for Samsung Galaxy phones using tested cells and safe installation.",
    image: images.smartphone,
    technician: "rahim",
    basePrice: 35,
    serviceMode: "Shop Drop-off",
    estimatedDuration: "45-60 minutes",
    serviceArea: "Dhanmondi, Dhaka",
  },
  {
    title: "Laptop Hardware Diagnosis",
    category: "Laptop & PC",
    description:
      "Complete hardware inspection for laptops that will not boot, overheat, or shut down randomly.",
    image: images.laptop,
    technician: "rahim",
    basePrice: 25,
    serviceMode: "Home Visit",
    estimatedDuration: "1-2 hours",
    serviceArea: "Dhanmondi, Dhaka",
  },
  {
    title: "Laptop Keyboard Replacement",
    category: "Laptop & PC",
    description:
      "Keyboard replacement for popular laptop brands with same-day fitting when the part is in stock.",
    image: images.laptop,
    technician: "karim",
    basePrice: 45,
    serviceMode: "Shop Drop-off",
    estimatedDuration: "2-3 hours",
    serviceArea: "Mirpur, Dhaka",
  },
  {
    title: "AC Servicing & Gas Refill",
    category: "AC",
    description:
      "Deep cleaning of indoor and outdoor units, filter wash, and refrigerant top-up for split ACs.",
    image: images.ac,
    technician: "karim",
    basePrice: 80,
    serviceMode: "Home Visit",
    estimatedDuration: "2-3 hours",
    serviceArea: "Mirpur, Dhaka",
  },
  {
    title: "Split AC Installation",
    category: "AC",
    description:
      "Professional split AC installation including bracket fitting, pipe routing, and leak testing.",
    image: images.ac,
    technician: "karim",
    basePrice: 95,
    serviceMode: "Home Visit",
    estimatedDuration: "3-4 hours",
    serviceArea: "Mirpur, Dhaka",
  },
  {
    title: "Refrigerator Gas Refill",
    category: "Refrigerator",
    description:
      "Leak detection and gas refilling for refrigerators that are cooling poorly or not at all.",
    image: images.refrigerator,
    technician: "rahim",
    basePrice: 70,
    serviceMode: "Home Visit",
    estimatedDuration: "2-3 hours",
    serviceArea: "Dhanmondi, Dhaka",
  },
  {
    title: "Refrigerator Compressor Repair",
    category: "Refrigerator",
    description:
      "Compressor testing, replacement, and relay repair for all major refrigerator brands.",
    image: images.refrigerator,
    technician: "karim",
    basePrice: 120,
    serviceMode: "Home Visit",
    estimatedDuration: "1 day",
    serviceArea: "Mirpur, Dhaka",
  },
  {
    title: "TV Screen Repair",
    category: "TV",
    description:
      "Panel and backlight repair for LED and smart TVs with pickup and delivery support.",
    image: images.tv,
    technician: "rahim",
    basePrice: 110,
    serviceMode: "Shop Drop-off",
    estimatedDuration: "2-3 days",
    serviceArea: "Dhanmondi, Dhaka",
  },
  {
    title: "Smart TV Wall Mount Installation",
    category: "TV",
    description:
      "Secure wall mount installation for 32 to 65 inch TVs including bracket and cable management.",
    image: images.tv,
    technician: "karim",
    basePrice: 40,
    serviceMode: "Home Visit",
    estimatedDuration: "1-2 hours",
    serviceArea: "Mirpur, Dhaka",
  },
  {
    title: "Washing Machine Drum Cleaning",
    category: "Washing Machine",
    description:
      "Deep drum cleaning and descaling to remove odor, detergent build-up, and bacteria.",
    image: images.washing,
    technician: "karim",
    basePrice: 55,
    serviceMode: "Home Visit",
    estimatedDuration: "1-2 hours",
    serviceArea: "Mirpur, Dhaka",
  },
  {
    title: "Washing Machine Motor Repair",
    category: "Washing Machine",
    description:
      "Motor inspection, carbon brush replacement, and control board troubleshooting.",
    image: images.washing,
    technician: "rahim",
    basePrice: 90,
    serviceMode: "Shop Drop-off",
    estimatedDuration: "1-2 days",
    serviceArea: "Dhanmondi, Dhaka",
  },
  {
    title: "Ceiling Fan Installation",
    category: "Electrical",
    description:
      "Ceiling fan installation with hook fitting, wiring, regulator setup, and balance testing.",
    image: images.electrical,
    technician: "karim",
    basePrice: 30,
    serviceMode: "Home Visit",
    estimatedDuration: "1-2 hours",
    serviceArea: "Mirpur, Dhaka",
  },
  {
    title: "Home Wiring Fault Check",
    category: "Electrical",
    description:
      "Electrical fault finding for tripping breakers, dead sockets, and flickering lights.",
    image: images.electrical,
    technician: "rahim",
    basePrice: 50,
    serviceMode: "Home Visit",
    estimatedDuration: "1-3 hours",
    serviceArea: "Dhanmondi, Dhaka",
  },
  {
    title: "Microwave Oven Repair",
    category: "Electrical",
    description:
      "Heating and control panel repair for microwave ovens. Currently under admin review.",
    image: images.electrical,
    technician: "karim",
    basePrice: 65,
    serviceMode: "Shop Drop-off",
    estimatedDuration: "1-2 days",
    serviceArea: "Mirpur, Dhaka",
    approvalStatus: "pending",
  },
  {
    title: "Water Purifier Filter Change",
    category: "Electrical",
    description:
      "Filter replacement and cleaning for RO water purifiers. Currently under admin review.",
    image: images.electrical,
    technician: "rahim",
    basePrice: 38,
    serviceMode: "Home Visit",
    estimatedDuration: "45-60 minutes",
    serviceArea: "Dhanmondi, Dhaka",
    approvalStatus: "pending",
  },
];

const buildServices = (usersById) => {
  const now = new Date();

  return services.map((service, index) => {
    const technician = usersById[service.technician];
    const id = new ObjectId(
      `6a000000000000000000${String(101 + index).padStart(4, "0")}`
    );

    return {
      _id: id,
      title: service.title,
      category: service.category,
      description: service.description,
      image: service.image,
      technicianId: technician._id.toString(),
      technicianName: technician.name,
      basePrice: service.basePrice,
      serviceMode: service.serviceMode,
      estimatedDuration: service.estimatedDuration,
      serviceArea: service.serviceArea,
      approvalStatus: service.approvalStatus || "approved",
      isAvailable: true,
      createdAt: new Date(now.getTime() - (index + 1) * 24 * 60 * 60 * 1000),
      updatedAt: now,
    };
  });
};

const buildBookings = (usersById, servicesByTitle) => {
  const customer = usersById.customer;

  const makeBooking = ({
    index,
    serviceTitle,
    status,
    bookingDate,
    createdDaysAgo,
    paymentStatus = "unpaid",
    rejectionReason = "",
  }) => {
    const service = servicesByTitle[serviceTitle];
    const technician = usersById[service.technician];

    return {
      _id: new ObjectId(
        `6a000000000000000000${String(201 + index).padStart(4, "0")}`
      ),
      customerId: customer._id.toString(),
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      technicianId: technician._id.toString(),
      technicianName: technician.name,
      serviceId: service._id.toString(),
      serviceTitle: service.title,
      serviceMode: service.serviceMode,
      serviceArea: service.serviceArea,
      price: service.basePrice,
      bookingDate,
      address: "House 12, Road 4, Dhanmondi, Dhaka",
      phone: customer.phone,
      note: "Please call before arriving.",
      status,
      paymentStatus,
      rejectionReason,
      createdAt: daysFromNow(-createdDaysAgo),
      updatedAt: new Date(),
    };
  };

  return [
    makeBooking({
      index: 0,
      serviceTitle: "iPhone Screen Replacement",
      status: "requested",
      bookingDate: daysFromNow(3),
      createdDaysAgo: 1,
    }),
    makeBooking({
      index: 1,
      serviceTitle: "AC Servicing & Gas Refill",
      status: "accepted",
      bookingDate: daysFromNow(5),
      createdDaysAgo: 2,
    }),
    makeBooking({
      index: 2,
      serviceTitle: "Laptop Hardware Diagnosis",
      status: "in-progress",
      bookingDate: daysFromNow(0),
      createdDaysAgo: 3,
    }),
    makeBooking({
      index: 3,
      serviceTitle: "Refrigerator Gas Refill",
      status: "completed",
      bookingDate: daysFromNow(-4),
      createdDaysAgo: 8,
    }),
    makeBooking({
      index: 4,
      serviceTitle: "Washing Machine Drum Cleaning",
      status: "completed",
      bookingDate: daysFromNow(-10),
      createdDaysAgo: 14,
      paymentStatus: "paid",
    }),
    makeBooking({
      index: 5,
      serviceTitle: "TV Screen Repair",
      status: "rejected",
      bookingDate: daysFromNow(7),
      createdDaysAgo: 5,
      rejectionReason:
        "This TV model needs a panel that is currently out of stock.",
    }),
    makeBooking({
      index: 6,
      serviceTitle: "Ceiling Fan Installation",
      status: "cancelled",
      bookingDate: daysFromNow(2),
      createdDaysAgo: 4,
    }),
  ];
};

const buildPayment = (usersById, paidBooking) => {
  const technician = usersById[paidBooking.technicianId === ids.rahim ? "rahim" : "karim"];
  const now = new Date();

  return {
    _id: new ObjectId("6a0000000000000000000301"),
    bookingId: paidBooking._id.toString(),
    customerId: paidBooking.customerId,
    technicianId: paidBooking.technicianId,
    amount: paidBooking.price,
    currency: "usd",
    status: "paid",
    stripeSessionId: "cs_test_seed_paid_001",
    transactionId: "pi_seed_paid_001",
    paidAt: daysFromNow(-9),
    createdAt: daysFromNow(-10),
    updatedAt: now,
    technicianName: technician.name,
  };
};

const main = async () => {
  const { MONGODB_URI, DB_NAME } = process.env;

  if (!MONGODB_URI || !DB_NAME) {
    throw new Error("MONGODB_URI and DB_NAME must be set in .env");
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();

    const db = client.db(DB_NAME);

    console.log(`Connected to database: ${DB_NAME}`);

    // Only demo accounts are removed; real sign-ups stay untouched.
    const demoUsers = await db
      .collection("users")
      .find({
        $or: [
          { email: { $regex: "@fixmate\\.test$" } },
          { email: { $regex: "^jwt\\.test\\." } },
        ],
      })
      .toArray();

    const demoUserIds = demoUsers.map((user) => user._id);

    if (demoUserIds.length > 0) {
      await db
        .collection("account")
        .deleteMany({ userId: { $in: demoUserIds } });
      await db
        .collection("session")
        .deleteMany({ userId: { $in: demoUserIds } });
    }

    await db
      .collection("users")
      .deleteMany({
        $or: [
          { email: { $regex: "@fixmate\\.test$" } },
          { email: { $regex: "^jwt\\.test\\." } },
        ],
      });

    await Promise.all([
      db.collection("payments").deleteMany({}),
      db.collection("bookings").deleteMany({}),
      db.collection("services").deleteMany({}),
    ]);

    const users = buildUsers();

    await db.collection("users").insertMany(users);

    const passwordHash = await hashPassword(demoPassword);
    const now = new Date();

    await db.collection("account").insertMany(
      users.map((user, index) => ({
        _id: new ObjectId(`6a0000000000000000000a0${index + 1}`),
        accountId: user._id.toString(),
        providerId: "credential",
        userId: user._id,
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
      }))
    );

    const usersById = Object.fromEntries(
      users.map((user) => [
        user.email.startsWith("rahim")
          ? "rahim"
          : user.email.startsWith("karim")
            ? "karim"
            : user.email.startsWith("admin")
              ? "admin"
              : "customer",
        user,
      ])
    );

    const seededServices = buildServices(usersById);

    await db.collection("services").insertMany(seededServices);

    // Keep the source data (for image + category) next to the inserted docs.
    const servicesByTitle = Object.fromEntries(
      services.map((service, index) => [
        service.title,
        {
          ...service,
          _id: seededServices[index]._id,
        },
      ])
    );

    const bookings = buildBookings(usersById, servicesByTitle);

    await db.collection("bookings").insertMany(bookings);

    const paidBooking = bookings.find(
      (booking) => booking.paymentStatus === "paid"
    );

    await db.collection("payments").insertOne(
      buildPayment(usersById, paidBooking)
    );

    console.log("Seed finished.");
    console.log(`Users: ${users.length} (2 technicians)`);
    console.log(
      `Services: ${seededServices.length} (${seededServices.filter((service) => service.approvalStatus === "approved").length} approved)`
    );
    console.log(`Bookings: ${bookings.length} (all main statuses)`);
    console.log("Demo login password:", demoPassword);
    console.log("  admin@fixmate.test (admin)");
    console.log("  customer@fixmate.test (customer)");
    console.log("  rahim@fixmate.test (technician)");
    console.log("  karim@fixmate.test (technician)");
  } finally {
    await client.close();
  }
};

main().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exit(1);
});
