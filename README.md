easy-shopping__Server

Backend API for  — a multi-vendor e-commerce marketplace.

Built with **Express**, **TypeScript**, **MongoDB / Mongoose**, JWT auth, and Cloudinary uploads.

## Getting Started

```bash
npm install
npm run start:dev   # development (ts-node-dev, port 5000)
```

## Environment

Copy `.env.example` to `.env` and fill in your own values:

- `DATABASE_URL` — MongoDB connection string
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `EMAIL_*`, `BKASH_*` (optional)

> **Never commit `.env`** — it holds secrets and is gitignored.
