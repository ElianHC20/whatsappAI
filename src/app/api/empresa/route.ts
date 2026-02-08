import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import * as admin from 'firebase-admin';

// =================================================================================
// 1. MÉTODO GET (INTACTO)
// =================================================================================
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const telefono = searchParams.get('telefono');

    if (!telefono) {
        return NextResponse.json({ error: "Falta el teléfono" }, { status: 400 });
    }

    const idEmpresaLimpio = telefono.replace('whatsapp:', '').replace(/[^0-9+]/g, '');

    try {
        const doc = await db.collection('empresas').doc(idEmpresaLimpio).get();
        if (!doc.exists) {
            return NextResponse.json({ error: "No se encontró empresa" }, { status: 404 });
        }
        return NextResponse.json(doc.data());
    } catch (error) {
        console.error("Error GET:", error);
        return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
}

// =================================================================================
// 2. MÉTODO POST (CEREBRO CON PRESIÓN DE VENTA MODERADA Y SEGURO)
// =================================================================================
export async function POST(req: NextRequest) {
  try {
    const data = await req.json();

    if (!data.telefonoTwilio) {
        return NextResponse.json({ error: "Falta número del bot" }, { status: 400 });
    }

    // --- 1. PERSONALIDAD ---
    let tono = "Tu tono es FORMAL y DIRECTO.";
    if (data.personalidadIA === "Vender") {
        tono = "ERES UN ASESOR COMERCIAL EXPERTO. Objetivo: Vender educando. Sé paciente y persuasivo.";
    } 
    else if (data.personalidadIA === "Amigable") {
        tono = "ERES UN AMIGO CONOCEDOR. Trato cercano.";
    }

    const reglaConcisa = "FORMATO: Respuestas cortas (máx 40 palabras). EMOJIS: Úsalos de forma natural y esporádica (1 o 2 por mensaje máx) para dar calidez.";
    const extraInstructions = data.instruccionesAdicionales ? `NOTA DEL JEFE: ${data.instruccionesAdicionales}` : "";

    // --- 2. CITAS ---
    let politicaCitas = "";
    let prohibicionCitas = "";

    if (data.aceptaReservas === true) {
        politicaCitas = `✅ CITAS: Permitido. Método: ${data.metodoReserva}.`;
    } else {
        politicaCitas = `🚫 CITAS: NO gestionas agenda.`;
        prohibicionCitas = `🛑 PROHIBICIÓN DE AGENDAS: JAMÁS preguntes "¿Te gustaría agendar una cita?". Si piden cita, di que no manejas reservas.`;
    }

    // --- 3. CAMPAÑAS ---
    let logicaCampanas = "";
    const campanasTxt = (data.campanas || []).map((c:any) => 
        `🔑 PALABRA CLAVE: "${c.palabraClave}" -> OFERTA: ${c.contexto} (Vence: ${c.vigencia})`
    ).join("\n");

    if (data.campanas && data.campanas.length > 0) {
        logicaCampanas = `🚨 PRIORIDAD MÁXIMA: SI EL CLIENTE DICE LA PALABRA CLAVE, IGNORA TODO Y DALE LA OFERTA:\n${campanasTxt}`;
    }

    // --- 4. DATOS Y PORTAFOLIO ---
    const metodosPagoTxt = (data.mediosPago && data.mediosPago.length > 0) ? `PAGOS: ${data.mediosPago.join(", ")}.` : "A convenir.";
    
    const redes = data.redes || {};
    const identidadDigitalTxt = `
    🔗 PORTAFOLIO Y EJEMPLOS (TU RESPONSABILIDAD):
    Si piden "ver trabajos", "ejemplos", "fotos", "qué han hecho" o "redes":
    MANDA ESTOS LINKS Y NO ACTIVES LA HERRAMIENTA DE VENTA. ES SOLO INFORMACIÓN.
    - Web: ${redes.web || "N/A"}
    - Instagram: ${redes.instagram || "N/A"}
    - Facebook: ${redes.facebook || "N/A"}
    `;

    let catalogoTxt = "";
    (data.catalogo || []).forEach((cat: any) => {
        catalogoTxt += `\n📂 CATEGORÍA: ${cat.nombre.toUpperCase()}\n`;
        cat.items.forEach((item: any) => {
            catalogoTxt += `• ${item.nombre} -> Precio: $${item.precio || "A cotizar"}. Info: ${item.descripcion}. Detalles IA: ${item.detallesIA}\n`;
        });
    });

    const faqsTxt = (data.faqs || []).map((f:any) => `P: ${f.pregunta}\nR: ${f.respuesta}`).join("\n\n");
    const legalTxt = `Pagos: ${data.instruccionesPago}\nTérminos: ${data.terminosCondiciones}`;

    // =================================================================================
    // SYSTEM PROMPT (CEREBRO SEGURO)
    // =================================================================================
    // 🛡️ NO INYECTAMOS data.telefonoAdmin AQUÍ
    const contactoPublico = data.telefonoAtencion ? data.telefonoAtencion : "Solicitar contacto por este chat";

    const systemPrompt = `
    ERES EL ASISTENTE INTELIGENTE DE "${data.nombre}".
    ${tono} ${reglaConcisa} ${extraInstructions}

    --- 🤝 FASE 0: CONEXIÓN ---
    Si el usuario saluda y NO sabes su nombre: SALUDA Y PREGUNTA SU NOMBRE AMABLEMENTE antes de vender.

    ${logicaCampanas}

    --- 📉 NIVEL DE PRESIÓN: BAJO ---
    NO INTENTES CERRAR LA VENTA EN CADA MENSAJE.
    - Si acabas de dar información, pregunta: "¿Tienes alguna duda sobre esto?".
    - NO preguntes "¿Quieres comprarlo ya?" a menos que el cliente muestre señales claras.

    --- ⛔ PROHIBICIONES ESTRICTAS ---
    1. ANTI-ALUCINACIÓN: Solo vendes lo del CATÁLOGO abajo.
    2. ANTI-CONTRADICCIÓN CITAS: ${prohibicionCitas}
    3. PROHIBIDO COMPARTIR NÚMEROS PRIVADOS. SOLO SOPORTE.

    --- 🚦 SEMÁFORO DE ACCIÓN (CUÁNDO LLAMAR AL HUMANO) ---
    
    🔴 LUZ ROJA (¡PROHIBIDO LLAMAR AL HUMANO!):
    - Cliente: "Quiero ver trabajos/ejemplos" -> TÚ MANDAS LOS LINKS.
    - Cliente: "¿Precio?" -> TÚ RESPONDES CON EL CATÁLOGO.
    >>> EN ESTOS CASOS: Responde tú. NO uses la herramienta "notificar_pedido".

    🟢 LUZ VERDE (SÍ LLAMAR AL HUMANO):
    1. CLIENTE PIDE AYUDA: "Necesito un asesor", "Agéndame".
    2. CLIENTE CONFIRMA COMPRA: "Quiero comprar", "Manda cuenta", "Pagar ya".

    --- 📚 INFORMACIÓN ---
    CATÁLOGO:
    ${catalogoTxt}

    PORTAFOLIO (Solo mostrar):
    ${identidadDigitalTxt}

    DATOS:
    📅 CITAS: ${politicaCitas}
    💰 PAGOS: ${metodosPagoTxt}
    ❓ FAQS: ${faqsTxt}
    📞 CONTACTO SOPORTE: ${contactoPublico}

    ${data.mensajeBienvenida ? `Saludo inicial: "${data.mensajeBienvenida}"` : ""}
    `;

    // --- GUARDADO ---
    const idEmpresaLimpio = data.telefonoTwilio.replace('whatsapp:', '').replace(/[^0-9+]/g, '');

    await db.collection('empresas').doc(idEmpresaLimpio).set({
      ...data,
      systemPrompt, 
      telefonoTwilio: `whatsapp:${idEmpresaLimpio}`,
      telefonoAdmin: data.telefonoAdmin.replace(/\s+/g, ''),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('numeros_disponibles').doc(data.telefonoTwilio).update({
        asignado: true,
        empresaAsignada: data.nombre,
        fechaAsignacion: admin.firestore.FieldValue.serverTimestamp()
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}