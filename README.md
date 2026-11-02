# LoakinAja API

Express 5 REST API using MySQL/Sequelize, JWT bearer authentication, and Cloudflare R2 for listing images.

## Requirements

- Node.js 20+
- MySQL 8 (create the database named in `DB_NAME` before starting)
- Cloudflare R2 bucket and S3-compatible access keys for image uploads

## Run locally

```bash
npm install
cp .env.example .env
```

Set `DB_*` and a strong `JWT_SECRET` in `.env`, then start the API:

```bash
npm run dev
```

The server listens on port 4000 by default. It creates missing Sequelize tables at startup; it does not alter existing schemas. Use database migrations for production schema changes. Configure the R2 fields to enable image uploads; the rest of the API can run without R2 configured.

## Endpoints

All endpoints are prefixed with `/api`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | No | API and database health |
| POST | `/auth/register` | No | Create an account and return a JWT |
| POST | `/auth/login` | No | Verify credentials and return a JWT |
| GET | `/auth/me` | Bearer token | Get the current account |
| PATCH | `/auth/me` | Bearer token | Update name, email, and phone |
| POST | `/auth/change-password` | Bearer token | Change account password |
| GET | `/auth/referral-count` | Bearer token | Get referral count |
| GET | `/listings` | No | Browse active listings (`page`, `limit`, `category`, `q`) |
| GET | `/listings/mine` | Bearer token | Get the authenticated user's listings |
| GET | `/listings/:id` | No | Get one active listing |
| POST | `/listings` | Bearer token | Create listing; multipart fields plus up to 5 `images` files |
| PATCH | `/listings/:id` | Bearer token | Update own listing fields |
| DELETE | `/listings/:id` | Bearer token | Delete own listing |

Example registration:

```json
{
  "name": "Ayu",
  "email": "ayu@example.com",
  "phone": "+628123456789",
  "password": "a-strong-password"
}
```

Send `Authorization: Bearer <token>` to protected routes. Image uploads accept JPEG, PNG, or WebP up to 5 MB per image. R2 bucket objects need public read access (or a configured public custom domain) for returned image URLs to load. Publishing a listing deducts one token in the same transaction as creating it.

## Notes

- Passwords are stored as bcrypt hashes; API responses never include password hashes.
- Set `WEB_ORIGIN` to the frontend origin. For multiple allowed origins, use a comma-separated list.
- Never commit `.env` or production credentials.
- This starter does not implement the frontend's OTP login/reset flows or payment processing yet.
