import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { AccesService, type Role } from "./acces.service.js";

@Injectable()
export class OrganisationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acces: AccesService,
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
    return l.map((m) => ({ user_id: m.user_id, nom_affiche: m.nom_affiche, email: m.utilisateur.email, role: m.role as Role }));
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
}
