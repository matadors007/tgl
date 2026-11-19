/** Mot de passe accepté : 8 caractères minimum, avec au moins une lettre et un chiffre (même règle que le serveur). */
export const passwordOk = (p: string) => p.length >= 8 && p.length <= 200 && /[A-Za-z]/.test(p) && /\d/.test(p);
