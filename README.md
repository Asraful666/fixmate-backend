# FixMate Backend — Repair Service API

Express 5 + MongoDB API for **FixMate**, a smart device and home appliance
repair service booking platform. It verifies BetterAuth JWTs with the BetterAuth
JWKS endpoint and enforces customer, technician and admin roles on every
protected route.

## Live API

- API base URL: `https://fixmate-api.onrender.com/api` **(replace with your deployed URL)**
- Local: `http://localhost:5000/api`
- Health check: `GET /api/health`

## Admin Credentials

| Email | Password |
|---|---|
| `admin@fixmate.test` | `Demo@1234` |

## Key Features

- JWT verification through the BetterAuth JWKS endpoint (`jose`, EdDSA).
- Role guards that always authenticate before checking customer / technician /
  admin permissions.
- Server-side search, category/mode filter and sorting for public services.
- Service moderation: technicians submit services as `pending`; only
  `approved` + `available` services appear publicly.
- Booking pipeline enforced on the server:
  `requested → accepted → in-progress → completed`,
  `requested → rejected`, and customer cancel only while `requested`.
- Final amount is required when completing a job; payment is gated to
  `completed` + `unpaid` bookings.
- Stripe Checkout sessions use the server-side `finalAmount` (never a client
  amount), with idempotent payment recording from both the success redirect and
  the signed webhook.
- Demo seed with 2 technicians, 14 approved services across 7 categories and
  bookings in every main status.

## npm Packages Used

- `express`, `cors`, `dotenv`
- `mongodb`
- `jose`
- `stripe`
- `nodemon` (development)

## Tech Stack

- Node.js + Express 5 (CommonJS)
- MongoDB (official `mongodb` driver)
- BetterAuth JWT verification (`jose`, EdDSA + JWKS)
- Stripe Checkout + webhooks (test mode ready)
- ImgBB image uploads handled by the Next.js frontend

## Quick Start

```bash
cd fixmate-backend
npm install
copy .env.example .env
# fill in MONGODB_URI and DB_NAME
npm run seed
npm run dev
```

The API listens on `http://localhost:5000` by default.

Health check: `GET /api/health`

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | API port, default `5000` |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `DB_NAME` | Yes | Database name (same DB as the frontend) |
| `BETTER_AUTH_URL` | Yes | BetterAuth base URL, must match the frontend value |
| `CLIENT_URL` | Yes | Frontend origin used for Stripe redirects and CORS |
| `CORS_ORIGINS` | No | Extra comma-separated production origins |
| `STRIPE_SECRET_KEY` | Payments | Stripe test/live secret key |
| `STRIPE_WEBHOOK_SECRET` | Payments | Signing secret for `/api/payments/webhook` |

> The backend and frontend must use the same MongoDB database. BetterAuth owns
> `users`, `account`, `session` and `jwks`; this API owns `services`,
> `bookings` and `payments`.

## Demo Data

`npm run seed` recreates demo accounts and 16 services (14 approved),
7 bookings covering every main status and 1 paid payment.

All demo accounts use the password `Demo@1234`:

| Email | Role |
|---|---|
| `admin@fixmate.test` | admin |
| `customer@fixmate.test` | customer |
| `rahim@fixmate.test` | technician |
| `karim@fixmate.test` | technician |

The seeder removes only demo accounts (`@fixmate.test` and old `jwt.test.*`).
It resets the `services`, `bookings` and `payments` collections, so do not run
it against production data.

## API Reference

