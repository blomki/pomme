# Reprise des données depuis AmapJ : fichier de correspondance

L'écran « Réglages › Reprendre des données depuis AmapJ » importe des fichiers CSV. Il
reconnaît les colonnes par leur **nom**. Le fichier
[`src/domain/import-mapping.json`](../src/domain/import-mapping.json) dit, pour chaque colonne
de Pomme, quels noms de colonne accepter dans le fichier importé (story K1, ADR 0044).

## Structure

```json
{
  "adherents": {
    "Prénom": [],
    "Email": ["E-mail", "Courriel"]
  },
  "producteurs": { "Producteur": ["Nom du producteur"] },
  "produits": { "Produit": ["Désignation"] }
}
```

- Trois sections : `adherents` (foyers, membres, adhésions, permanences déjà faites),
  `producteurs`, `produits`.
- À gauche, le **nom de la colonne dans Pomme**, exactement comme dans le modèle téléchargeable
  (liste ci-dessous). À droite, la **liste des noms acceptés** dans le fichier importé, entre
  crochets et entre guillemets, séparés par des virgules. Liste vide `[]` : seul le nom Pomme
  est reconnu.
- Les majuscules, les accents et la ponctuation ne comptent pas : `E-mail`, `e mail` et
  `EMAIL` sont le même nom.
- Un même nom ne peut pas servir à deux colonnes d'une même section.
- La clé `_aide` est un simple commentaire.

## Colonnes de Pomme

| Section       | Colonnes (obligatoires en gras)                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `adherents`   | Foyer, **Prénom**, Nom, **Email**, Téléphone, Contact principal, Début adhésion, Fin adhésion, Permanences faites |
| `producteurs` | **Producteur**, Catégorie, Email, Téléphone, Ordre des chèques, Présentation                                      |
| `produits`    | **Producteur**, **Produit**                                                                                       |

## Ajouter les colonnes d'un export AmapJ

1. Exporter le fichier depuis AmapJ, l'ouvrir dans un tableur et noter **seulement la ligne
   d'en-têtes**. Ne jamais copier de données réelles dans le dépôt (ni dans un test, ni dans une
   issue).
2. Pour chaque en-tête utile, l'ajouter à la liste de la colonne Pomme correspondante. Exemple :
   AmapJ appelle la colonne « Adresse e-mail 1 » → `"Email": ["Adresse e-mail 1", …]`.
3. Lancer `pnpm test src/domain/imports.test.ts` : le test « fichier de correspondance » signale
   une colonne Pomme mal écrite, une liste mal formée ou un nom utilisé deux fois.
4. Proposer la modification par une pull request, comme le reste du code.

## Limites

- Une colonne AmapJ qui réunit deux informations (par exemple « Nom Prénom » dans une seule
  colonne) n'est pas découpée : il faut la séparer dans le tableur avant l'import.
- Le fichier doit être enregistré en CSV (« Enregistrer sous », format « CSV (séparateur :
  point-virgule) »).
