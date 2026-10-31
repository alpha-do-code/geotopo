import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { PUBLIC } from "./public.decorator.js";

export type Utilisateur = { id: string; email: string };
export type RequeteAuth = Request & { utilisateur: Utilisateur };

// Garde globale : toute route exige un jeton d'accès valide, sauf celles marquées @Public()
@Injectable()
export class GardeAuth implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<RequeteAuth>();
    const [type, jeton] = (req.headers.authorization ?? "").split(" ");
    if (type !== "Bearer" || !jeton) throw new UnauthorizedException("Connexion requise.");
    try {
      const charge = await this.jwt.verifyAsync<{ sub: string; email: string }>(jeton, { algorithms: ["HS256"] });
      req.utilisateur = { id: charge.sub, email: charge.email };
      return true;
    } catch {
      throw new UnauthorizedException("Session expirée.");
    }
  }
}
