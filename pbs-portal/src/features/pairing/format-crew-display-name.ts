/** Readable label for PBS crew names stored without spaces in pbs_user.user_name. */
const splitConcatenatedToken = (token: string): string =>
  token
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

export const formatCrewDisplayName = (name: string): string => {
  const trimmed = name.trim();

  if (!trimmed) {
    return trimmed;
  }

  return trimmed.split(/\s+/).map(splitConcatenatedToken).join(" ");
};
