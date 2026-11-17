const prisma = require("../db");

const USER_SUMMARY = {
  id: true,
  username: true,
  fullname: true,
};

async function listLikesForPost(postId) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true },
  });

  if (!post) {
    return null;
  }

  return prisma.user.findMany({
    where: { likes: { some: { postId } } },
    orderBy: { username: "asc" },
    select: USER_SUMMARY,
  });
}

async function likePost(postId, userId) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true },
  });

  if (!post) {
    const error = new Error("Post not found");
    error.status = 404;
    throw error;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }

  try {
    return await prisma.like.create({
      data: { userId, postId },
      select: { userId: true, postId: true, createdAt: true },
    });
  } catch (error) {
    if (error.code === "P2002") {
      const conflict = new Error("Already liked");
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  }
}

async function unlikePost(postId, userId) {
  try {
    await prisma.like.delete({
      where: {
        userId_postId: { userId, postId },
      },
    });
    return true;
  } catch (error) {
    if (error.code === "P2025") {
      return false;
    }
    throw error;
  }
}

module.exports = {
  listLikesForPost,
  likePost,
  unlikePost,
};
