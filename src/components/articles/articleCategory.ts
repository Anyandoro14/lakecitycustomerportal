export const getCategoryLabel = (category?: string | null) => {
  const c = (category || "").toLowerCase();
  if (c === "welcome") return "Welcome";
  if (c === "newsletter") return "Newsletter";
  if (c.includes("feature")) return "New Feature";
  if (c === "update") return "Portal Update";
  return "Announcement";
};
