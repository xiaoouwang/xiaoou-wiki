# Xiaoou Wiki

Public learning site on **GitHub Pages**. Cloudflare is only the private **database/API** for admin notes — no login on the public pages.

| Topic | Entry |
| --- | --- |
| Snowboard | [index.html](index.html) |
| Ski | [ski.html](ski.html) |
| Singing | [singing.html](singing.html) |
| Piano | [piano.html](piano.html) |
| Guitar | [guitar.html](guitar.html) |
| Badminton | [badminton.html](badminton.html) |
| Swimming | [swimming.html](swimming.html) |
| Self-development | [self-development.html](self-development.html) |

## Public site

```bash
npm start
```

Live: https://xiaoouwang.github.io/xiaoou-wiki/

## Admin database (Cloudflare)

The Worker `xiaoou-wiki-api` stores records in D1. Open unlisted `admin.html` (not linked from the site), unlock with your admin token, then save notes.

```bash
npm run api:deploy
npm run db:migrate
```

Set the token once:

```bash
npx wrangler secret put ADMIN_TOKEN
```

## Credit

Design by [Xiaoou Wang](https://xiaoouwang.github.io/) — PhD in AI, national ski and snowboarding instructor.
