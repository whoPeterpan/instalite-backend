const prisma = require("../db");

const USER_SUMMARY = {
  id: true,
  username: true,
  fullname: true,
};

function buildUserWhere({ isPrivate, search, hasPosts }) {
  const where = {};

  if (typeof isPrivate === "boolean") {
    where.isPrivate = isPrivate;
  }

  if (search) {
    where.OR = [
      { username: { contains: search, mode: "insensitive" } },
      { fullname: { contains: search, mode: "insensitive" } },
    ];
  }

  if (hasPosts === true) {
    where.posts = { some: {} };
  } else if (hasPosts === false) {
    where.posts = { none: {} };
  }

  return where;
}

async function createUser(data) {
  try {
    return await prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        fullname: data.fullname,
        bio: data.bio ?? null,
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      const conflict = new Error("username or email already taken");
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  }
}

async function listUsers({ page, limit, sortBy, order, isPrivate, search, hasPosts }) {
  const where = buildUserWhere({ isPrivate, search, hasPosts });
  const skip = (page - 1) * limit;

  const [data, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: order },
    }),
    prisma.user.count({ where }),
  ]);

  return { data, total };
}

async function getUserById(id) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      _count: {
        select: { posts: true, likes: true },
      },
    },
  });
}

async function updateUser(id, data) {
  try {
    return await prisma.user.update({
      where: { id },
      data: {
        ...(data.fullname !== undefined && { fullname: data.fullname }),
        ...(data.bio !== undefined && { bio: data.bio }),
        ...(data.isPrivate !== undefined && { isPrivate: data.isPrivate }),
      },
    });
  } catch (error) {
    if (error.code === "P2025") {
      return null;
    }
    throw error;
  }
}

async function deleteUser(id) {
  try {
    await prisma.user.delete({ where: { id } });
    return true;
  } catch (error) {
    if (error.code === "P2025") {
      return false;
    }
    throw error;
  }
}

async function listUserPosts(userId, { page, limit }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    return null;
  }

  const where = { authorId: userId };
  const skip = (page - 1) * limit;

  const [data, total] = await prisma.$transaction([
    prisma.post.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { likes: true } },
      },
    }),
    prisma.post.count({ where }),
  ]);

  return { data, total };
}

async function listLikedPosts(userId, { page, limit }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    return null;
  }

  const where = { likes: { some: { userId } } };
  const skip = (page - 1) * limit;

  const [data, total] = await prisma.$transaction([
    prisma.post.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: USER_SUMMARY },
        _count: { select: { likes: true } },
      },
    }),
    prisma.post.count({ where }),
  ]);

  return { data, total };
}

module.exports = {
  createUser,
  listUsers,
  getUserById,
  updateUser,
  deleteUser,
  listUserPosts,
  listLikedPosts,
};
