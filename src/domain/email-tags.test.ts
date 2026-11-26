import { describe, expect, it } from "vitest";

import { bodyParagraphs, canSend, checkTags, findTags, insertTag, renderTags } from "./email-tags";

describe("balises des emails groupés", () => {
  it("trouve les balises, sans doublon, même avec des espaces", () => {
    expect(findTags("Bonjour {{prenom}}, {{ prenom }} et {{inconnue}}")).toEqual([
      "prenom",
      "inconnue",
    ]);
  });

  it("remplace les balises connues pour chaque destinataire ; laisse les autres", () => {
    expect(
      renderTags("Bonjour {{prenom}} {{nom}}, {{producteur}} {{xyz}}", {
        prenom: "Léa",
        nom: "Martin",
      }),
    ).toBe("Bonjour Léa Martin, {{producteur}} {{xyz}}");
  });

  it("avertit d'une balise inconnue et de {{producteur}} hors clients d'un producteur", () => {
    const check = checkTags({
      subject: "Info {{producteur}}",
      body: "{{prenom}} {{prenomm}}",
      audience: "all_members",
      values: {},
    });
    expect(check).toEqual({ unknown: ["prenomm"], producerOutside: true, missing: [] });
    expect(
      checkTags({
        subject: "Info {{producteur}}",
        body: "",
        audience: "producer_customers",
        values: { producteur: "Ferme" },
      }).producerOutside,
    ).toBe(false);
  });

  it("bloque l'envoi si une période utilisée n'est pas définie, ou sans objet", () => {
    const check = checkTags({
      subject: "Commandes",
      body: "Du {{debutPeriodeCommande}} ; disponibilités avant le {{finDeclarationDisponibilites}}",
      audience: "all_members",
      values: { debutPeriodeCommande: "lundi 15 décembre" },
    });
    expect(check.missing).toEqual(["dutyPeriod"]);
    expect(canSend("Commandes", check)).toBe(false);
    const ok = checkTags({ subject: "x", body: "{{prenom}}", audience: "all_members", values: {} });
    expect(canSend("Commandes", ok)).toBe(true);
    expect(canSend("  ", ok)).toBe(false);
  });

  it("insère une balise à la position du curseur", () => {
    expect(insertTag("Bonjour !", 7, "prenom")).toEqual({
      text: "Bonjour{{prenom}} !",
      cursor: 17,
    });
    expect(insertTag("abc", 99, "nom")).toEqual({ text: "abc{{nom}}", cursor: 10 });
  });

  it("découpe le message en paragraphes", () => {
    expect(bodyParagraphs("Un\r\n\r\nDeux\nsuite\n\n\n")).toEqual(["Un", "Deux\nsuite"]);
  });
});
