import { createHash, randomBytes, randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import argon2 from "argon2";
import { CONFIG, type Config } from "../config.js";
import { PrismaService } from "../prisma.service.js";
import { EXPEDITEUR, type Expediteur } from "./expediteur.js";

const DUREE_SESSION_MS = 30 * 24 * 3600 * 1000; // renouvellement glissant de 30 jours
const DUREE_CONFIRMATION_MS = 48 * 3600 * 1000;
const DUREE_REINIT_MS = 3600 * 1000;
const IDENTIFIANTS_INCORRECTS = "E-mail ou mot de passe incorrect.";

const empreinte = (jeton: string) => createHash("sha256").update(jeton).digest("hex");
const jetonAleatoire = () => randomBytes(32).toString("base64url");

export type Connexion = { jetonAcces: string; jetonRenouvellement: string; utilisateur: { id: string; email: string; nomAffiche: string } };

@Injectable()
export class AuthService {
  // Hash factice : la connexion d'un e-mail inconnu prend le même temps qu'un mauvais mot de passe
  private hashFactice = argon2.hash(randomBytes(16).toString("hex"), { type: argon2.argon2id });

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(EXPEDITEUR) private readonly expediteur: Expediteur,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  // Réponse identique que l'adresse soit libre ou non (pas d'énumération des comptes)
  async inscrire(email: string, motDePasse: string, nomAffiche: string) {
    const existant = await this.prisma.utilisateurs.findUnique({ where: { email } });
    if (existant) {
      await this.expediteur.envoyer({
        a: email,
        sujet: "GeoTopo : tu as déjà un compte",
        texte: `Quelqu'un a tenté de créer un compte avec ton adresse. Si c'est toi, connecte-toi ou utilise « mot de passe oublié » : ${this.config.origineWeb}/compte/`,
      });
      return;
    }
    const hash = await argon2.hash(motDePasse, { type: argon2.argon2id });
    const u = await this.prisma.utilisateurs.create({ data: { email, mot_de_passe: hash, nom_affiche: nomAffiche } });
    await this.envoyerConfirmation(u.id, email);
  }

  private async envoyerConfirmation(utilisateurId: string, email: string) {
    const jeton = jetonAleatoire();
    await this.prisma.jetons_email.create({
      data: { utilisateur_id: utilisateurId, type: "confirmation", jeton_hash: empreinte(jeton), expire_le: new Date(Date.now() + DUREE_CONFIRMATION_MS) },
    });
    await this.expediteur.envoyer({
      a: email,
      sujet: "GeoTopo : confirme ton adresse e-mail",
      texte: `Pour activer ton compte, ouvre ce lien (valable 48 h) : ${this.config.origineWeb}/compte/?confirmer=${jeton}`,
    });
  }

  private async consommerJeton(jeton: string, type: "confirmation" | "reinitialisation") {
    const ligne = await this.prisma.jetons_email.findUnique({ where: { jeton_hash: empreinte(jeton) } });
    if (!ligne || ligne.type !== type || ligne.utilise_le || ligne.expire_le < new Date()) {
      throw new BadRequestException("Lien invalide ou expiré.");
    }
    // Usage unique, même en cas de double clic simultané
    const { count } = await this.prisma.jetons_email.updateMany({ where: { id: ligne.id, utilise_le: null }, data: { utilise_le: new Date() } });
    if (count !== 1) throw new BadRequestException("Lien invalide ou expiré.");
    return ligne.utilisateur_id;
  }

  async confirmer(jeton: string) {
    const id = await this.consommerJeton(jeton, "confirmation");
    await this.prisma.utilisateurs.update({ where: { id }, data: { email_confirme_le: new Date() } });
  }

  async connecter(email: string, motDePasse: string): Promise<Connexion> {
    const u = await this.prisma.utilisateurs.findUnique({ where: { email } });
    const ok = await argon2.verify(u?.mot_de_passe ?? (await this.hashFactice), motDePasse);
    if (!u || !ok) throw new UnauthorizedException(IDENTIFIANTS_INCORRECTS);
    if (!u.email_confirme_le) {
      await this.envoyerConfirmation(u.id, u.email);
      throw new ForbiddenException("Confirme d'abord ton adresse e-mail. Un nouveau lien vient de t'être envoyé.");
    }
    return this.ouvrirSession(u, randomUUID());
  }

  private async ouvrirSession(u: { id: string; email: string; nom_affiche: string }, famille: string): Promise<Connexion> {
    const jetonRenouvellement = jetonAleatoire();
    await this.prisma.sessions.create({
      data: { utilisateur_id: u.id, famille, jeton_hash: empreinte(jetonRenouvellement), expire_le: new Date(Date.now() + DUREE_SESSION_MS) },
    });
    const jetonAcces = await this.jwt.signAsync({ sub: u.id, email: u.email });
    return { jetonAcces, jetonRenouvellement, utilisateur: { id: u.id, email: u.email, nomAffiche: u.nom_affiche } };
  }

  // Rotation : chaque jeton de renouvellement ne sert qu'une fois. S'il revient après usage,
  // il a été volé ou rejoué : toute la famille de sessions est révoquée.
  async renouveler(jeton: string | undefined): Promise<Connexion> {
    if (!jeton) throw new UnauthorizedException("Session expirée.");
    const s = await this.prisma.sessions.findUnique({ where: { jeton_hash: empreinte(jeton) }, include: { utilisateur: true } });
    if (!s) throw new UnauthorizedException("Session expirée.");
    if (s.revoque_le) {
      await this.prisma.sessions.updateMany({ where: { famille: s.famille, revoque_le: null }, data: { revoque_le: new Date() } });
      throw new UnauthorizedException("Session expirée.");
    }
    if (s.expire_le < new Date()) throw new UnauthorizedException("Session expirée.");
    const { count } = await this.prisma.sessions.updateMany({ where: { id: s.id, revoque_le: null }, data: { revoque_le: new Date() } });
    if (count !== 1) throw new UnauthorizedException("Session expirée.");
    return this.ouvrirSession(s.utilisateur, s.famille);
  }

  async deconnecter(jeton: string | undefined) {
    if (!jeton) return;
    const s = await this.prisma.sessions.findUnique({ where: { jeton_hash: empreinte(jeton) } });
    if (s) await this.prisma.sessions.updateMany({ where: { famille: s.famille, revoque_le: null }, data: { revoque_le: new Date() } });
  }

  async demanderReinitialisation(email: string) {
    const u = await this.prisma.utilisateurs.findUnique({ where: { email } });
    if (!u) return;
    const jeton = jetonAleatoire();
    await this.prisma.jetons_email.create({
      data: { utilisateur_id: u.id, type: "reinitialisation", jeton_hash: empreinte(jeton), expire_le: new Date(Date.now() + DUREE_REINIT_MS) },
    });
    await this.expediteur.envoyer({
      a: email,
      sujet: "GeoTopo : nouveau mot de passe",
      texte: `Pour choisir un nouveau mot de passe, ouvre ce lien (valable 1 h) : ${this.config.origineWeb}/compte/?reinitialiser=${jeton}\nSi tu n'as rien demandé, ignore cet e-mail.`,
    });
  }

  async reinitialiser(jeton: string, motDePasse: string) {
    const id = await this.consommerJeton(jeton, "reinitialisation");
    const hash = await argon2.hash(motDePasse, { type: argon2.argon2id });
    // Le lien prouve l'accès à la boîte mail : l'adresse est confirmée. Toutes les sessions sont fermées.
    await this.prisma.$transaction([
      this.prisma.utilisateurs.update({ where: { id }, data: { mot_de_passe: hash, email_confirme_le: new Date() } }),
      this.prisma.sessions.updateMany({ where: { utilisateur_id: id, revoque_le: null }, data: { revoque_le: new Date() } }),
    ]);
  }

  async moi(id: string) {
    const u = await this.prisma.utilisateurs.findUnique({ where: { id } });
    if (!u) throw new UnauthorizedException("Session expirée.");
    return { id: u.id, email: u.email, nomAffiche: u.nom_affiche };
  }
}
