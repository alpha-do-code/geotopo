import { Logger } from "@nestjs/common";

// Envoi des e-mails. Le fournisseur (Resend, Brevo…) n'est pas encore choisi :
// en développement, le lien est écrit dans le journal du serveur.
export type Courriel = { a: string; sujet: string; texte: string };

export interface Expediteur {
  envoyer(courriel: Courriel): Promise<void>;
}

export const EXPEDITEUR = Symbol("EXPEDITEUR");

export class ExpediteurJournal implements Expediteur {
  private readonly log = new Logger("E-mail");

  async envoyer({ a, sujet, texte }: Courriel) {
    this.log.log(`À ${a} · ${sujet}\n${texte}`);
  }
}
