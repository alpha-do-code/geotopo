import { createHash, randomBytes, randomUUID } from "node:crypto";
import { normaliserTelephone } from "@geotopo/metier";
import { BadRequestException, ConflictException, Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import argon2 from "argon2";
import { CONFIG, type Config } from "../config.js";
import { PrismaService } from "../prisma.service.js";
import { EXPEDITEUR, type Expediteur } from "./expediteur.js";

const DUREE_SESSION_MS = 30 * 24 * 3600 * 1000; // renouvellement glissant de 30 jours
const DUREE_CONFIRMATION_MS = 48 * 3600 * 1000;
const DUREE_REINIT_MS = 3600 * 1000;
const IDENTIFIANTS_INCORRECTS = "Numéro ou mot de passe incorrect.";

const empreinte = (jeton: string) => createHash("sha256").update(jeton).digest("hex");
const jetonAleatoire = () => randomBytes(32).toString("base64url");

type Ligne = { id: string; email: string | null; telephone: string | null; nom_affiche: string; doit_changer_mdp: boolean };
export type Profil = { id: string; email: string | null; telephone: string | null; nomAffiche: string; doitChangerMotDePasse: boolean };
export type Connexion = { jetonAcces: string; jetonRenouvellement: string; utilisateur: Profil };

const profil = (u: Ligne): Profil => ({ id: u.id, email: u.email, telephone: u.telephone, nomAffiche: u.nom_affiche, doitChangerMotDePasse: u.doit_changer_mdp });

// Un identifiant avec « @ » est un e-mail (anciens comptes), sinon un numéro de téléphone
function cle(identifiant: string): { email: string } | { telephone: string } | null {
  if (identifiant.includes("@")) return { email: identifiant.trim().toLowerCase() };
  const t = normaliserTelephone(identifiant);
  return t ? { telephone: t } : null;
}

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

  private readonly log = new Logger("Auth");

  // Pas de vérification par SMS : le compte s'ouvre tout de suite. Sans le code d'invitation d'un chef
  // de mission, il ne donne accès à aucun chantier. Un numéro déjà pris est signalé, sinon la personne
  // ne comprendrait pas pourquoi elle ne peut pas créer son compte (limite de débit stricte).
  async inscrire(telephone: string, motDePasse: string, nomAffiche: string, email?: string): Promise<Connexion> {
    if (await this.prisma.utilisateurs.findUnique({ where: { telephone } })) {
      throw new ConflictException("Ce numéro a déjà un compte. Connecte-toi, ou demande un mot de passe provisoire à ton chef de mission.");
    }
    if (email && (await this.prisma.utilisateurs.findUnique({ where: { email } }))) {
      throw new ConflictException("Cette adresse e-mail est déjà liée à un autre compte. Laisse le champ vide ou mets une autre adresse.");
    }
    const hash = await argon2.hash(motDePasse, { type: argon2.argon2id });
    const u = await this.prisma.utilisateurs.create({ data: { telephone, email: email ?? null, mot_de_passe: hash, nom_affiche: nomAffiche } });
    // L'e-mail ne conditionne pas l'accès : une panne d'envoi ne doit pas bloquer l'inscription
    if (email) await this.envoyerConfirmation(u.id, email).catch((e: unknown) => this.log.error(`Confirmation non envoyée : ${String(e)}`));
    return this.ouvrirSession(u, randomUUID());
  }

  private async envoyerConfirmation(utilisateurId: string, email: string) {
    const jeton = jetonAleatoire();
    await this.prisma.jetons_email.create({
      data: { utilisateur_id: utilisateurId, type: "confirmation", jeton_hash: empreinte(jeton), expire_le: new Date(Date.now() + DUREE_CONFIRMATION_MS) },
    });
    await this.expediteur.envoyer({
      a: email,
      sujet: "GeoTopo : confirme ton adresse e-mail",
      texte: `Confirme ton adresse pour pouvoir récupérer ton compte seul en cas d'oubli du mot de passe. Ouvre ce lien (valable 48 h) : ${this.config.origineWeb}/compte/?confirmer=${jeton}`,
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

  async connecter(identifiant: string, motDePasse: string): Promise<Connexion> {
    const c = cle(identifiant);
    const u = c ? await this.prisma.utilisateurs.findUnique({ where: c }) : null;
    const ok = await argon2.verify(u?.mot_de_passe ?? (await this.hashFactice), motDePasse);
    if (!u || !ok) throw new UnauthorizedException(IDENTIFIANTS_INCORRECTS);
    return this.ouvrirSession(u, randomUUID());
  }

  private async ouvrirSession(u: Ligne, famille: string): Promise<Connexion> {
    const jetonRenouvellement = jetonAleatoire();
    await this.prisma.sessions.create({
      data: { utilisateur_id: u.id, famille, jeton_hash: empreinte(jetonRenouvellement), expire_le: new Date(Date.now() + DUREE_SESSION_MS) },
    });
    const jetonAcces = await this.jwt.signAsync(u.doit_changer_mdp ? { sub: u.id, chg: true } : { sub: u.id });
    return { jetonAcces, jetonRenouvellement, utilisateur: profil(u) };
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

  // Lien par e-mail seulement si une adresse confirmée est liée au compte. Sinon, c'est le chef de
  // mission qui donne un mot de passe provisoire. La réponse ne dit jamais lequel des deux cas s'applique.
  async demanderReinitialisation(identifiant: string) {
    const c = cle(identifiant);
    const u = c ? await this.prisma.utilisateurs.findUnique({ where: c }) : null;
    if (!u?.email || !u.email_confirme_le) return;
    const jeton = jetonAleatoire();
    await this.prisma.jetons_email.create({
      data: { utilisateur_id: u.id, type: "reinitialisation", jeton_hash: empreinte(jeton), expire_le: new Date(Date.now() + DUREE_REINIT_MS) },
    });
    await this.expediteur.envoyer({
      a: u.email,
      sujet: "GeoTopo : nouveau mot de passe",
      texte: `Pour choisir un nouveau mot de passe, ouvre ce lien (valable 1 h) : ${this.config.origineWeb}/compte/?reinitialiser=${jeton}\nSi tu n'as rien demandé, ignore cet e-mail.`,
    });
  }

  async reinitialiser(jeton: string, motDePasse: string) {
    const id = await this.consommerJeton(jeton, "reinitialisation");
    const hash = await argon2.hash(motDePasse, { type: argon2.argon2id });
    // Le lien prouve l'accès à la boîte mail : l'adresse est confirmée. Toutes les sessions sont fermées.
    await this.prisma.$transaction([
      this.prisma.utilisateurs.update({ where: { id }, data: { mot_de_passe: hash, email_confirme_le: new Date(), doit_changer_mdp: false } }),
      this.prisma.sessions.updateMany({ where: { utilisateur_id: id, revoque_le: null }, data: { revoque_le: new Date() } }),
    ]);
  }

  // Changement volontaire, ou obligatoire après un mot de passe provisoire. Les autres appareils
  // sont déconnectés ; la session en cours (son cookie) reste ouverte.
  async changerMotDePasse(id: string, actuel: string, nouveau: string, jetonSession: string | undefined) {
    const u = await this.prisma.utilisateurs.findUnique({ where: { id } });
    if (!u || !(await argon2.verify(u.mot_de_passe, actuel))) throw new BadRequestException("Mot de passe actuel incorrect.");
    if (actuel === nouveau) throw new BadRequestException("Choisis un mot de passe différent de l'actuel.");
    const hash = await argon2.hash(nouveau, { type: argon2.argon2id });
    const courante = jetonSession ? await this.prisma.sessions.findUnique({ where: { jeton_hash: empreinte(jetonSession) } }) : null;
    await this.prisma.$transaction([
      this.prisma.utilisateurs.update({ where: { id }, data: { mot_de_passe: hash, doit_changer_mdp: false } }),
      this.prisma.sessions.updateMany({
        where: { utilisateur_id: id, revoque_le: null, ...(courante ? { famille: { not: courante.famille } } : {}) },
        data: { revoque_le: new Date() },
      }),
    ]);
  }

  async moi(id: string): Promise<Profil> {
    const u = await this.prisma.utilisateurs.findUnique({ where: { id } });
    if (!u) throw new UnauthorizedException("Session expirée.");
    return profil(u);
  }
}
