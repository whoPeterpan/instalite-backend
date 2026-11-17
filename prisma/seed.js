const prisma = require("../src/db");
const { users, posts, likes } = require("./seed-data");

async function main() {
  await prisma.like.deleteMany();
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();

  const createdUsers = await prisma.user.createManyAndReturn({ data: users });
  const userIdByUsername = new Map(createdUsers.map((user) => [user.username, user.id]));

  const postRows = posts.map(({ author, ...post }) => ({
    ...post,
    authorId: userIdByUsername.get(author),
  }));

  const createdPosts = await prisma.post.createManyAndReturn({ data: postRows });
  const postIdByKey = new Map(
    createdPosts.map((post) => [post.imageUrl.split("/")[4], post.id])
  );

  const likeRows = likes.map((like) => ({
    userId: userIdByUsername.get(like.user),
    postId: postIdByKey.get(like.post),
  }));

  const createdLikes = await prisma.like.createManyAndReturn({ data: likeRows });

  console.log(
    `🌱 Seeded ${createdUsers.length} users, ${createdPosts.length} posts and ${createdLikes.length} likes`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
