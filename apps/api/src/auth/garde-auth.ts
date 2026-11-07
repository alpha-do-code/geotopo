import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { PUBLIC } from "./public.decorator.js";

export type Utilisateur = { id: string };
export type RequeteAuth = Request & { utilisateur: Utilisateur };

// Routes encore permises avec un mot de passe provisoire (moi, changer le mot de passe)
const PENDANT_PROVISOIRE = "pendantProvisoire";
export const PermisPendantProvisoire = () => SetMetadata(PENDANT_PROVISOIRE, true);

// Garde globale : toute route exige un jeton d'accès valide, sauf celles marquées @Public().
// Un jeton émis avec un mot de passe provisoire (chg) n'ouvre que le changement de mot de passe.
@Injectable()
export class GardeAuth implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const cibles = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, cibles)) return true;
    const req = ctx.switchToHttp().getRequest<RequeteAuth>();
    const [type, jeton] = (req.headers.authorization ?? "").split(" ");
    if (type !== "Bearer" || !jeton) throw new UnauthorizedException("Connexion requise.");
    let charge: { sub: string; chg?: boolean };
    try {
      charge = await this.jwt.verifyAsync<{ sub: string; chg?: boolean }>(jeton, { algorithms: ["HS256"] });
    } catch {
      throw new UnauthorizedException("Session expirée.");
    }
    if (charge.chg && !this.reflector.getAllAndOverride<boolean>(PENDANT_PROVISOIRE, cibles)) {
      throw new ForbiddenException("Choisis d'abord ton nouveau mot de passe.");
    }
    req.utilisateur = { id: charge.sub };
    return true;
  }
}
