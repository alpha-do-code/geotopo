import { randomInt } from "node:crypto";
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import argon2 from "argon2";
import { EXPEDITEUR, type Expediteur } from "../auth/expediteur.js";
import { CONFIG, type Config } from "../config.js";
import { PrismaService } from "../prisma.service.js";
import { AccesService, type Role } from "./acces.service.js";

@Injectable()
export class OrganisationsService {
  private readonly log = new Logger("Organisations");

  constructor(
    private readonly prisma: PrismaService,
    private readonly acces: AccesService,
    @Inject(EXPEDITEUR) private readonly expediteur: Expediteur,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  async lister(userId: string) {
    const membres = await this.prisma.membres.findMany({ where: { user_id: userId }, include: { organisation: true }, orderBy: { rejoint_le: "asc" } });
    return membres.map((m) => ({
      id: m.organisation.id,
      nom: m.organisation.nom,
      role: m.role as Role,
      // Le code d'invitation n'est montré qu'au chef de mission
      code_invitation: m.role === "chef" ? m.organisation.code_invitation : null,
    }));
  }

  // Chaque membre est aussi un acteur de la matrice RACI ; la ligne arrive sur les appareils par la synchro
  private async ajouterMembre(orgId: string, userId: string, role: Role, nomAffiche: string, tx: Pick<PrismaService, "membres" | "acteurs">) {
    await tx.membres.create({ data: { org_id: orgId, user_id: userId, role, nom_affiche: nomAffiche } });
    await tx.acteurs.create({
      data: { id: crypto.randomUUID(), org_id: orgId, nom: nomAffiche, user_id: userId, fonction: "", cree_par: userId, updated_at: new Date() },
    });
  }

  async creer(userId: string, nom: string, nomAffiche: string) {
    const org = await this.prisma.$transaction(async (tx) => {
      const o = await tx.organisations.create({ data: { nom } });
      await this.ajouterMembre(o.id, userId, "chef", nomAffiche, tx);
      return o;
    });
    return { id: org.id, nom: org.nom, role: "chef" as Role, code_invitation: org.code_invitation };
  }

  async rejoindre(userId: string, code: string, nomAffiche: string) {
    const org = await this.prisma.organisations.findUnique({ where: { code_invitation: code } });
    if (!org) throw new NotFoundException("Code d'invitation inconnu.");
    if (await this.acces.role(userId, org.id)) throw new BadRequestException("Tu es déjà membre de cette organisation.");
    await this.prisma.$transaction((tx) => this.ajouterMembre(org.id, userId, "operateur", nomAffiche, tx));
    return { id: org.id, nom: org.nom, role: "operateur" as Role, code_invitation: null };
  }

  async membres(userId: string, orgId: string) {
    await this.acces.exiger(userId, orgId);
    const l = await this.prisma.membres.findMany({ where: { org_id: orgId }, include: { utilisateur: true }, orderBy: { rejoint_le: "asc" } });
    // Le numéro sert à appeler ou écrire sur WhatsApp à un collègue ; il ne sort pas de l'équipe
    return l.map((m) => ({ user_id: m.user_id, nom_affiche: m.nom_affiche, telephone: m.utilisateur.telephone, email: m.utilisateur.email, role: m.role as Role }));
  }

  async changerRole(userId: string, orgId: string, cible: string, role: Role) {
    await this.acces.exiger(userId, orgId, ["chef"]);
    await this.prisma.$transaction(async (tx) => {
      const m = await tx.membres.findUnique({ where: { org_id_user_id: { org_id: orgId, user_id: cible } } });
      if (!m) throw new NotFoundException("Membre introuvable.");
      if (m.role === "chef" && role !== "chef") {
        const chefs = await tx.membres.count({ where: { org_id: orgId, role: "chef" } });
        if (chefs <= 1) throw new BadRequestException("L'organisation doit garder au moins un chef de mission.");
      }
      await tx.membres.update({ where: { org_id_user_id: { org_id: orgId, user_id: cible } }, data: { role } });
    });
  }

  // Un membre a oublié son mot de passe et n'a pas d'e-mail confirmé : le chef lui en donne un
  // provisoire, à remplacer dès la connexion suivante. Pour qu'un chef ne puisse pas prendre la main
  // sur le compte d'une personne qui travaille aussi ailleurs, il doit être chef de TOUTES ses équipes.
  async motDePasseProvisoire(chefId: string, orgId: string, cible: string) {
    await this.acces.exiger(chefId, orgId, ["chef"]);
    if (cible === chefId) throw new BadRequestException("Pour ton propre compte, utilise « Changer mon mot de passe ».");
    const equipes = await this.prisma.membres.findMany({ where: { user_id: cible } });
    if (!equipes.some((m) => m.org_id === orgId)) throw new NotFoundException("Membre introuvable.");
    const miennes = await this.prisma.membres.findMany({ where: { user_id: chefId, role: "chef", org_id: { in: equipes.map((m) => m.org_id) } } });
    if (miennes.length !== equipes.length) {
      throw new ForbiddenException("Ce membre fait aussi partie d'une autre équipe : il doit passer par « Mot de passe oublié » ou par le chef de cette équipe.");
    }
    const motDePasse = provisoire();
    const hash = await argon2.hash(motDePasse, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.utilisateurs.update({
        where: { id: cible },
        data: { mot_de_passe: hash, doit_changer_mdp: true, mdp_provisoire_par: chefId, mdp_provisoire_le: new Date() },
      }),
      // Ses appareils sont déconnectés : l'ancien mot de passe ne doit plus rien ouvrir
      this.prisma.sessions.updateMany({ where: { utilisateur_id: cible, revoque_le: null }, data: { revoque_le: new Date() } }),
    ]);
    this.log.log(`Mot de passe provisoire : membre ${cible}, équipe ${orgId}, par ${chefId}`);
    return { motDePasse };
  }

  // Invitations par e-mail : le code de l'équipe et un lien qui ouvre GeoTopo avec le code déjà rempli
  async inviter(chefId: string, orgId: string, emails: string[]) {
    await this.acces.exiger(chefId, orgId, ["chef"]);
    const org = await this.prisma.organisations.findUniqueOrThrow({ where: { id: orgId } });
    const chef = await this.prisma.membres.findUniqueOrThrow({ where: { org_id_user_id: { org_id: orgId, user_id: chefId } } });
    const lien = `${this.config.origineWeb}/?invitation=${org.code_invitation}`;
    const texte = [
      `${chef.nom_affiche || "Ton chef de mission"} t'invite à rejoindre l'équipe « ${org.nom} » sur GeoTopo, l'application de suivi des travaux topographiques.`,
      "",
      `1. Ouvre ce lien sur ton téléphone : ${lien}`,
      "2. Crée ton compte avec ton numéro de téléphone.",
      `3. Touche « Rejoindre » : le code de l'équipe (${org.code_invitation}) est déjà rempli.`,
      "",
      `Pour installer l'application sur ton téléphone : ${this.config.origineWeb}/installer/`,
    ].join("\n");
    const echecs: string[] = [];
    for (const a of emails) {
      try {
        await this.expediteur.envoyer({ a, sujet: `GeoTopo : invitation dans l'équipe ${org.nom}`, texte });
      } catch (e) {
        this.log.error(`Invitation non envoyée : ${String(e)}`);
        echecs.push(a);
      }
    }
    return { envoyes: emails.length - echecs.length, echecs };
  }
}

// 10 caractères faciles à dicter au téléphone : pas de 0/O, 1/l/I
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function provisoire() {
  return Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}
