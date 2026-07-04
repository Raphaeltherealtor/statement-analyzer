This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Authentication (single-user gate)

The whole app — every page and API route — is locked behind a password. Only
someone who knows the password can log in; there are no public routes except the
login screen itself. This is enforced in `proxy.ts` (this Next version's
middleware), which verifies a signed, HttpOnly session cookie on every request.

Set these two environment variables (locally in `.env.local`, and in the Vercel
project settings for production):

| Variable | What it is |
| --- | --- |
| `APP_PASSWORD` | The password you type to log in. Choose something strong. |
| `SESSION_SECRET` | A random string (16+ chars) used to sign session cookies. Generate with `openssl rand -base64 32`. Keep it secret; changing it logs everyone out. |

If either is missing, the login endpoint returns a 503 explaining what to set,
so the app fails closed rather than open. Log out any time via the button in the
top-right corner.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
