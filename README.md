# Xiaoou Wiki

Public learning site on **GitHub Pages**. Cloudflare holds the **admin-owned database** so content you push from this machine can be synced and later exported as one account.

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

Live: https://xiaoouwang.github.io/xiaoou-wiki/

```bash
npm start
```

No public login. Visitors only see the published site.

## Media storage (Cloudflare R2)

Downloaded coaching videos and thumbnails are stored in the **xiaoou-wiki-media** R2 bucket and served from `https://xiaoou-wiki-api.singerxo.workers.dev/media/…` — not from GitHub.

```bash
npm run media:upload -- videos/….mp4 thumbnails/….jpg
```

`npm run add:video` uploads to R2 automatically.

## Admin ownership (push → database)

Every `git push` from this computer runs a **pre-push hook** that syncs text content (`data/`, pages, css, js, …) into D1 under the single **admin** identity.

1. Create a local `.env` (gitignored):

```bash
echo 'ADMIN_TOKEN=your_token_here' > .env
```

2. Install hooks (also runs on `npm install`):

```bash
npm run hooks:install
```

3. Push as usual — sync happens automatically:

```bash
git push
```

Manual sync / full export:

```bash
npm run sync:admin
npm run export:admin
```

Unlisted editor for notes: [admin.html](admin.html) (not linked from the public UI).

## API deploy

```bash
npm run api:deploy
npm run db:migrate
```

## Credit

Design by [Xiaoou Wang](https://xiaoouwang.github.io/) — PhD in AI, National ski and snowboarding instructor.
