const prisma = require("../db");

const USER_SUMMARY = {
  id: true,
  username: true,
  fullname: true,
};

const postWithAuthorAndLikes = {
  include: {
    author: { select: USER_SUMMARY },
    _count: { select: { likes: true } },
  },
};

function buildPostWhere({ location, search, from, to, authorId }) {
  const where = {};

  if (authorId !== undefined) {
    where.authorId = authorId;
  }

  if (location) {
    where.location = { equals: location, mode: "insensitive" };
  }

  if (search) {
    where.caption = { contains: search, mode: "insensitive" };
  }

  if (from || to) {
    where.createdAt = {};
    if (from) {
      where.createdAt.gte = from;
    }
    if (to) {
      where.createdAt.lt = to;
    }
  }

  return where;
}

function buildPostOrderBy(sortBy, order) {
  if (sortBy === "likes") {
    return [{ likes: { _count: order } }, { createdAt: "desc" }];
  }

  return { [sortBy]: order };
}

async function createPost(data) {
  try {
    return await prisma.post.create({
      data: {
        imageUrl: data.imageUrl,
        authorId: data.authorId,
        caption: data.caption ?? null,
        location: data.location ?? null,
      },
    });
  } catch (error) {
    if (error.code === "P2003") {
      const notFound = new Error("User not found");
      notFound.status = 404;
      throw notFound;
    }
    throw error;
  }
}

async function listPosts({ page, limit, sortBy, order, location, search, from, to }) {
  const where = buildPostWhere({ location, search, from, to });
  const skip = (page - 1) * limit;

  const [data, total] = await prisma.$transaction([
    prisma.post.findMany({
      where,
      skip,
      take: limit,
      orderBy: buildPostOrderBy(sortBy, order),
      ...postWithAuthorAndLikes,
    }),
    prisma.post.count({ where }),
  ]);

  return { data, total };
}

async function getPostById(id) {
  return prisma.post.findUnique({
    where: { id },
    ...postWithAuthorAndLikes,
  });
}

async function updatePost(id, data) {
  try {
    return await prisma.post.update({
      where: { id },
      data: {
        ...(data.caption !== undefined && { caption: data.caption }),
        ...(data.location !== undefined && { location: data.location }),
      },
    });
  } catch (error) {
    if (error.code === "P2025") {
      return null;
    }
    throw error;
  }
}

async function deletePost(id) {
  try {
    await prisma.post.delete({ where: { id } });
    return true;
  } catch (error) {
    if (error.code === "P2025") {
      return false;
    }
    throw error;
  }
}

async function postExists(id) {
  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true },
  });
  return Boolean(post);
}

module.exports = {
  createPost,
  listPosts,
  getPostById,
  updatePost,
  deletePost,
  postExists,
};
