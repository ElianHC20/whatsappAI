import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// TU ID REAL (Copiado de tu pantalla)
const TEMPLATE_SID = "HX8bbcff99b729ac2b2beee37ea13a51c0"; 

export async function enviarAlertaVenta(
  celularAdmin: string, 
  celularBot: string, 
  datos: { cliente: string; producto: string; total: string }
) {
  try {
    // Asegurar formato whatsapp:+57...
    const to = celularAdmin.startsWith('whatsapp:') ? celularAdmin : `whatsapp:${celularAdmin}`;
    const from = celularBot.startsWith('whatsapp:') ? celularBot : `whatsapp:${celularBot}`;

    console.log(`🚀 Enviando alerta a ${to} desde ${from}...`);

    // Enviar usando la PLANTILLA (Esto rompe la restricción de 24h)
    await client.messages.create({
      from: from,
      to: to,
      contentSid: TEMPLATE_SID, 
      contentVariables: JSON.stringify({
        "1": datos.cliente,  // Variable {{1}}
        "2": datos.producto, // Variable {{2}}
        "3": datos.total     // Variable {{3}}
      })
    });

    console.log("✅ Alerta enviada con éxito.");
    return true;

  } catch (error) {
    console.error("❌ Error enviando alerta:", error);
    return false;
  }
}