### Public

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/services` | Approved + available services. Query: `search`, `category`, `serviceMode`, `sort=newest\|price-low\|price-high` |
| GET | `/api/services/:id` | Approved + available service details with public technician profile |
| GET | `/api/users/technician/:id` | Public technician profile |

### Auth Test Helper

| Method | Route | Description |
|---|---|---|
| GET | `/api/auth/me` | Verify a Bearer JWT and return the current user |

### Customer (JWT required)

| Method | Route | Description |
|---|---|---|
| POST | `/api/bookings` | Create a booking for an approved service |
| GET | `/api/bookings/my` | List own bookings |
| PATCH | `/api/bookings/:id/cancel` | Cancel your own booking (only while `requested`) |
| GET | `/api/bookings/:id` | Booking details (owner, technician or admin) |
| POST | `/api/payments/create-checkout-session` | Stripe Checkout for a completed, unpaid booking |
| POST | `/api/payments/create-checkout` | Short alias of the same endpoint |
| GET | `/api/payments/verify?session_id=` | Verify a Stripe session after redirect |
| GET | `/api/payments/my` | Own payment history |
| GET | `/api/users/me` | Own profile |
| PATCH | `/api/users/profile` | Update name, phone, area, bio, image (alias: `/api/users/me`) |

### Technician (JWT + technician role)

| Method | Route | Description |
|---|---|---|
| POST | `/api/services` | Create a service (starts as `pending`) |
| GET | `/api/services/mine` | Own services in every approval state |
| PATCH | `/api/services/:id` | Edit own service (resets approval to `pending`) |
| PATCH | `/api/services/:id/availability` | Toggle availability |
| DELETE | `/api/services/:id` | Delete own service (blocked with active bookings) |
| GET | `/api/bookings/technician` | Bookings for own services |
| PATCH | `/api/bookings/:id/status` | Advance booking status |

### Admin (JWT + admin role)

| Method | Route | Description |
|---|---|---|
| GET | `/api/admin/stats` | Counts, users by role, revenue |
| GET | `/api/admin/users` | List users with optional `role` / `search` filters |
| GET | `/api/admin/services` | All services; filter with `approvalStatus` |
| PATCH | `/api/admin/services/:id/approval` | Approve or reject a service |
| GET | `/api/admin/bookings` | All bookings; filter with `status` |
| GET | `/api/admin/payments` | All payments |
| GET | `/api/users` | Legacy user list (admin guard) |
| PATCH | `/api/admin/users/:id/role` | Change a user role (not your own) |

## Business Rules

- Public service list only returns `approvalStatus: "approved"` and
  `isAvailable: true`.
- Editing a service sends it back to `pending` approval.
- Technicians can only edit/delete their own services and update bookings
  that belong to their own services.
- Customers can only see and cancel their own bookings, and only while the
  booking is still `requested`.
- Booking flow:
  `requested → accepted → in-progress → completed`
  with `requested → rejected` and `requested → cancelled`.
- Completing a job requires `finalAmount > 0`; it becomes the payable amount.
- A customer cannot create a second active booking for the same service.
- Payment is only possible when the booking is `completed` and `unpaid`.
- Payment updates are idempotent: the redirect verifier and the webhook cannot
  double-apply a payment.
- Roles are read from MongoDB on every request, so an admin role change takes
  effect immediately even with an older JWT.

## Stripe Test Mode

1. Add `STRIPE_SECRET_KEY` and `CLIENT_URL` to `.env`.
2. Start the API.
3. Forward webhooks locally:

```bash
stripe listen --forward-to localhost:5000/api/payments/webhook
```

4. Put the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET` and restart.
5. Pay with Stripe test card `4242 4242 4242 4242`, any future expiry and CVC.

The webhook route is mounted before `express.json()` so the signature is
verified against the raw body.

## Production Deployment Checklist

- [ ] Create a MongoDB Atlas database and allow the API host IP.
- [ ] Set every variable from the table above on the API host (Render/Railway/Fly).
- [ ] Set `CLIENT_URL` to the deployed frontend URL and `CORS_ORIGINS` if needed.
- [ ] Keep `BETTER_AUTH_URL` identical to the frontend `BETTER_AUTH_URL`.
- [ ] Add the production Stripe webhook endpoint
      `https://<api-host>/api/payments/webhook` and copy its signing secret.
- [ ] Use Stripe test keys for the assignment demo; only switch to live keys
      after review.
- [ ] Run `npm run seed` once against the demo database if demo content is needed.
- [ ] Confirm `GET /api/health` returns 200 from the deployed URL.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start with nodemon |
| `npm start` | Start production server |
| `npm run seed` | Recreate demo users, services, bookings and payments |
