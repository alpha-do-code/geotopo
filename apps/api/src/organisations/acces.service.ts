import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";

export type Role = "chef" | "operateur" | "controleur";

// Droits vérifiés côté serveur à chaque requête : on ne fait jamais confiance au rôle envoyé par l'appareil
@Injectable()
export class AccesService {
  constructor(private readonly prisma: PrismaService) {}

  async role(userId: string, orgId: string): Promise<Role | null> {
    const m = await this.prisma.membres.findUnique({ where: { org_id_user_id: { org_id: orgId, user_id: userId } } });
    return (m?.role as Role) ?? null;
  }

  async exiger(userId: string, orgId: string, roles?: Role[]): Promise<Role> {
    const r = await this.role(userId, orgId);
    if (!r) throw new ForbiddenException("Tu n'es pas membre de cette organisation.");
    if (roles && !roles.includes(r)) throw new ForbiddenException("Ton rôle ne permet pas cette action.");
    return r;
  }
}
