// Numéros de téléphone : un même numéro s'écrit de mille façons (« 77 123 45 67 », « +221771234567 »,
// « 00221 77… »). On le ramène à une seule forme, internationale (E.164), pour qu'il serve d'identifiant.
// Sans indicatif, le numéro est supposé sénégalais (9 chiffres commençant par 7 ou 3).

const INDICATIF_PAR_DEFAUT = "221";

export function normaliserTelephone(saisie: string): string | null {
  const brut = saisie.trim().replace(/[\s.\-()/]/g, "");
  let chiffres: string;
  if (brut.startsWith("+")) chiffres = brut.slice(1);
  else if (brut.startsWith("00")) chiffres = brut.slice(2);
  else if (/^221\d{9}$/.test(brut)) chiffres = brut;
  else if (/^[73]\d{8}$/.test(brut)) chiffres = INDICATIF_PAR_DEFAUT + brut;
  else return null;
  if (!/^[1-9]\d{7,14}$/.test(chiffres)) return null;
  // Au Sénégal, le numéro national fait toujours 9 chiffres
  if (chiffres.startsWith("221") && !/^221[73]\d{8}$/.test(chiffres)) return null;
  return `+${chiffres}`;
}

// Affichage lisible : « +221 77 123 45 67 » ; les autres pays restent groupés simplement
export function formaterTelephone(e164: string): string {
  const sn = e164.match(/^\+221(\d{2})(\d{3})(\d{2})(\d{2})$/);
  if (sn) return `+221 ${sn[1]} ${sn[2]} ${sn[3]} ${sn[4]}`;
  return e164.replace(/^(\+\d{3})(\d+)$/, "$1 $2");
}
