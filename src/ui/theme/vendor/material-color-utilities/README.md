# material-color-utilities (copie partielle)

Extrait de la bibliothèque de couleurs de Google, licence Apache 2.0 (voir `LICENSE`) :
palettes tonales (`palettes/`), espace de couleur HCT (`hct/`) et conversions (`utils/`).

- Source : https://github.com/material-foundation/material-color-utilities, dossier
  `typescript/`, commit `bd811e4ca2ab94c4ce3cadc89c19b1820b9704b3` (version 0.4.0).
- Fichiers compilés en JavaScript (module ES) avec leurs déclarations de types, sans aucune
  modification du code.

Pourquoi une copie plutôt que le paquet npm : le paquet `@material/material-color-utilities`
0.4.0 n'expose que son point d'entrée, et ce point d'entrée charge un module mal publié
(import sans extension `.js`) que Node et Vitest refusent. Les modules copiés ici n'en
dépendent pas. À remplacer par le paquet quand une version corrigée sera publiée.

Ne pas modifier ces fichiers ; ils sont exclus d'ESLint, de Prettier et de la couverture.
