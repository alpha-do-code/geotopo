import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";

// Les erreurs prévues (HttpException) passent telles quelles. Les autres sont journalisées
// côté serveur et l'utilisateur ne reçoit qu'un message générique, sans pile ni requête SQL.
@Catch()
export class FiltreErreurs implements ExceptionFilter {
  private readonly log = new Logger("Erreur");

  catch(erreur: unknown, hote: ArgumentsHost) {
    const res = hote.switchToHttp().getResponse<Response>();
    if (erreur instanceof HttpException) {
      res.status(erreur.getStatus()).json(erreur.getResponse());
      return;
    }
    this.log.error(erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur));
    res.status(500).json({ statusCode: 500, message: "Erreur interne. Réessaie plus tard." });
  }
}
