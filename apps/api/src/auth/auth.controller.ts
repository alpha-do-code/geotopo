import { Body, Controller, ForbiddenException, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { CONFIG, type Config } from "../config.js";
import { AuthService, type Connexion } from "./auth.service.js";
import { ChangementMdpDto, ConnexionDto, InscriptionDto, JetonDto, OubliDto, ReinitialisationDto } from "./dto.js";
import { PermisPendantProvisoire, type RequeteAuth } from "./garde-auth.js";
import { Public } from "./public.decorator.js";

const COOKIE = "geotopo_session";
const STRICT = { general: { limit: 5, ttl: 60_000 } }; // 5 essais par minute et par adresse IP

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  // Le jeton de renouvellement ne quitte jamais le cookie httpOnly ; le jeton d'accès reste en mémoire côté web
  private poserSession(res: Response, c: Connexion) {
    res.cookie(COOKIE, c.jetonRenouvellement, {
      httpOnly: true,
      secure: this.config.production,
      sameSite: "strict",
      path: "/api/auth",
      maxAge: 30 * 24 * 3600 * 1000,
    });
    return { jetonAcces: c.jetonAcces, utilisateur: c.utilisateur };
  }

  // Les routes à cookie n'acceptent que les appels venus du site lui-même
  private verifierOrigine(req: Request) {
    const origine = req.headers.origin;
    if (origine && origine !== this.config.origineWeb) throw new ForbiddenException("Origine refusée.");
  }

  // Le compte s'ouvre tout de suite : la réponse est une session, comme la connexion
  @Public() @Throttle(STRICT) @Post("inscription") @HttpCode(201)
  async inscription(@Body() dto: InscriptionDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.verifierOrigine(req);
    return this.poserSession(res, await this.auth.inscrire(dto.telephone, dto.motDePasse, dto.nomAffiche, dto.email));
  }

  @Public() @Throttle(STRICT) @Post("confirmer") @HttpCode(200)
  async confirmer(@Body() dto: JetonDto) {
    await this.auth.confirmer(dto.jeton);
    return { message: "Adresse e-mail confirmée. Elle te permettra de récupérer ton compte en cas d'oubli." };
  }

  @Public() @Throttle(STRICT) @Post("connexion") @HttpCode(200)
  async connexion(@Body() dto: ConnexionDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.verifierOrigine(req);
    return this.poserSession(res, await this.auth.connecter(dto.identifiant, dto.motDePasse));
  }

  @Public() @Throttle({ general: { limit: 30, ttl: 60_000 } }) @Post("renouveler") @HttpCode(200)
  async renouveler(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.verifierOrigine(req);
    try {
      return this.poserSession(res, await this.auth.renouveler(req.cookies?.[COOKIE]));
    } catch (e) {
      res.clearCookie(COOKIE, { path: "/api/auth" });
      throw e;
    }
  }

  @Public() @Post("deconnexion") @HttpCode(204)
  async deconnexion(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.verifierOrigine(req);
    await this.auth.deconnecter(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { path: "/api/auth" });
  }

  @Public() @Throttle(STRICT) @Post("oubli") @HttpCode(202)
  async oubli(@Body() dto: OubliDto) {
    await this.auth.demanderReinitialisation(dto.identifiant);
    return {
      message:
        "Si une adresse e-mail confirmée est liée à ce compte, un lien vient d'y être envoyé. Sinon, demande un mot de passe provisoire à ton chef de mission.",
    };
  }

  @Public() @Throttle(STRICT) @Post("reinitialiser") @HttpCode(200)
  async reinitialiser(@Body() dto: ReinitialisationDto) {
    await this.auth.reinitialiser(dto.jeton, dto.motDePasse);
    return { message: "Mot de passe changé. Tu peux te connecter." };
  }

  @PermisPendantProvisoire() @Throttle(STRICT) @Post("mot-de-passe") @HttpCode(204)
  async changerMotDePasse(@Req() req: RequeteAuth, @Body() dto: ChangementMdpDto) {
    this.verifierOrigine(req);
    await this.auth.changerMotDePasse(req.utilisateur.id, dto.actuel, dto.nouveau, req.cookies?.[COOKIE]);
  }

  @PermisPendantProvisoire() @Get("moi")
  moi(@Req() req: RequeteAuth) {
    return this.auth.moi(req.utilisateur.id);
  }
}
