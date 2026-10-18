// A unique file name for a new garment photo. The photo is stored at "<user id>/<this>.<ext>"
// (see photoPath in add.ts), and the upload never overwrites an existing file, so the name only
// has to be unlikely to repeat within one person's folder. Pure and injectable for tests.
export function newPhotoId(now: number = Date.now(), random: () => number = Math.random): string {
  const suffix = Math.floor(random() * 36 ** 8)
    .toString(36)
    .padStart(8, "0");
  return `${now.toString(36)}-${suffix}`;
}
