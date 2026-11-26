# 0047. Réinitialisation de la deuxième vérification par le gestionnaire de la plateforme

- Statut : accepté
- Date : 2026-11-26

## Contexte

Depuis S10 (ADR 0041), un **autre admin de l'AMAP** peut réinitialiser la deuxième vérification
d'un membre qui a perdu son téléphone. Mais une AMAP qui n'a qu'un seul admin reste bloquée si
c'est lui qui l'a perdu. Le cahier des charges prévoit que le **gestionnaire de la plateforme**
puisse alors le faire (story S10b, fiche #109). Deux obstacles :

- le gestionnaire n'est membre d'aucune AMAP : la Row Level Security lui cache leurs comptes ;
- le journal (`audit_log`) est rangé par AMAP, alors qu'un compte est unique sur toute la
  plateforme et peut appartenir à plusieurs AMAP, ou à aucune.

## Décision

1. **Écran « Comptes »** (`/plateforme/comptes`) : le gestionnaire saisit une adresse email,
   voit le nom, les AMAP de la personne (rôle, foyer, compte producteur) et si elle a une
   deuxième vérification, puis réinitialise après une confirmation. La recherche passe par une
   Server Action, pas par l'adresse de la page : l'email ne reste ni dans l'historique du
   navigateur ni dans les journaux du serveur.
2. **Deux fonctions de base** (migration 0046, `SECURITY DEFINER`, comme `create_amap` dans
   l'ADR 0031), qui vérifient elles-mêmes que la personne connectée est gestionnaire :
   - `platform_find_account(email)` ne renvoie que ce qui sert à reconnaître la personne (pas le
     téléphone) ;
   - `platform_reset_second_factor(user_id, audit_id)` refuse le compte d'un gestionnaire
     (le sien compris) et écrit la ligne du journal.

   L'application retire ensuite l'application d'authentification, les passkeys et les sessions
   avec la connexion de Better Auth (`clearSecondFactor`, ADR 0005), dans la même requête : si
   ce retrait échoue, la transaction est annulée, journal compris.

3. **Journal de la plateforme** : une table `platform_audit_log`, sans `amap_id`. Lecture
   réservée aux gestionnaires ; aucune politique d'écriture : seules les fonctions de base y
   écrivent. Rien n'est inscrit dans le journal des AMAP.
4. **Deuxième vérification de la session** exigée par la mise en page de `/plateforme` et par
   chaque action (la base ne peut pas la connaître).

## Pourquoi

- **Journal de la plateforme plutôt que celui de chaque AMAP** : le gestionnaire n'agit pas au
  nom d'une AMAP ; une personne sans rôle ni foyer (compte tout juste créé) n'aurait laissé
  aucune trace ; et une seule ligne dit exactement ce qui s'est passé, au lieu d'une copie par
  AMAP.
- **Pas pour un gestionnaire** : c'est le compte qui a le plus de pouvoir. Un gestionnaire
  bloqué passe par l'accès direct à la base (hébergeur), plus rare et plus contrôlé.
- **Fonctions étroites plutôt qu'une politique RLS plus large** : une politique qui laisserait
  le gestionnaire lire tous les comptes lui montrerait aussi les téléphones et le reste ; une
  faille dans l'application ne lui donnerait pas plus que ces deux fonctions.
- **Écarté : un code envoyé par email** : c'est la faille que la deuxième vérification ferme
  (ADR 0041).

## Conséquences

- Le contrôle humain repose sur le gestionnaire : l'écran lui demande de s'assurer que c'est
  bien la personne (appel, confirmation par quelqu'un de son AMAP) avant d'agir.
- Les admins de l'AMAP ne voient pas cette réinitialisation dans leur journal. Si le besoin
  apparaît, un écran du journal de la plateforme pourra la montrer.
- Le journal de la plateforme pourra accueillir d'autres actions du gestionnaire (changer
  l'adresse d'une AMAP, par exemple).
