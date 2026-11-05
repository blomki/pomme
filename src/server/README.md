# server/ — code exécuté uniquement sur le serveur

Server Actions (écriture), lecture des données pour les Server Components, contrôle des rôles
(`requireRole`), envoi des emails. Fait le lien entre `domain/` (les règles) et `db/` (la base).

Chaque entrée est validée avec Zod ; chaque Server Action a un test d'accès autorisé et un test
d'accès refusé.
