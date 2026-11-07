import { Controller, Get } from "@nestjs/common";
import { Public } from "./auth/public.decorator.js";
import { PrismaService } from "./prisma.service.js";

@Public()
@Controller("sante")
export class SanteController {
  constructor(private readonly prisma: PrismaService) {}

  // Vérifie aussi la base : sert à la surveillance, passe par le Worker
  @Get()
  async verifier() {
    await this.prisma.$queryRaw`select 1`;
    return { ok: true };
  }
}

// Sonde légère, sans toucher la base : la sonde de Render et le réveil du Worker l'appellent
// souvent, et une base Neon qui dort ne doit pas être réveillée pour rien.
@Public()
@Controller("ping")
export class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}
