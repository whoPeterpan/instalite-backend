const postsService = require("../services/posts.service");
const { parsePagination, buildMeta } = require("../utils/pagination");

const POST_SORT_FIELDS = new Set(["createdAt", "updatedAt", "likes"]);

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseDateParam(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

async function create(req, res) {
  const { imageUrl, authorId, caption, location } = req.body ?? {};

  if (!imageUrl || authorId === undefined || authorId === null || authorId === "") {
    return res.status(400).json({ error: "imageUrl and authorId are required" });
  }

  try {
    const post = await postsService.createPost({
      imageUrl,
      authorId: Number(authorId),
      caption,
      location,
    });
    return res.status(201).json(post);
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
    }
    throw error;
  }
}

async function list(req, res) {
  const pagination = parsePagination(req.query);
  if (pagination.error) {
    return res.status(400).json({ error: pagination.error });
  }

  const sortBy = req.query.sortBy ?? "createdAt";
  const order = req.query.order ?? "desc";

  if (!POST_SORT_FIELDS.has(sortBy)) {
    return res.status(400).json({ error: "sortBy must be one of: createdAt, updatedAt, likes" });
  }

  if (order !== "asc" && order !== "desc") {
    return res.status(400).json({ error: "order must be asc or desc" });
  }

  let from;
  let to;
  if (req.query.from !== undefined) {
    from = parseDateParam(req.query.from);
    if (!from) {
      return res.status(400).json({ error: "from and to must be valid dates" });
    }
  }
  if (req.query.to !== undefined) {
    to = parseDateParam(req.query.to);
    if (!to) {
      return res.status(400).json({ error: "from and to must be valid dates" });
    }
  }

  const { data, total } = await postsService.listPosts({
    page: pagination.page,
    limit: pagination.limit,
    sortBy,
    order,
    location: req.query.location,
    search: req.query.search,
    from,
    to,
  });

  return res.status(200).json({
    data,
    meta: buildMeta(pagination.page, pagination.limit, total),
  });
}

async function getOne(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(404).json({ error: "Post not found" });
  }

  const post = await postsService.getPostById(id);
  if (!post) {
    return res.status(404).json({ error: "Post not found" });
  }

  return res.status(200).json(post);
}

async function update(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(404).json({ error: "Post not found" });
  }

  const { caption, location } = req.body ?? {};
  const post = await postsService.updatePost(id, { caption, location });

  if (!post) {
    return res.status(404).json({ error: "Post not found" });
  }

  return res.status(200).json(post);
}

async function remove(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(404).json({ error: "Post not found" });
  }

  const deleted = await postsService.deletePost(id);
  if (!deleted) {
    return res.status(404).json({ error: "Post not found" });
  }

  return res.status(204).send();
}

module.exports = {
  create,
  list,
  getOne,
  update,
  remove,
};
