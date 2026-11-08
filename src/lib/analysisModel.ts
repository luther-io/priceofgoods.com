export function analysisModelName(model?: string): string {
  if (!model?.trim()) return "Model unavailable";
  const match = model.match(/^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?:-(\d{8}))?$/);
  if (!match) return model;
  const [, family, major, minor, snapshot] = match;
  const name = `${family[0].toUpperCase()}${family.slice(1)} ${major}${minor ? `.${minor}` : ""}`;
  return snapshot ? `${name} (${snapshot.slice(0, 4)}-${snapshot.slice(4, 6)}-${snapshot.slice(6)})` : name;
}
