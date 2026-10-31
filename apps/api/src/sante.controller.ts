import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

@Controller("sante")
export class SanteController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async verifier() {
    await this.prisma.$queryRaw`select 1`;
    return { ok: true };
  }
}
