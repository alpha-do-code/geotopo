import { timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { NextFunction, Request, Response } from "express";

// En production, l'API n'est joignable qu'à travers le Worker Cloudflare (même origine que le site).
// Le Worker ajoute deux en-têtes : le secret partagé et l'adresse IP réelle du visiteur.
export const EN_TETE_SECRET = "x-geotopo-relais";
export const EN_TETE_IP = "x-geotopo-ip";

export type RequeteRelayee = Request & { ipVisiteur?: string };

function egal(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function exigerRelais(secret: string) {
  return (req: RequeteRelayee, res: Response, next: NextFunction) => {
    // La sonde de Render appelle le service directement ; elle ne lit rien
    if (req.method === "GET" && req.path === "/api/ping") return next();
    const recu = req.headers[EN_TETE_SECRET];
    if (typeof recu !== "string" || !egal(recu, secret)) {
      res.status(403).json({ statusCode: 403, message: "Accès direct refusé." });
      return;
    }
    const ip = req.headers[EN_TETE_IP];
    if (typeof ip === "string" && ip.length <= 64) req.ipVisiteur = ip;
    next();
  };
}

// Limite de débit par visiteur : sans l'IP relayée, tous les visiteurs auraient celle du Worker
@Injectable()
export class LimiteParVisiteur extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const r = req as unknown as RequeteRelayee;
    return r.ipVisiteur ?? r.ip ?? "inconnu";
  }
}
