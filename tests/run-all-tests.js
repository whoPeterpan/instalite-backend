const request = require("supertest");
const { execSync } = require("child_process");
const app = require("../src/index");
const prisma = require("../src/db");

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function instaKey(post) {
  return post.imageUrl.split("/")[4];
}

async function run(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed += 1;
    failures.push({ name, error });
    console.error(`FAIL  ${name}`);
    console.error(`      ${error.message}`);
  }
}

function seed() {
  execSync("npx prisma db seed", { stdio: "pipe", cwd: `${__dirname}/..` });
}

async function ids() {
  const users = await prisma.user.findMany();
  const posts = await prisma.post.findMany();
  const byUsername = Object.fromEntries(users.map((user) => [user.username, user]));
  const byInsta = Object.fromEntries(posts.map((post) => [instaKey(post), post]));
  return { byUsername, byInsta };
}

async function main() {
  seed();

  await run("GET /health", async () => {
    const res = await request(app).get("/health");
    assert(res.status === 200, `expected 200, got ${res.status}`);
    assert(res.body.status === "OK", "health body");
    assert(res.headers["content-type"].includes("application/json"), "json content type");
  });

  await run("database connectivity", async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  await run("seed is repeatable", async () => {
    seed();
    seed();
    const users = await prisma.user.count();
    const posts = await prisma.post.count();
    const likes = await prisma.like.count();
    assert(users === 12, `users ${users}`);
    assert(posts === 24, `posts ${posts}`);
    assert(likes === 29, `likes ${likes}`);
  });

  await run("GET /users pagination defaults", async () => {
    const res = await request(app).get("/users");
    assert(res.status === 200, `status ${res.status}`);
    const names = res.body.data.map((u) => u.username);
    assert(names.length === 10, `length ${names.length}`);
    assert(names[0] === "dev_shoots" && names[1] === "isha_dances" && names[2] === "aditya_codes", names.join(","));
    assert(names[9] === "meera.eats", names.join(","));
    assert(JSON.stringify(res.body.meta) === JSON.stringify({ page: 1, limit: 10, total: 12, totalPages: 2 }), JSON.stringify(res.body.meta));
  });

  await run("GET /users page 2", async () => {
    const res = await request(app).get("/users?page=2");
    const names = res.body.data.map((u) => u.username);
    assert(names.join(",") === "arjun_clicks,riya_travels", names.join(","));
    assert(res.body.meta.page === 2 && res.body.meta.total === 12 && res.body.meta.totalPages === 2, JSON.stringify(res.body.meta));
  });

  await run("GET /users page 3 limit 5", async () => {
    const res = await request(app).get("/users?page=3&limit=5");
    const names = res.body.data.map((u) => u.username);
    assert(names.join(",") === "arjun_clicks,riya_travels", names.join(","));
    assert(JSON.stringify(res.body.meta) === JSON.stringify({ page: 3, limit: 5, total: 12, totalPages: 3 }), JSON.stringify(res.body.meta));
  });

  await run("GET /users limit cap 50", async () => {
    const res = await request(app).get("/users?limit=100");
    assert(res.body.data.length === 12, String(res.body.data.length));
    assert(res.body.meta.limit === 50 && res.body.meta.totalPages === 1, JSON.stringify(res.body.meta));
  });

  await run("GET /users beyond last page", async () => {
    const res = await request(app).get("/users?page=5");
    assert(res.status === 200 && res.body.data.length === 0, "empty page");
    assert(res.body.meta.total === 12 && res.body.meta.totalPages === 2, JSON.stringify(res.body.meta));
  });

  await run("GET /users invalid pagination", async () => {
    for (const qs of ["page=0", "limit=abc", "page=1.5"]) {
      const res = await request(app).get(`/users?${qs}`);
      assert(res.status === 400, `${qs} status ${res.status}`);
      assert(res.body.error === "page and limit must be positive integers", JSON.stringify(res.body));
    }
  });

  await run("GET /users sorting", async () => {
    const a = await request(app).get("/users?sortBy=username&order=asc");
    const namesA = a.body.data.map((u) => u.username);
    assert(namesA[0] === "aditya_codes" && namesA[1] === "ananya_reads" && namesA[2] === "arjun_clicks", namesA.slice(0, 3).join(","));
    assert(a.body.meta.total === 12 && a.body.meta.totalPages === 2, JSON.stringify(a.body.meta));

    const b = await request(app).get("/users?sortBy=fullname&order=desc&limit=3");
    assert(b.body.data.map((u) => u.username).join(",") === "vikram.trek,sara_sketches,rohan_runs", b.body.data.map((u) => u.username).join(","));
    assert(b.body.meta.total === 12 && b.body.meta.totalPages === 4, JSON.stringify(b.body.meta));

    const c = await request(app).get("/users?order=asc&limit=2");
    assert(c.body.data.map((u) => u.username).join(",") === "riya_travels,arjun_clicks", c.body.data.map((u) => u.username).join(","));

    const d = await request(app).get("/users?sortBy=email");
    assert(d.status === 400 && d.body.error === "sortBy must be one of: createdAt, username, fullname", JSON.stringify(d.body));

    const e = await request(app).get("/users?order=sideways");
    assert(e.status === 400 && e.body.error === "order must be asc or desc", JSON.stringify(e.body));
  });

  await run("GET /users filters", async () => {
    const a = await request(app).get("/users?isPrivate=true");
    assert(a.body.data.map((u) => u.username).join(",") === "dev_shoots,neha_designs,ananya_reads,meera.eats", a.body.data.map((u) => u.username).join(","));
    assert(a.body.meta.total === 4 && a.body.meta.totalPages === 1, JSON.stringify(a.body.meta));

    const b = await request(app).get("/users?isPrivate=false");
    assert(b.body.data.length === 8 && b.body.data[0].username === "isha_dances" && b.body.data[1].username === "aditya_codes", b.body.data.map((u) => u.username).join(","));
    assert(b.body.meta.total === 8, JSON.stringify(b.body.meta));

    const c = await request(app).get("/users?search=sh");
    assert(c.body.data.map((u) => u.username).join(",") === "dev_shoots,isha_dances,riya_travels", c.body.data.map((u) => u.username).join(","));

    const d = await request(app).get("/users?search=SH&isPrivate=false&sortBy=fullname&order=asc&limit=2");
    assert(d.body.data.map((u) => u.username).join(",") === "isha_dances,riya_travels", d.body.data.map((u) => u.username).join(","));
    assert(d.body.meta.total === 2 && d.body.meta.totalPages === 1, JSON.stringify(d.body.meta));

    const e = await request(app).get("/users?search=zzz");
    assert(e.body.data.length === 0 && e.body.meta.total === 0 && e.body.meta.totalPages === 0, JSON.stringify(e.body));

    const f = await request(app).get("/users?isPrivate=maybe");
    assert(f.status === 400 && f.body.error === "isPrivate must be true or false", JSON.stringify(f.body));
  });

  await run("GET /posts pagination and sorting", async () => {
    const a = await request(app).get("/posts");
    const keysA = a.body.data.map(instaKey);
    assert(keysA.length === 10 && keysA[0] === "insta24" && keysA[9] === "insta15", keysA.join(","));
    assert(JSON.stringify(a.body.meta) === JSON.stringify({ page: 1, limit: 10, total: 24, totalPages: 3 }), JSON.stringify(a.body.meta));
    assert(a.body.data[0].author.username === "dev_shoots", "author present");
    assert(a.body.data[0]._count.likes === 6, "likes count");
    assert(a.body.data[0].author.email === undefined, "no nested email");

    const b = await request(app).get("/posts?page=3");
    assert(b.body.data.map(instaKey).join(",") === "insta04,insta03,insta02,insta01", b.body.data.map(instaKey).join(","));

    const c = await request(app).get("/posts?page=4");
    assert(c.body.data.length === 0 && c.body.meta.total === 24 && c.body.meta.totalPages === 3, JSON.stringify(c.body.meta));

    const d = await request(app).get("/posts?order=asc&limit=3");
    assert(d.body.data.map(instaKey).join(",") === "insta01,insta02,insta03", d.body.data.map(instaKey).join(","));
    assert(d.body.meta.totalPages === 8, JSON.stringify(d.body.meta));

    const e = await request(app).get("/posts?limit=0");
    assert(e.status === 400 && e.body.error === "page and limit must be positive integers", JSON.stringify(e.body));

    const f = await request(app).get("/posts?sortBy=caption");
    assert(f.status === 400 && f.body.error === "sortBy must be one of: createdAt, updatedAt, likes", JSON.stringify(f.body));

    const g = await request(app).get("/posts?order=up");
    assert(g.status === 400 && g.body.error === "order must be asc or desc", JSON.stringify(g.body));
  });

  await run("GET /posts filters", async () => {
    const a = await request(app).get("/posts?location=GOA");
    assert(a.body.data.map(instaKey).join(",") === "insta23,insta16,insta10,insta01", a.body.data.map(instaKey).join(","));
    assert(a.body.meta.total === 4, JSON.stringify(a.body.meta));

    const b = await request(app).get("/posts?search=sunset");
    assert(b.body.data.map(instaKey).join(",") === "insta20,insta08,insta01", b.body.data.map(instaKey).join(","));

    const c = await request(app).get("/posts?from=2026-03-01&to=2026-04-01");
    const keysC = c.body.data.map(instaKey);
    assert(keysC.length === 8 && keysC[0] === "insta16" && keysC[7] === "insta09", keysC.join(","));
    assert(c.body.meta.total === 8, JSON.stringify(c.body.meta));

    const d = await request(app).get("/posts?from=2026-04-01");
    const keysD = d.body.data.map(instaKey);
    assert(keysD.length === 8 && keysD[0] === "insta24" && keysD[7] === "insta17", keysD.join(","));

    const e = await request(app).get("/posts?location=pune&search=CHAI");
    assert(e.body.data.map(instaKey).join(",") === "insta15", e.body.data.map(instaKey).join(","));

    const f = await request(app).get("/posts?location=mumbai&limit=2&page=2");
    assert(f.body.data.map(instaKey).join(",") === "insta06,insta02", f.body.data.map(instaKey).join(","));
    assert(f.body.meta.total === 4 && f.body.meta.totalPages === 2, JSON.stringify(f.body.meta));

    const g = await request(app).get("/posts?from=yesterday");
    assert(g.status === 400 && g.body.error === "from and to must be valid dates", JSON.stringify(g.body));
  });

  await run("GET /posts sortBy likes", async () => {
    const a = await request(app).get("/posts?limit=2");
    assert(a.body.data.map(instaKey).join(",") === "insta24,insta23", a.body.data.map(instaKey).join(","));
    assert(a.body.data[0].author.username === "dev_shoots" && a.body.data[0]._count.likes === 6, "insta24");
    assert(a.body.data[1].author.username === "riya_travels" && a.body.data[1]._count.likes === 0, "insta23");

    const b = await request(app).get("/posts?sortBy=likes&limit=5");
    assert(b.body.data.map(instaKey).join(",") === "insta24,insta01,insta15,insta10,insta08", b.body.data.map(instaKey).join(","));

    const c = await request(app).get("/posts?sortBy=likes&order=asc&limit=3");
    assert(c.body.data.map(instaKey).join(",") === "insta23,insta21,insta19", c.body.data.map(instaKey).join(","));

    const d = await request(app).get("/posts?location=goa&sortBy=likes");
    assert(d.body.data.map(instaKey).join(",") === "insta01,insta10,insta23,insta16", d.body.data.map(instaKey).join(","));
    assert(d.body.meta.total === 4, JSON.stringify(d.body.meta));

    const e = await request(app).get("/posts?sortBy=comments");
    assert(e.status === 400 && e.body.error === "sortBy must be one of: createdAt, updatedAt, likes", JSON.stringify(e.body));
  });

  await run("GET /posts/:id author and likes", async () => {
    const { byInsta } = await ids();
    const a = await request(app).get(`/posts/${byInsta.insta01.id}`);
    assert(a.status === 200 && a.body.author.username === "riya_travels" && a.body._count.likes === 5, JSON.stringify(a.body.author));
    assert(a.body.author.email === undefined, "email leaked");

    const b = await request(app).get(`/posts/${byInsta.insta24.id}`);
    assert(b.body.author.username === "dev_shoots" && b.body._count.likes === 6, JSON.stringify(b.body));

    const c = await request(app).get(`/posts/${byInsta.insta05.id}`);
    assert(c.body.author.username === "arjun_clicks" && c.body._count.likes === 0, JSON.stringify(c.body));

    const d = await request(app).get("/posts/999999");
    assert(d.status === 404 && d.body.error === "Post not found", JSON.stringify(d.body));
  });

  await run("GET /users/:id counts and hasPosts", async () => {
    const { byUsername } = await ids();
    const a = await request(app).get(`/users/${byUsername.riya_travels.id}`);
    assert(a.body.username === "riya_travels" && a.body._count.posts === 7 && a.body._count.likes === 4, JSON.stringify(a.body._count));

    const b = await request(app).get(`/users/${byUsername.dev_shoots.id}`);
    assert(b.body._count.posts === 2 && b.body._count.likes === 1, JSON.stringify(b.body._count));

    const c = await request(app).get(`/users/${byUsername.aditya_codes.id}`);
    assert(c.body._count.posts === 0 && c.body._count.likes === 2, JSON.stringify(c.body._count));

    const d = await request(app).get("/users?hasPosts=false");
    assert(d.body.data.map((u) => u.username).join(",") === "aditya_codes,neha_designs", d.body.data.map((u) => u.username).join(","));
    assert(d.body.meta.total === 2, JSON.stringify(d.body.meta));

    const e = await request(app).get("/users?hasPosts=true");
    assert(e.body.meta.total === 10, JSON.stringify(e.body.meta));

    const f = await request(app).get("/users?hasPosts=true&isPrivate=true");
    assert(f.body.data.map((u) => u.username).join(",") === "dev_shoots,ananya_reads,meera.eats", f.body.data.map((u) => u.username).join(","));
    assert(f.body.meta.total === 3, JSON.stringify(f.body.meta));

    const g = await request(app).get("/users?hasPosts=yes");
    assert(g.status === 400 && g.body.error === "hasPosts must be true or false", JSON.stringify(g.body));
  });

  await run("GET /users/:id/posts", async () => {
    const { byUsername } = await ids();
    const a = await request(app).get(`/users/${byUsername.riya_travels.id}/posts?limit=3`);
    assert(a.body.data.map(instaKey).join(",") === "insta23,insta19,insta16", a.body.data.map(instaKey).join(","));
    assert(JSON.stringify(a.body.meta) === JSON.stringify({ page: 1, limit: 3, total: 7, totalPages: 3 }), JSON.stringify(a.body.meta));

    const b = await request(app).get(`/users/${byUsername.riya_travels.id}/posts?limit=3&page=3`);
    assert(b.body.data.map(instaKey).join(",") === "insta01", b.body.data.map(instaKey).join(","));

    const c = await request(app).get(`/users/${byUsername.aditya_codes.id}/posts`);
    assert(c.body.data.length === 0 && c.body.meta.total === 0 && c.body.meta.totalPages === 0, JSON.stringify(c.body.meta));

    const d = await request(app).get("/users/999999/posts");
    assert(d.status === 404 && d.body.error === "User not found", JSON.stringify(d.body));

    const e = await request(app).get(`/users/${byUsername.riya_travels.id}/posts?page=0`);
    assert(e.status === 400 && e.body.error === "page and limit must be positive integers", JSON.stringify(e.body));
  });

  await run("GET /posts/:id/likes", async () => {
    const { byInsta } = await ids();
    const a = await request(app).get(`/posts/${byInsta.insta01.id}/likes`);
    assert(a.body.map((u) => u.username).join(",") === "arjun_clicks,isha_dances,meera.eats,neha_designs,vikram.trek", a.body.map((u) => u.username).join(","));
    assert(a.body.every((u) => u.email === undefined), "email leaked");

    const b = await request(app).get(`/posts/${byInsta.insta24.id}/likes`);
    assert(b.body.map((u) => u.username).join(",") === "aditya_codes,arjun_clicks,riya_travels,rohan_runs,sara_sketches,vikram.trek", b.body.map((u) => u.username).join(","));

    const c = await request(app).get(`/posts/${byInsta.insta05.id}/likes`);
    assert(c.body.length === 0, JSON.stringify(c.body));

    const d = await request(app).get("/posts/999999/likes");
    assert(d.status === 404 && d.body.error === "Post not found", JSON.stringify(d.body));
  });

  await run("POST /posts with authorId", async () => {
    const { byUsername, byInsta } = await ids();
    const a = await request(app).post("/posts").send({
      imageUrl: "https://picsum.photos/seed/new01/600/600",
      caption: "First post!",
      authorId: byUsername.riya_travels.id,
    });
    assert(a.status === 201 && a.body.authorId === byUsername.riya_travels.id, JSON.stringify(a.body));

    const b = await request(app).post("/posts").send({ imageUrl: "https://picsum.photos/seed/new02/600/600" });
    assert(b.status === 400 && b.body.error === "imageUrl and authorId are required", JSON.stringify(b.body));

    const c = await request(app).post("/posts").send({
      imageUrl: "https://picsum.photos/seed/new03/600/600",
      authorId: 999999,
    });
    assert(c.status === 404 && c.body.error === "User not found", JSON.stringify(c.body));

    const d = await request(app).patch(`/posts/${byInsta.insta01.id}`).send({
      caption: "Baga, again 🌅",
      authorId: byUsername.arjun_clicks.id,
    });
    assert(d.status === 200 && d.body.caption === "Baga, again 🌅" && d.body.authorId === byUsername.riya_travels.id, JSON.stringify(d.body));
  });

  await run("like and unlike", async () => {
    seed();
    const { byUsername, byInsta } = await ids();
    const postId = byInsta.insta05.id;
    const userId = byUsername.riya_travels.id;

    const a = await request(app).post(`/posts/${postId}/likes`).send({ userId });
    assert(a.status === 201 && a.body.userId === userId && a.body.postId === postId && a.body.createdAt, JSON.stringify(a.body));

    const b = await request(app).post(`/posts/${postId}/likes`).send({ userId });
    assert(b.status === 409 && b.body.error === "Already liked", JSON.stringify(b.body));

    const c = await request(app).post(`/posts/${postId}/likes`).send({});
    assert(c.status === 400 && c.body.error === "userId is required", JSON.stringify(c.body));

    const d = await request(app).post("/posts/999999/likes").send({ userId });
    assert(d.status === 404 && d.body.error === "Post not found", JSON.stringify(d.body));

    const e = await request(app).post(`/posts/${postId}/likes`).send({ userId: 999999 });
    assert(e.status === 404 && e.body.error === "User not found", JSON.stringify(e.body));

    const f = await request(app).get(`/posts/${postId}`);
    assert(f.body._count.likes === 1, JSON.stringify(f.body._count));

    const g = await request(app).get(`/posts/${postId}/likes`);
    assert(g.body.map((u) => u.username).join(",") === "riya_travels", g.body.map((u) => u.username).join(","));

    const h = await request(app).delete(`/posts/${postId}/likes/${userId}`);
    assert(h.status === 204, `status ${h.status}`);

    const i = await request(app).delete(`/posts/${postId}/likes/${userId}`);
    assert(i.status === 404 && i.body.error === "Like not found", JSON.stringify(i.body));
  });

  await run("bonus GET /users/:id/liked-posts", async () => {
    seed();
    const { byUsername } = await ids();
    const a = await request(app).get(`/users/${byUsername.riya_travels.id}/liked-posts`);
    assert(a.body.data.map(instaKey).join(",") === "insta24,insta20,insta10,insta03", a.body.data.map(instaKey).join(","));
    assert(a.body.meta.total === 4 && a.body.meta.totalPages === 1, JSON.stringify(a.body.meta));
    assert(a.body.data[0].author && a.body.data[0]._count.likes, "nested author/count");
    assert(a.body.data[0].author.email === undefined, "email leaked");

    const b = await request(app).get(`/users/${byUsername.arjun_clicks.id}/liked-posts?limit=2`);
    assert(b.body.data.map(instaKey).join(",") === "insta24,insta14", b.body.data.map(instaKey).join(","));
    assert(b.body.meta.total === 4 && b.body.meta.totalPages === 2, JSON.stringify(b.body.meta));

    const c = await request(app).get(`/users/${byUsername.neha_designs.id}/liked-posts`);
    assert(c.body.data.map(instaKey).join(",") === "insta22,insta15,insta01", c.body.data.map(instaKey).join(","));
    assert(c.body.meta.total === 3, JSON.stringify(c.body.meta));

    const created = await request(app).post("/users").send({
      username: "new_tester",
      email: "new_tester@example.com",
      fullname: "New Tester",
    });
    const d = await request(app).get(`/users/${created.body.id}/liked-posts`);
    assert(d.body.data.length === 0 && d.body.meta.total === 0 && d.body.meta.totalPages === 0, JSON.stringify(d.body.meta));

    const e = await request(app).get("/users/999999/liked-posts");
    assert(e.status === 404 && e.body.error === "User not found", JSON.stringify(e.body));
  });

  await run("user CRUD validation and ignore extra fields", async () => {
    seed();
    const a = await request(app).post("/users").send({
      username: "sneaky",
      email: "sneaky@example.com",
      fullname: "Sneaky",
      id: 999,
    });
    assert(a.status === 201 && a.body.id !== 999 && a.body.username === "sneaky" && a.body.isPrivate === false && a.body.bio === null, JSON.stringify(a.body));

    const b = await request(app).post("/users").send({ username: "onlyname" });
    assert(b.status === 400 && b.body.error === "username, email and fullname are required", JSON.stringify(b.body));

    const c = await request(app).post("/users").send({
      username: "sneaky",
      email: "other@example.com",
      fullname: "Copy Cat",
    });
    assert(c.status === 409 && c.body.error === "username or email already taken", JSON.stringify(c.body));

    const patched = await request(app).patch(`/users/${a.body.id}`).send({
      fullname: "Updated",
      username: "hacked",
      email: "hacked@example.com",
    });
    assert(patched.status === 200 && patched.body.fullname === "Updated" && patched.body.username === "sneaky", JSON.stringify(patched.body));

    const missing = await request(app).get("/users/999999");
    assert(missing.status === 404 && missing.body.error === "User not found", JSON.stringify(missing.body));

    const del = await request(app).delete(`/users/${a.body.id}`);
    assert(del.status === 204, `status ${del.status}`);
  });

  await run("post CRUD update, delete and 404 handling", async () => {
    const { byUsername } = await ids();
    const created = await request(app).post("/posts").send({
      imageUrl: "https://picsum.photos/seed/temp999/600/600",
      caption: "Temporary post",
      location: "Bhopal",
      authorId: byUsername.arjun_clicks.id,
    });
    assert(created.status === 201, `create status ${created.status}`);
    const postId = created.body.id;

    const patched = await request(app).patch(`/posts/${postId}`).send({
      caption: "Updated caption",
      location: "Indore",
      imageUrl: "https://hacked.com/image.jpg",
    });
    assert(patched.status === 200, `patch status ${patched.status}`);
    assert(patched.body.caption === "Updated caption", "caption updated");
    assert(patched.body.location === "Indore", "location updated");
    assert(patched.body.imageUrl === "https://picsum.photos/seed/temp999/600/600", "imageUrl unchanged");

    const del = await request(app).delete(`/posts/${postId}`);
    assert(del.status === 204, `delete status ${del.status}`);

    const missing = await request(app).get(`/posts/${postId}`);
    assert(missing.status === 404 && missing.body.error === "Post not found", "post not found");

    const delMissing = await request(app).delete(`/posts/${postId}`);
    assert(delMissing.status === 404 && delMissing.body.error === "Post not found", "delete 404");
  });

  await run("cascade delete when riya leaves", async () => {
    seed();
    const { byUsername, byInsta } = await ids();
    const riyaId = byUsername.riya_travels.id;
    const arjunId = byUsername.arjun_clicks.id;
    const insta10Id = byInsta.insta10.id;
    const insta24Id = byInsta.insta24.id;

    const del = await request(app).delete(`/users/${riyaId}`);
    assert(del.status === 204, `delete status ${del.status}`);

    const a = await request(app).get("/users?limit=1");
    assert(a.body.meta.total === 11, JSON.stringify(a.body.meta));

    const b = await request(app).get("/posts?limit=1");
    assert(b.body.meta.total === 17, JSON.stringify(b.body.meta));

    const c = await request(app).get("/posts?location=goa");
    assert(c.body.data.map(instaKey).join(",") === "insta10", c.body.data.map(instaKey).join(","));

    const d = await request(app).get("/posts?sortBy=likes&limit=3");
    assert(d.body.data.map(instaKey).join(",") === "insta24,insta15,insta17", d.body.data.map(instaKey).join(","));
    assert(d.body.data[0]._count.likes === 5 && d.body.data[1]._count.likes === 3 && d.body.data[2]._count.likes === 2, JSON.stringify(d.body.data.map((p) => p._count)));

    const e = await request(app).get(`/posts/${insta10Id}/likes`);
    assert(e.body.map((u) => u.username).join(",") === "ananya_reads,kabir_sings", e.body.map((u) => u.username).join(","));

    const f = await request(app).get(`/posts/${insta24Id}/likes`);
    assert(f.body.map((u) => u.username).join(",") === "aditya_codes,arjun_clicks,rohan_runs,sara_sketches,vikram.trek", f.body.map((u) => u.username).join(","));

    const g = await request(app).get(`/users/${arjunId}`);
    assert(g.body._count.posts === 4 && g.body._count.likes === 2, JSON.stringify(g.body._count));

    const h = await request(app).get(`/users/${riyaId}/posts`);
    assert(h.status === 404 && h.body.error === "User not found", JSON.stringify(h.body));
  });

  seed();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
