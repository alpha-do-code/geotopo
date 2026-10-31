import { Controller, Get } from "@nestjs/common";
import { Public } from "./auth/public.decorator.js";
import { PrismaService } from "./prisma.service.js";

@Public()
@Controller("sante")
export class SanteController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async verifier() {
    await this.prisma.$queryRaw`select 1`;
    return { ok: true };
  }
}
