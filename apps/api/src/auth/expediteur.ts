import { Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";

// Envoi des e-mails. En développement, le lien est écrit dans le journal du serveur ;
// en production, il part par SMTP (Gmail avec mot de passe d'application, Brevo, Resend…).
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

export class ExpediteurSmtp implements Expediteur {
  private readonly transport: Transporter;

  constructor(
    url: string,
    private readonly de: string,
  ) {
    this.transport = createTransport(url);
  }

  async envoyer({ a, sujet, texte }: Courriel) {
    await this.transport.sendMail({ from: this.de, to: a, subject: sujet, text: texte });
  }
}
