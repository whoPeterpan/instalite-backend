# InstaLite Backend

A RESTful social media backend for the InstaLite assignment. It implements user and post CRUD, relational likes, pagination, filtering and sorting on Node.js, Express, Prisma ORM and PostgreSQL.

## Technology stack

- Node.js (CommonJS)
- Express 5
- Prisma ORM 7 with `@prisma/adapter-pg`
- PostgreSQL
- Supertest for HTTP tests

## Architecture

The API follows MVC:

- **Routes** map HTTP methods and paths to controllers.
- **Controllers** validate requests and send HTTP responses.
- **Services** run Prisma queries and business logic. They never use `req` or `res`.
- **Utils** hold shared pagination parsing and metadata.

Nested user objects (`author`, likers) expose only `id`, `username` and `fullname`. Email is never included in those summaries.

## Project structure

```txt
prisma/
  schema.prisma
  seed-data.js
  seed.js
  migrations/
src/
  index.js
  db.js
  utils/pagination.js
  routes/users.routes.js
  routes/posts.routes.js
  controllers/users.controller.js
  controllers/posts.controller.js
  controllers/likes.controller.js
  services/users.service.js
  services/posts.service.js
  services/likes.service.js
tests/run-all-tests.js
prisma.config.js
prisma7.config.js
package.json
```

## Prerequisites

- Node.js 18+
- PostgreSQL
- npm

## Installation

```sh
git clone <repository-url>
cd instalite-backend
npm install
```

## Environment variables

Copy `.env.example` to `.env` and set a real connection string:

```sh
cp .env.example .env
```

| Variable        | Description                          | Example                                                              |
| --------------- | ------------------------------------ | -------------------------------------------------------------------- |
| `PORT`          | HTTP port (server log still says 3000 as specified) | `3000`                                                |
| `DATABASE_URL`  | PostgreSQL connection string         | `postgresql://USER:PASSWORD@localhost:5432/instalite?schema=public` |

Do not commit `.env`.

## Database setup and migrations

Create an empty database named `instalite`, then:

```sh
npx prisma generate
npx prisma migrate deploy
```

During local development you can also use:

```sh
npx prisma migrate dev
```

## Seeding

```sh
npm run seed
```

or

```sh
npx prisma db seed
```

The seed script wipes likes, posts and users, then inserts **12 users**, **24 posts** and **29 likes**. Running it multiple times does not create duplicates. IDs change after every seed; look users up by `username` and posts by the `insta##` segment of `imageUrl`.

## Start the server

```sh
npm start
```

Console output:

```txt
Server started on port 3000
```

Health check:

```sh
curl -i localhost:3000/health
```

Expected: `200` and `{ "status": "OK" }`.

## API reference

### Health

| Method | Path       | Success |
| ------ | ---------- | ------- |
| `GET`  | `/health`  | `200` `{ "status": "OK" }` |

### Users

| Method   | Path                         | Success |
| -------- | ---------------------------- | ------- |
| `POST`   | `/users`                     | `201` created user |
| `GET`    | `/users`                     | `200` `{ data, meta }` |
| `GET`    | `/users/:id`                 | `200` user with `_count.posts` and `_count.likes` |
| `PATCH`  | `/users/:id`                 | `200` updated user |
| `DELETE` | `/users/:id`                 | `204` empty |
| `GET`    | `/users/:id/posts`           | `200` `{ data, meta }` |
| `GET`    | `/users/:id/liked-posts`     | `200` `{ data, meta }` |

`POST /users` accepts `username`, `email`, `fullname` (required) and `bio` (optional). Extra fields such as `id` are ignored.

`PATCH /users/:id` may change `fullname`, `bio` and `isPrivate`. `username` and `email` are ignored.

### Posts

| Method   | Path                          | Success |
| -------- | ----------------------------- | ------- |
| `POST`   | `/posts`                      | `201` created post |
| `GET`    | `/posts`                      | `200` `{ data, meta }` with `author` and `_count.likes` |
| `GET`    | `/posts/:id`                  | `200` post with `author` and `_count.likes` |
| `PATCH`  | `/posts/:id`                  | `200` updated post |
| `DELETE` | `/posts/:id`                  | `204` empty |
| `GET`    | `/posts/:id/likes`            | `200` array of user summaries |
| `POST`   | `/posts/:id/likes`            | `201` `{ userId, postId, createdAt }` |
| `DELETE` | `/posts/:id/likes/:userId`    | `204` empty |

