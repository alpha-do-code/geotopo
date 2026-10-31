import { SetMetadata } from "@nestjs/common";

// Route ouverte sans jeton d'accès (inscription, connexion…)
export const PUBLIC = "public";
export const Public = () => SetMetadata(PUBLIC, true);
