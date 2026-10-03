// The key a line or a name is filed under in the announcer's voice clips:
// lower case, plain apostrophes, no closing punctuation, so "KING SALMON!",
// "King Salmon" and "king salmon" find the same clip.
export function voiceKey(s) {
  return String(s)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[\s!?.]+$/, '')
    .trim();
}
