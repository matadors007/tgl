/** Envoi des e-mails (code d'activation, mot de passe oublié) par SMTP — Gmail par défaut. */
import nodemailer from 'nodemailer';

let transport = null;
function getTransport() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  if (!transport) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transport;
}

export async function sendMail({ to, subject, text, html }) {
  const t = getTransport();
  if (!t) {
    // Développement sans SMTP : le message est affiché dans les journaux
    console.log(`[mail non configuré] À : ${to}\nObjet : ${subject}\n${text}`);
    return;
  }
  await t.sendMail({ from: `"Tunisia Golden League" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`, to, subject, text, html });
}

export function resetEmailHtml(link) {
  return `<!doctype html><html><body style="margin:0;background:#0B0B0B;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0B0B;padding:24px 0"><tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#141414;border:1px solid #D7AB3E;border-radius:14px">
<tr><td style="padding:22px;text-align:center;border-bottom:1px solid #2D2A22"><div style="color:#D7AB3E;font-size:20px;font-weight:900;letter-spacing:2px">TUNISIA GOLDEN LEAGUE</div></td></tr>
<tr><td style="padding:26px 24px;color:#F6F1E3;text-align:center">
<p style="margin:0 0 18px;font-size:15px">Pour choisir un nouveau mot de passe, touchez le bouton ci-dessous :</p>
<a href="${link}" style="display:inline-block;padding:12px 26px;border-radius:10px;background:#D7AB3E;color:#111;font-weight:bold;text-decoration:none">Choisir un nouveau mot de passe</a>
<p style="margin:18px 0 0;color:#A69F8C;font-size:12px">Ce lien est valable 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
</td></tr></table></td></tr></table></body></html>`;
}
