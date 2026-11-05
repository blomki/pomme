import type { Database } from "@/db/client";
import { amap, amapRole, user } from "@/db/schema";
import type { AmapRoleName } from "@/domain/roles";
import { uuidv7 } from "@/db/uuid";

/** Crée des données de test avec la connexion propriétaire (sans RLS). */
export function fixtures(owner: Database) {
  let counter = 0;
  return {
    async createUser(overrides: Partial<typeof user.$inferInsert> = {}) {
      counter += 1;
      const [row] = await owner
        .insert(user)
        .values({
          id: uuidv7(),
          email: `personne${counter}@example.org`,
          firstName: "Prénom",
          lastName: `Nom${counter}`,
          ...overrides,
        })
        .returning();
      if (!row) throw new Error("Utilisateur non créé.");
      return row;
    },
    async createAmap(slug: string) {
      const [row] = await owner
        .insert(amap)
        .values({ id: uuidv7(), slug, name: `AMAP ${slug}` })
        .returning();
      if (!row) throw new Error("AMAP non créée.");
      return row;
    },
    async grantRole(amapId: string, userId: string, role: AmapRoleName) {
      await owner.insert(amapRole).values({ id: uuidv7(), amapId, userId, role });
    },
  };
}
