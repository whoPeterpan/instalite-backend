function isPositiveIntegerString(value) {
  return typeof value === "string" && /^\d+$/.test(value) && Number(value) > 0;
}

function parsePagination(query) {
  const { page: pageRaw, limit: limitRaw } = query;

  if (pageRaw !== undefined && !isPositiveIntegerString(String(pageRaw))) {
    return { error: "page and limit must be positive integers" };
  }

  if (limitRaw !== undefined && !isPositiveIntegerString(String(limitRaw))) {
    return { error: "page and limit must be positive integers" };
  }

  const page = pageRaw === undefined ? 1 : Number(pageRaw);
  let limit = limitRaw === undefined ? 10 : Number(limitRaw);

  if (limit > 50) {
    limit = 50;
  }

  return { page, limit };
}

function buildMeta(page, limit, total) {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

module.exports = { parsePagination, buildMeta };
