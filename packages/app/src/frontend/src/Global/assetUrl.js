export const getAssetUrl = (value) => {
  if (!value) return "";

  const source = String(value);

  if (
    source.startsWith("app-file://") ||
    source.startsWith("data:") ||
    source.startsWith("http://") ||
    source.startsWith("https://")
  ) {
    return source;
  }

  return `app-file://local/${encodeURIComponent(source)}`;
};
