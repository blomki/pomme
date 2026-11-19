import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import type { StorageSettings } from "./settings";
import { s3Client } from "./storage";

/**
 * Prépare le bucket des fichiers (fiche S11, ADR 0022) : le crée s'il n'existe pas, puis rend
 * ses fichiers lisibles par tous (lecture seule : ni liste du contenu, ni écriture).
 *
 * Chez Cellar (Clever Cloud), la lecture publique passe par une politique de bucket. En local,
 * SeaweedFS (docker-compose.yml) la donne par son identité « anonymous » et refuse cette
 * politique : on vérifie donc pour de vrai, avec un fichier témoin lu sans identifiants.
 */
export async function setupBucket(settings: StorageSettings): Promise<string[]> {
  const client = s3Client(settings);
  const report: string[] = [];
  const { bucket } = settings;

  const exists = await client.send(new HeadBucketCommand({ Bucket: bucket })).then(
    () => true,
    () => false,
  );
  if (!exists) {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    report.push(`Bucket « ${bucket} » créé.`);
  } else {
    report.push(`Bucket « ${bucket} » déjà là.`);
  }

  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "LecturePubliqueDesImages",
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  };
  const policySet = await client
    .send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: JSON.stringify(policy) }))
    .then(
      () => true,
      () => false,
    );
  report.push(
    policySet
      ? "Politique de lecture publique posée."
      : "Politique de bucket refusée par ce service : lecture publique vérifiée ci-dessous.",
  );

  // Fichier témoin : lu sans identifiants, comme le fera le navigateur.
  const probe = `verification/${Date.now()}.txt`;
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: probe, Body: "ok", ContentType: "text/plain" }),
  );
  try {
    const response = await fetch(`${settings.endpoint}/${bucket}/${probe}`);
    if (!response.ok) {
      throw new Error(
        `Les fichiers du bucket ne sont pas lisibles publiquement (HTTP ${response.status}).`,
      );
    }
    report.push("Lecture publique vérifiée.");
    // La liste du contenu, elle, doit rester fermée (les adresses sont imprévisibles).
    const listing = await fetch(`${settings.endpoint}/${bucket}?list-type=2`);
    report.push(
      listing.ok
        ? "Attention : la liste des fichiers est publique. À fermer dans les réglages du service."
        : "Liste des fichiers fermée au public.",
    );
  } finally {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: probe }));
  }
  return report;
}