`POST /posts` requires `imageUrl` and `authorId`. `caption` and `location` are optional.

`PATCH /posts/:id` may change `caption` and `location`. `imageUrl` and `authorId` are ignored.

### Query parameters

Shared pagination (`GET /users`, `GET /posts`, `GET /users/:id/posts`, `GET /users/:id/liked-posts`):

| Param   | Default | Rules |
| ------- | ------- | ----- |
| `page`  | `1`     | Positive integer |
| `limit` | `10`    | Positive integer; values above `50` are capped at `50` |

Users (`GET /users`):

| Param       | Default     | Allowed |
| ----------- | ----------- | ------- |
| `sortBy`    | `createdAt` | `createdAt`, `username`, `fullname` |
| `order`     | `desc`      | `asc`, `desc` |
| `isPrivate` | —           | `true`, `false` |
| `search`    | —           | Case-insensitive match on username or fullname |
| `hasPosts`  | —           | `true` (at least one post), `false` (none) |

Posts (`GET /posts`):

| Param      | Default     | Allowed |
| ---------- | ----------- | ------- |
| `sortBy`   | `createdAt` | `createdAt`, `updatedAt`, `likes` |
| `order`    | `desc`      | `asc`, `desc` |
| `location` | —           | Case-insensitive exact match |
| `search`   | —           | Case-insensitive caption contains |
| `from`     | —           | Inclusive `createdAt` lower bound |
| `to`       | —           | Exclusive `createdAt` upper bound |

`sortBy=likes` sorts by like count. Ties are broken by newer `createdAt` first.

`meta.total` is the filtered total, not the page size. `meta.totalPages` is `ceil(total / limit)`, or `0` when `total` is `0`. A page past the last page returns `data: []` with a correct `meta.total`.

### Example curl requests

```sh
# Create a user
curl -i -X POST localhost:3000/users -H "Content-Type: application/json" \
  -d '{"username":"riya_travels","email":"riya@example.com","fullname":"Riya Sharma"}'

# Paginated public users whose name contains "sh"
curl -s "localhost:3000/users?search=SH&isPrivate=false&sortBy=fullname&order=asc&limit=2"

# Posts in Goa (matches both "Goa" and "goa"), sorted by likes
curl -s "localhost:3000/posts?location=GOA&sortBy=likes"

# March 2026 posts
curl -s "localhost:3000/posts?from=2026-03-01&to=2026-04-01"

# Like a post
curl -i -X POST localhost:3000/posts/<POST_ID>/likes -H "Content-Type: application/json" \
  -d '{"userId":<USER_ID>}'

# Unlike
curl -i -X DELETE localhost:3000/posts/<POST_ID>/likes/<USER_ID>
```

### Error responses

```json
{ "error": "username, email and fullname are required" }
```

```json
{ "error": "username or email already taken" }
```

```json
{ "error": "User not found" }
```

```json
{ "error": "Post not found" }
```

```json
{ "error": "imageUrl and authorId are required" }
```

```json
{ "error": "page and limit must be positive integers" }
```

```json
{ "error": "sortBy must be one of: createdAt, username, fullname" }
```

```json
{ "error": "sortBy must be one of: createdAt, updatedAt, likes" }
```

```json
{ "error": "order must be asc or desc" }
```

```json
{ "error": "isPrivate must be true or false" }
```

```json
{ "error": "hasPosts must be true or false" }
```

```json
{ "error": "from and to must be valid dates" }
```

```json
{ "error": "userId is required" }
```

```json
{ "error": "Already liked" }
```

```json
{ "error": "Like not found" }
```

| Situation | Status |
| --------- | ------ |
| Validation | `400` |
| Missing resource | `404` |
| Duplicate username/email or duplicate like | `409` |

Deleting a user cascades to their posts and to likes on those posts (and likes they made).

## Testing

```sh
npm run seed
npm test
```

The suite hits the Express app with Supertest, resolves IDs from the database (never hardcodes them), and re-seeds before tests that mutate the dataset.

Also useful:

```sh
npx prisma validate
npx prisma generate
```

## Database models

- **User** `1 — n` **Post** via `Post.authorId` (`onDelete: Cascade`, index on `authorId`)
- **User** `n — n` **Post** via explicit **Like** (`@@id([userId, postId])`, index on `postId`, cascade from both sides)
