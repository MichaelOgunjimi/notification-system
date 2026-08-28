# Beaco Documentation

This Next.js application owns the public documentation site and its Markdown content.
It is intentionally separate from `apps/web` so it can deploy to a documentation
subdomain without coupling dashboard releases to documentation releases.

From the repository root:

```bash
npm run dev:docs
```

Set `NEXT_PUBLIC_WEB_URL` to the main website origin. Local development defaults to
`http://localhost:3000`.
