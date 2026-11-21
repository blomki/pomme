/** Adresse du site public, sans « https:// » : « pomme.example.org/hommesdeterre ». */
export function siteAddress(slug: string): string {
  return `${new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").host}/${slug}`;
}
