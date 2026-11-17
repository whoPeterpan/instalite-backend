const usersService = require("../services/users.service");
const { parsePagination, buildMeta } = require("../utils/pagination");

const USER_SORT_FIELDS = new Set(["createdAt", "username", "fullname"]);

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function create(req, res) {
  const { username, email, fullname, bio } = req.body ?? {};

  if (!username || !email || !fullname) {
    return res.status(400).json({ error: "username, email and fullname are required" });
  }

  try {
    const user = await usersService.createUser({ username, email, fullname, bio });
    return res.status(201).json(user);
  } catch (error) {
    if (error.status === 409) {
      return res.status(409).json({ error: error.message });
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

  if (!USER_SORT_FIELDS.has(sortBy)) {
    return res.status(400).json({ error: "sortBy must be one of: createdAt, username, fullname" });
  }

  if (order !== "asc" && order !== "desc") {
    return res.status(400).json({ error: "order must be asc or desc" });
  }

  let isPrivate;
  if (req.query.isPrivate !== undefined) {
    if (req.query.isPrivate !== "true" && req.query.isPrivate !== "false") {
      return res.status(400).json({ error: "isPrivate must be true or false" });
    }
    isPrivate = req.query.isPrivate === "true";
  }

  let hasPosts;
  if (req.query.hasPosts !== undefined) {
    if (req.query.hasPosts !== "true" && req.query.hasPosts !== "false") {
      return res.status(400).json({ error: "hasPosts must be true or false" });
    }
    hasPosts = req.query.hasPosts === "true";
  }

  const { data, total } = await usersService.listUsers({
    page: pagination.page,
    limit: pagination.limit,
    sortBy,
    order,
    isPrivate,
    search: req.query.search,
    hasPosts,
  });

  return res.status(200).json({
    data,
    meta: buildMeta(pagination.page, pagination.limit, total),
  });
}

async function getOne(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(404).json({ error: "User not found" });
  }

  const user = await usersService.getUserById(id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.status(200).json(user);
}

async function update(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(404).json({ error: "User not found" });
  }

  const { fullname, bio, isPrivate } = req.body ?? {};
  const user = await usersService.updateUser(id, { fullname, bio, isPrivate });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.status(200).json(user);
}

async function remove(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(404).json({ error: "User not found" });
  }

  const deleted = await usersService.deleteUser(id);
  if (!deleted) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.status(204).send();
}

async function listPosts(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(404).json({ error: "User not found" });
  }

  const pagination = parsePagination(req.query);
  if (pagination.error) {
    return res.status(400).json({ error: pagination.error });
  }

  const result = await usersService.listUserPosts(id, pagination);
  if (!result) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.status(200).json({
    data: result.data,
    meta: buildMeta(pagination.page, pagination.limit, result.total),
  });
}

async function listLikedPosts(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(404).json({ error: "User not found" });
  }

  const pagination = parsePagination(req.query);
  if (pagination.error) {
    return res.status(400).json({ error: pagination.error });
  }

  const result = await usersService.listLikedPosts(id, pagination);
  if (!result) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.status(200).json({
    data: result.data,
    meta: buildMeta(pagination.page, pagination.limit, result.total),
  });
}

module.exports = {
  create,
  list,
  getOne,
  update,
  remove,
  listPosts,
  listLikedPosts,
};
