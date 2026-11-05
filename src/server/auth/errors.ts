/** Personne n'est connecté alors que l'action l'exige (HTTP 401). */
export class UnauthenticatedError extends Error {
  readonly status = 401;
  constructor() {
    super("Connexion requise.");
    this.name = "UnauthenticatedError";
  }
}

/** L'utilisateur connecté n'a pas le droit de faire cette action (HTTP 403). */
export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "Action non autorisée.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
