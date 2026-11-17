const likesService = require("../services/likes.service");

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function list(req, res) {
  const postId = parseId(req.params.id);
  if (!postId) {
    return res.status(404).json({ error: "Post not found" });
  }

  const likes = await likesService.listLikesForPost(postId);
  if (!likes) {
    return res.status(404).json({ error: "Post not found" });
  }

  return res.status(200).json(likes);
}

async function create(req, res) {
  const postId = parseId(req.params.id);
  if (!postId) {
    return res.status(404).json({ error: "Post not found" });
  }

  const userIdRaw = req.body?.userId;
  if (userIdRaw === undefined || userIdRaw === null || userIdRaw === "") {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    const like = await likesService.likePost(postId, Number(userIdRaw));
    return res.status(201).json(like);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    throw error;
  }
}

async function remove(req, res) {
  const postId = parseId(req.params.id);
  const userId = parseId(req.params.userId);

  if (!postId || !userId) {
    return res.status(404).json({ error: "Like not found" });
  }

  const deleted = await likesService.unlikePost(postId, userId);
  if (!deleted) {
    return res.status(404).json({ error: "Like not found" });
  }

  return res.status(204).send();
}

module.exports = {
  list,
  create,
  remove,
};
