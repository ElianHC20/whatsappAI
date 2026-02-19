import { NextRequest, NextResponse } from 'next/server';
import Twilio from 'twilio';
import OpenAI from 'openai';
import { db } from '@/lib/firebaseAdmin';
import * as admin from 'firebase-admin';

const twilioClient = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================
// LIMITES POR PLAN
// ============================================
const LIMITES_PLAN: Record<string, { bot: number; jefe: number }> = {
    trial:   { bot: 30,    jefe: 5 },
    basico:  { bot: 100,   jefe: 20 },
    pro:     { bot: 1500,  jefe: 200 },
    premium: { bot: 5000,  jefe: 1000 },
};

// ============================================
// VERIFICAR LIMITES + TRIAL + RESET MENSUAL
// ============================================
async function verificarLimites(botId: string, esJefe: boolean): Promise<{ permitido: boolean; motivo?: string }> {
    try {
        const usuariosSnap = await db.collection('usuarios')
            .where('telefonoBot', '==', botId)
            .limit(1)
            .get();

        if (usuariosSnap.empty) {
            console.log("[LIMITES] Sin usuario vinculado, permitido");
            return { permitido: true };
        }

        const userDoc = usuariosSnap.docs[0];
        const userData = userDoc.data();
        const planId = userData.plan || 'trial';

        if (userData.trialEndDate) {
            const trialEnd = new Date(userData.trialEndDate);
            if (new Date() > trialEnd && !userData.suscripcionActiva) {
                console.log("[LIMITES] Trial expirado, bloqueado");
                return { permitido: false, motivo: 'trial_expirado' };
            }
        }

        let mensajesBot = userData.mensajesBotUsados || 0;
        let mensajesJefe = userData.mensajesJefeUsados || 0;
        const ultimoReset = userData.ultimoResetContadores ? new Date(userData.ultimoResetContadores) : null;
        const ahora = new Date();

        if (!ultimoReset || ultimoReset.getMonth() !== ahora.getMonth() || ultimoReset.getFullYear() !== ahora.getFullYear()) {
            console.log("[LIMITES] Reset mensual de contadores");
            await userDoc.ref.update({
                mensajesBotUsados: 0,
                mensajesJefeUsados: 0,
                ultimoResetContadores: ahora.toISOString(),
            });
            mensajesBot = 0;
            mensajesJefe = 0;
        }

        const limite = LIMITES_PLAN[planId] || LIMITES_PLAN.trial;

        if (esJefe && mensajesJefe >= limite.jefe) return { permitido: false, motivo: 'limite_jefe' };
        if (!esJefe && mensajesBot >= limite.bot) return { permitido: false, motivo: 'limite_bot' };

        await userDoc.ref.update({
            [esJefe ? 'mensajesJefeUsados' : 'mensajesBotUsados']: (esJefe ? mensajesJefe : mensajesBot) + 1,
        });

        return { permitido: true };
    } catch (e: any) {
        console.error("[LIMITES] Error:", e.message);
        return { permitido: true };
    }
}

// ============================================
// HELPERS
// ============================================
function buildProxyUrl(firebaseUrl: string, baseUrl: string): string {
    return `${baseUrl}/api/imagen?url=${encodeURIComponent(firebaseUrl)}`;
}

function normalizarTexto(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/roja/g, "rojo").replace(/negra/g, "negro").replace(/blanca/g, "blanco")
        .replace(/amarilla/g, "amarillo").replace(/morada/g, "morado").replace(/rosada/g, "rosa");
}

function generarResumenCatalogoActual(catalogo: any[]): string {
    if (!catalogo || catalogo.length === 0) return "Sin productos en este momento.";
    let resumen = "";
    catalogo.forEach((cat: any) => {
        const nombresProductos = (cat.items || []).map((i: any) => i.nombre).filter((n: string) => n).join(", ");
        resumen += `\n=== CATEGORIA: ${(cat.nombre || "").toUpperCase()} ===\nProductos: ${nombresProductos || "ninguno"}.\n`;
        (cat.items || []).forEach((item: any) => {
            const infoPrecio = (item.tipoPrecio === 'cotizar') ? "A COTIZAR" : `$${item.precio}`;
            const tieneImgPrincipal = item.imagenPrincipal && item.imagenPrincipal.trim() !== "";
            const imgPrincipal = tieneImgPrincipal ? `FOTO: ${item.imagenPrincipal}` : "SIN FOTO";
            let infoVariantes = "  VARIANTES: ninguna\n";
            if (item.variantes && item.variantes.length > 0) {
                const grupos: string[] = [];
                const nombresGrupos: string[] = [];
                item.variantes.forEach((v: any) => {
                    if (!v.opciones || v.opciones.length === 0) return;
                    nombresGrupos.push(v.nombre);
                    const ops = v.opciones.map((o: any) => {
                        const tieneImg = o.imagenUrl && o.imagenUrl.trim() !== "";
                        return tieneImg ? `${o.nombre}(foto:${o.imagenUrl})` : `${o.nombre}(SIN FOTO)`;
                    }).join(", ");
                    grupos.push(`    ${v.nombre}: [${ops}]`);
                });
                if (grupos.length > 0) {
                    infoVariantes = `  GRUPOS DE VARIANTES: ${nombresGrupos.join(", ")}\n  OPCIONES POR GRUPO:\n${grupos.join("\n")}\n`;
                }
            }
            const esReservable = item.requiereReserva === true;
            const etiqueta = esReservable ? "[REQUIERE RESERVA]" : "[VENTA DIRECTA]";
            resumen += `\n  PRODUCTO: ${item.nombre} ${etiqueta}\n  Precio: ${infoPrecio}${item.frecuencia && item.frecuencia !== "Pago Único" ? ` (${item.frecuencia})` : ""}\n  Imagen: ${imgPrincipal}\n${infoVariantes}`;
            if (item.descripcion) resumen += `  Descripcion: ${item.descripcion}\n`;
            if (item.duracion) resumen += `  Duracion: ${item.duracion}\n`;
            if (item.detallesIA) resumen += `  Info adicional: ${item.detallesIA}\n`;
            if (item.tienePromo) resumen += `  PROMO: ${item.detallePromo}\n`;
        });
    });
    return resumen;
}

function obtenerProductoDelContexto(texto: string, catalogo: any[]): any | null {
    const limpio = normalizarTexto(texto);
    let mejorMatch: any = null;
    let mejorPos = -1;
    for (const cat of catalogo) {
        for (const item of (cat.items || [])) {
            const nombreItem = normalizarTexto(item.nombre || "");
            if (!nombreItem) continue;
            const pos = limpio.lastIndexOf(nombreItem);
            if (pos !== -1 && pos > mejorPos) { mejorMatch = item; mejorPos = pos; }
        }
    }
    return mejorMatch;
}

function itemTieneFoto(item: any): boolean {
    if (item.imagenPrincipal && item.imagenPrincipal.trim() !== "") return true;
    for (const grupo of (item.variantes || [])) {
        for (const opcion of (grupo.opciones || [])) {
            if (opcion.imagenUrl && opcion.imagenUrl.trim() !== "") return true;
        }
    }
    return false;
}

function obtenerFotoDeProducto(item: any): string | null {
    if (item.imagenPrincipal && item.imagenPrincipal.trim() !== "") return item.imagenPrincipal;
    for (const grupo of (item.variantes || [])) {
        for (const opcion of (grupo.opciones || [])) {
            if (opcion.imagenUrl && opcion.imagenUrl.trim() !== "") return opcion.imagenUrl;
        }
    }
    return null;
}

function urlEsDeProducto(url: string, item: any): boolean {
    if (!url || !item) return false;
    if (item.imagenPrincipal && item.imagenPrincipal.trim() === url.trim()) return true;
    for (const grupo of (item.variantes || [])) {
        for (const opcion of (grupo.opciones || [])) {
            if (opcion.imagenUrl && opcion.imagenUrl.trim() === url.trim()) return true;
        }
    }
    return false;
}

function variantesConFoto(item: any): string[] {
    const nombres: string[] = [];
    for (const grupo of (item.variantes || [])) {
        for (const opcion of (grupo.opciones || [])) {
            if (opcion.imagenUrl && opcion.imagenUrl.trim() !== "") nombres.push(opcion.nombre);
        }
    }
    return nombres;
}

function buscarFotoEnCatalogo(catalogo: any[], texto: string): string | null {
    const limpio = normalizarTexto(texto);
    for (const cat of catalogo) {
        for (const item of (cat.items || [])) {
            for (const grupo of (item.variantes || [])) {
                for (const opcion of (grupo.opciones || [])) {
                    const nombreOp = normalizarTexto(opcion.nombre || "");
                    if (nombreOp && limpio.includes(nombreOp) && opcion.imagenUrl?.trim()) return opcion.imagenUrl;
                }
            }
            const nombreItem = normalizarTexto(item.nombre || "");
            if (nombreItem && limpio.includes(nombreItem) && item.imagenPrincipal?.trim()) return item.imagenPrincipal;
        }
    }
    return null;
}

function esIntencionCompra(msg: string): boolean {
    const limpio = msg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const frases = [
        "quiero comprar","la quiero","lo quiero","las quiero","los quiero",
        "me la llevo","me lo llevo","me las llevo","me los llevo",
        "si quiero","si la quiero","si lo quiero","quiero las dos","quiero los dos",
        "quiero ambas","quiero ambos","como la pido","como lo pido","como pido",
        "va la llevo","dale la compro","si la compro","si lo compro",
        "quiero pedir","quiero ordenar","la pido","lo pido",
        "estoy interesado","listo procedemos","dale procedemos","si procedemos",
        "quiero proceder","si quiero proceder"
    ];
    return frases.some(f => limpio.includes(f));
}

function yaHuboVentaEnHistorial(historial: any[]): boolean {
    return historial.some((m: any) =>
        m.role === 'assistant' && (m.content || "").includes("pedido quedo registrado")
    );
}

function clientePideFotoExplicita(msg: string): boolean {
    const limpio = msg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const frases = ["ver foto","muestrame","manda foto","envia foto","quiero ver","dejame ver",
        "puedo ver","como es","como luce","se ve","foto por fa","foto porfavor",
        "foto por favor","foto porfa","la foto","su foto","una foto","imagen","fotito"];
    return frases.some(f => limpio.includes(f));
}

function armarResumenCompra(catalogo: any[], historial: any[], mensajeActual: string): { resumen: string, total: string } {
    const todosLosMensajes = [...historial.map((m: any) => m.content), mensajeActual].join(" ");
    const limpio = normalizarTexto(todosLosMensajes);
    let productosEncontrados: { nombre: string, opcion: string, precio: string }[] = [];
    for (const cat of catalogo) {
        for (const item of (cat.items || [])) {
            const nombreItem = normalizarTexto(item.nombre || "");
            if (!nombreItem || !limpio.includes(nombreItem)) continue;
            if (item.variantes && item.variantes.length > 0) {
                if (limpio.includes("las dos") || limpio.includes("los dos") || limpio.includes("ambas") || limpio.includes("ambos")) {
                    for (const grupo of item.variantes) {
                        for (const opcion of (grupo.opciones || [])) {
                            productosEncontrados.push({ nombre: item.nombre, opcion: opcion.nombre, precio: item.precio });
                        }
                    }
                } else {
                    for (const grupo of item.variantes) {
                        for (const opcion of (grupo.opciones || [])) {
                            const nombreOp = normalizarTexto(opcion.nombre || "");
                            if (nombreOp && limpio.includes(nombreOp)) {
                                productosEncontrados.push({ nombre: item.nombre, opcion: opcion.nombre, precio: item.precio });
                            }
                        }
                    }
                }
            } else {
                productosEncontrados.push({ nombre: item.nombre, opcion: "", precio: item.precio });
            }
        }
    }
    if (productosEncontrados.length === 0) return { resumen: "Producto por confirmar", total: "Por confirmar" };
    const resumen = productosEncontrados.map(p => p.opcion ? `${p.nombre} (${p.opcion})` : p.nombre).join(" + ");
    let totalNum = 0;
    productosEncontrados.forEach(p => { const n = parseInt(p.precio?.replace(/[^0-9]/g, '')); if (!isNaN(n)) totalNum += n; });
    return { resumen, total: totalNum > 0 ? `$${totalNum}` : "Por confirmar" };
}

function clienteNombroVariante(msg: string, catalogo: any[]): boolean {
    const limpio = normalizarTexto(msg);
    for (const cat of catalogo) {
        for (const item of (cat.items || [])) {
            for (const grupo of (item.variantes || [])) {
                for (const opcion of (grupo.opciones || [])) {
                    const nombreOp = normalizarTexto(opcion.nombre || "");
                    if (nombreOp && limpio.includes(nombreOp)) return true;
                }
            }
        }
    }
    return false;
}

function obtenerProductoConVariantesDelContexto(historial: any[], catalogo: any[]): any | null {
    const todosLosMsgs = historial.map((m: any) => m.content).join(" ");
    const limpio = normalizarTexto(todosLosMsgs);
    for (const cat of catalogo) {
        for (const item of (cat.items || [])) {
            if (item.variantes && item.variantes.length > 0) {
                const nombreItem = normalizarTexto(item.nombre || "");
                if (nombreItem && limpio.includes(nombreItem)) return item;
            }
        }
    }
    return null;
}

function tieneFechaYHora(texto: string): boolean {
    const limpio = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const tieneFecha = /\d{1,2}\s*(de\s*)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/.test(limpio)
        || /\d{1,2}[\/\-]\d{1,2}/.test(limpio)
        || /(lunes|martes|miercoles|jueves|viernes|sabado|domingo|manana|hoy|pasado\s*manana)/.test(limpio);
    const tieneHora = /\d{1,2}\s*(:|\s)?\s*\d{0,2}\s*(am|pm|a\.m|p\.m|de la manana|de la tarde|de la noche)/.test(limpio)
        || /a\s*las\s*\d{1,2}/.test(limpio)
        || /\d{1,2}\s*:\s*\d{2}/.test(limpio);
    return tieneFecha && tieneHora;
}

function detectarCampana(msg: string, campanas: any[]): any | null {
    if (!campanas || campanas.length === 0) return null;
    const limpio = normalizarTexto(msg);
    for (const c of campanas) {
        if (c.vigencia === "EXPIRADO") continue;
        const clave = normalizarTexto(c.palabraClave || "");
        if (clave && limpio.includes(clave)) return c;
    }
    for (const c of campanas) {
        if (c.vigencia !== "EXPIRADO") continue;
        const clave = normalizarTexto(c.palabraClave || "");
        if (clave && limpio.includes(clave)) return { ...c, _expirada: true };
    }
    return null;
}

function ultimoMsgFueRedes(historial: any[]): boolean {
    if (historial.length === 0) return false;
    const ultimo = historial[historial.length - 1];
    if (ultimo.role !== 'assistant') return false;
    const contenido = (ultimo.content || "").toLowerCase();
    return contenido.includes("instagram") || contenido.includes("tiktok") ||
        contenido.includes("facebook") || contenido.includes("trabajos") ||
        contenido.includes("portafolio");
}

function limpiarNumeroAdmin(texto: string, adminNum: string): string {
    if (!adminNum) return texto;
    const numLimpio = adminNum.replace(/[^0-9]/g, '');
    if (!numLimpio || numLimpio.length < 7) return texto;
    let resultado = texto;
    resultado = resultado.replace(new RegExp(numLimpio, 'g'), '[NUMERO OCULTO]');
    resultado = resultado.replace(new RegExp(`\\+?\\d{1,3}\\s*${numLimpio.slice(-10)}`, 'g'), '[NUMERO OCULTO]');
    if (resultado.includes('[NUMERO OCULTO]')) {
        resultado = resultado.replace(/\[NUMERO OCULTO\]/g, '').trim();
        if (!resultado || resultado.length < 3) resultado = "Para mas info, contacta a nuestro equipo de atencion.";
    }
    return resultado;
}

async function respuestaTextoRecovery(systemPrompt: string, historial: any[], body: string, instruccionExtra: string, adminIdRaw: string): Promise<string> {
    try {
        const msgs = [
            { role: "system", content: systemPrompt },
            ...historial.map((m: any) => ({ role: m.role, content: m.content })),
            { role: "user", content: body },
            { role: "system", content: instruccionExtra }
        ];
        const comp = await openai.chat.completions.create({ model: "gpt-3.5-turbo", messages: msgs as any });
        const txt = comp.choices[0].message.content || "En que te puedo ayudar?";
        return limpiarNumeroAdmin(txt.replace(/\[[^\]]*\]/g, "").trim(), adminIdRaw);
    } catch (e) { return "En que mas te puedo ayudar?"; }
}

// ============================================
// GUARDAR VENTA EN SUBCOLECCION
// ============================================
async function registrarVentaEnFirestore(
    empresaRef: FirebaseFirestore.DocumentReference,
    clienteId: string,
    profileName: string,
    resumen: string,
    total: string
) {
    try {
        await empresaRef.collection('ventas').add({
            clienteId,
            clienteNombre: profileName,
            resumen,
            total,
            fecha: admin.firestore.FieldValue.serverTimestamp(),
            timestamp: new Date().toISOString(),
            estado: 'pendiente', // pendiente, confirmada, cancelada
        });
        console.log("[VENTA] Registrada en Firestore:", resumen, total);
    } catch (e: any) {
        console.error("[VENTA] Error al registrar:", e.message);
    }
}

// ============================================
// ANALIZAR COMPORTAMIENTO DE CLIENTE
// ============================================
function analizarComportamientoCliente(messages: any[]): string {
    if (!messages || messages.length === 0) return "sin mensajes";
    const msgsCliente = messages.filter((m: any) => m.role === 'user').map((m: any) => m.content || "");

    // Detectar groserías
    const groseriasKeywords = ["mierda","hijueputa","gonorrea","puta","idiota","imbecil","estupido","malparido","marica","hp","hpta"];
    const fueGrosero = msgsCliente.some(msg => {
        const limpio = msg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return groseriasKeywords.some(g => limpio.includes(g));
    });

    // Detectar interés
    const interesKeywords = ["interesado","quiero","necesito","cuanto","precio","como funciona","disponible","cuando","reserva","comprar"];
    const mostroInteres = msgsCliente.some(msg => {
        const limpio = msg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return interesKeywords.some(k => limpio.includes(k));
    });

    // Detectar si compró
    const compro = messages.some((m: any) => m.role === 'assistant' && (m.content || "").includes("pedido quedo registrado"));

    let comportamiento = "";
    if (fueGrosero) comportamiento += "⚠️ Cliente fue GROSERO. ";
    if (compro) comportamiento += "✅ COMPRO. ";
    else if (mostroInteres) comportamiento += "👀 Mostro interes pero no cerro. ";
    else comportamiento += "❓ Solo preguntó, no mostró interes claro. ";

    return comportamiento.trim();
}

// ============================================
// WEBHOOK PRINCIPAL
// ============================================
export async function POST(req: NextRequest) {
    console.log("\n========== NUEVA PETICION ==========");
    try {
        let formData;
        try { formData = await req.formData(); }
        catch (e) { return NextResponse.json({ error: "formData error" }, { status: 400 }); }

        const from = formData.get('From') as string;
        const to = formData.get('To') as string;
        const body = formData.get('Body') as string;
        const mediaUrl0 = formData.get('MediaUrl0') as string | null;
const mediaType0 = formData.get('MediaContentType0') as string | null;
const numMedia = parseInt(formData.get('NumMedia') as string || '0');
        const profileName = formData.get('ProfileName') as string;

        console.log(`[IN] ${profileName}: "${body}"`);
        if (!from || !to) return NextResponse.json({ error: "Faltan campos" }, { status: 400 });

        const botId = to.replace('whatsapp:', '').replace(/\s+/g, '');
        const clienteId = from.replace('whatsapp:', '').replace(/\s+/g, '');
        const requestHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
        const protocol = req.headers.get('x-forwarded-proto') || 'https';
        const baseUrl = `${protocol}://${requestHost}`;

        const empresaRef = db.collection('empresas').doc(botId);
        const empresaDoc = await empresaRef.get();
        if (!empresaDoc.exists) return NextResponse.json({ ok: true });

        const empresaData = empresaDoc.data();
        console.log("Empresa:", empresaData?.nombre);

        const adminIdRaw = (empresaData?.telefonoAdmin || "").replace(/[^0-9]/g, '');
        const clienteIdRaw = clienteId.replace(/[^0-9]/g, '');

        function numerosCoinciden(a: string, b: string): boolean {
            if (!a || !b) return false;
            if (a === b) return true;
            const sufA = a.slice(-10);
            const sufB = b.slice(-10);
            return sufA === sufB && sufA.length === 10;
        }

        const esElDueno = numerosCoinciden(adminIdRaw, clienteIdRaw);

        // ==========================================
        // VERIFICAR LIMITES
        // ==========================================
        const verificacion = await verificarLimites(botId, esElDueno);
        if (!verificacion.permitido) {
            console.log(`[BLOQUEADO] Motivo: ${verificacion.motivo}`);
            let mensajeBloqueo = '';
            switch (verificacion.motivo) {
                case 'trial_expirado': mensajeBloqueo = 'Gracias por tu interes. Nuestro servicio de atencion automatica esta en mantenimiento. Por favor intenta mas tarde o contactanos directamente.'; break;
                case 'limite_bot': mensajeBloqueo = 'Gracias por escribirnos. En este momento no podemos atenderte automaticamente. Por favor intenta mas tarde.'; break;
                case 'limite_jefe': mensajeBloqueo = 'Has alcanzado el limite de mensajes de tu plan. Actualiza tu plan desde la app Sloty para continuar.'; break;
            }
            if (mensajeBloqueo) {
                try { await twilioClient.messages.create({ from: to, to: from, body: mensajeBloqueo }); }
                catch (e) { console.error("[BLOQUEADO] Error enviando:", e); }
            }
            return NextResponse.json({ ok: true, blocked: true });
        }

        // ==========================================
        // MODO JEFE — Completo, amigable y con ventas reales
        // ==========================================
        if (esElDueno) {
            console.log("[MODO JEFE]");

            // Cargar ventas reales de Firestore
            let resumenVentas = "";
            try {
                const ventasSnap = await empresaRef.collection('ventas')
                    .orderBy('fecha', 'desc')
                    .limit(20)
                    .get();

                if (ventasSnap.empty) {
                    resumenVentas = "Sin ventas registradas aun.";
                } else {
                    const ventasList = ventasSnap.docs.map(doc => {
                        const v = doc.data();
                        const fecha = v.timestamp ? new Date(v.timestamp).toLocaleDateString('es-CO') : 'Fecha desconocida';
                        return `- ${v.clienteNombre || 'Cliente'} compró: ${v.resumen} por ${v.total} (${fecha}) [${v.estado || 'pendiente'}]`;
                    });
                    const totalVentas = ventasSnap.docs.reduce((sum, doc) => {
                        const t = doc.data().total || '';
                        const num = parseInt(t.replace(/[^0-9]/g, ''));
                        return isNaN(num) ? sum : sum + num;
                    }, 0);
                    resumenVentas = ventasList.join('\n');
                    if (totalVentas > 0) resumenVentas += `\n\nTOTAL ACUMULADO: $${totalVentas.toLocaleString('es-CO')}`;
                }
            } catch (e: any) {
                resumenVentas = "Error cargando ventas: " + e.message;
            }

            // Cargar chats recientes con análisis de comportamiento
            let resumenChats = "";
            try {
                const chatsSnapshot = await empresaRef.collection('chats')
                    .orderBy('lastUpdate', 'desc')
                    .limit(15)
                    .get();

                if (!chatsSnapshot.empty) {
                    resumenChats = chatsSnapshot.docs.map(doc => {
                        const d = doc.data();
                        const msgs = (d.messages || []);
                        const ultimoMsgCliente = msgs.filter((m: any) => m.role === 'user').slice(-1)[0]?.content || "sin mensaje";
                        const comportamiento = analizarComportamientoCliente(msgs);
                        const campanaInfo = d.campanaPendiente ? ` [llegó por campaña: ${d.campanaPendiente.palabraClave}]` : "";
                        const modoHumano = d.modo_humano ? " [MODO HUMANO ACTIVO - esperando respuesta tuya]" : "";
                        const unread = d.unread ? " 🔴 NO LEÍDO" : "";
                        return `👤 ${d.profileName || 'Desconocido'} (${doc.id})${campanaInfo}${modoHumano}${unread}
   Comportamiento: ${comportamiento}
   Último mensaje: "${ultimoMsgCliente}"
   Total mensajes: ${msgs.length}`;
                    }).join('\n\n');
                } else {
                    resumenChats = "Aún no hay chats con clientes.";
                }
            } catch (e: any) {
                resumenChats = "Error cargando chats.";
            }

            // Catálogo actual
            const catalogoResumen = (empresaData?.catalogo || []).map((cat: any) =>
                `${cat.nombre}: ${(cat.items || []).map((i: any) => {
                    const precio = i.tipoPrecio === 'cotizar' ? 'A cotizar' : `$${i.precio}`;
                    return `${i.nombre} (${precio})`;
                }).join(', ')}`
            ).join('\n') || "Sin productos configurados.";

            const systemJefe = `Eres el asistente personal del DUEÑO de "${empresaData?.nombre}". Tu trabajo es ser su mano derecha.

PERSONALIDAD: Eres como un socio de confianza. Hablas de forma directa, amigable y clara. Usas emojis con moderación. Tratas al dueño de tú, con confianza. Le dices todo sin filtros: clientes groseros, ventas perdidas, lo que sea.

CAPACIDADES:
- Respondes sobre ventas reales, clientes, comportamientos, estadísticas
- Das recomendaciones basadas en los datos que tienes
- Si pregunta algo que no está en los datos, lo dices claramente

REGLAS:
- Máximo 200 palabras por respuesta. Sé directo pero completo.
- Sin rodeos. Si no hubo ventas, lo dices. Si un cliente fue grosero, lo dices.
- Siempre en español

═══════════════════════════════
CATÁLOGO ACTUAL:
${catalogoResumen}

MEDIOS DE PAGO: ${empresaData?.mediosPago?.join(', ') || 'No configurados'}

═══════════════════════════════
VENTAS CONFIRMADAS (registradas cuando el bot cerró una venta):
${resumenVentas}

═══════════════════════════════
CLIENTES RECIENTES (últimos 15):
${resumenChats}`;

            try {
                const completion = await openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    messages: [
                        { role: "system", content: systemJefe },
                        { role: "user", content: body }
                    ],
                    max_tokens: 500,
                });
                const respuesta = completion.choices[0].message.content || "Ok";
                await twilioClient.messages.create({ from: to, to: from, body: respuesta });
                return NextResponse.json({ success: true });
            } catch (e: any) {
                console.error("[JEFE] Error IA:", e.message);
                return NextResponse.json({ error: "Error jefe" }, { status: 500 });
            }
        }

        // ==========================================
        // MODO CLIENTE
        // ==========================================
        const chatRef = empresaRef.collection('chats').doc(clienteId);
        const chatDoc = await chatRef.get();

        let modoHumanoActivo = chatDoc.exists && chatDoc.data()?.modo_humano === true;
        if (modoHumanoActivo) {
            const esModoHumanoManual = chatDoc.data()?.modo_humano_manual === true;
            if (esModoHumanoManual) {
                const lastUpdate = chatDoc.data()?.lastUpdate?.toDate();
                const diff = lastUpdate ? (new Date().getTime() - lastUpdate.getTime()) / 60000 : 999;
                if (diff > 30) {
                    await chatRef.update({ modo_humano: false, modo_humano_manual: false });
                    modoHumanoActivo = false;
                }
            }
            if (modoHumanoActivo) {
                console.log("[HUMANO ACTIVO] Guardando msg sin responder");
                await chatRef.set({
                    profileName,
                    messages: admin.firestore.FieldValue.arrayUnion({ role: 'user', content: body, timestamp: new Date().toISOString() }),
                    lastMsg: body, lastUpdate: admin.firestore.FieldValue.serverTimestamp(), unread: true
                }, { merge: true });
                return NextResponse.json({ success: true });
            }
        }

        // Historial aumentado a 12 para mantener mejor contexto
        let historial: any[] = [];
        if (chatDoc.exists) historial = (chatDoc.data()?.messages || []).slice(-12);
        console.log("Historial:", historial.length, "msgs");

        const catalogo = empresaData?.catalogo || [];
        const systemPrompt = empresaData?.systemPrompt || "Se breve y amable.";
        const campanas = empresaData?.campanas || [];

        const catalogoActualizado = generarResumenCatalogoActual(catalogo);
        console.log("[CATALOGO] Productos frescos cargados:", catalogo.reduce((acc: number, c: any) => acc + (c.items?.length || 0), 0));

        // ==========================================
        // INTERCEPTOR 1: Sin historial → pedir nombre
        // ==========================================
        if (historial.length === 0) {
            const campanaDetectada = detectarCampana(body, campanas);
            if (campanaDetectada) {
                console.log("[INTERCEPTOR] Campana detectada en primer mensaje:", campanaDetectada.palabraClave);
                const bienvenida = empresaData?.mensajeBienvenida || "";
                let textoRespuesta = campanaDetectada._expirada
                    ? `${bienvenida ? bienvenida + " " : "Hola! "}Esa promocion ya no esta vigente, pero tenemos mas cosas para ti. Como te llamas?`
                    : `${bienvenida ? bienvenida + " " : "Hola! "}Que bueno que llegaste por "${campanaDetectada.palabraClave}". Para atenderte mejor, como te llamas?`;

                await twilioClient.messages.create({ from: to, to: from, body: textoRespuesta });
                if (!campanaDetectada._expirada && adminIdRaw) {
                    const notifAdmin = `NUEVO LEAD POR CAMPANA!\nCampana: "${campanaDetectada.palabraClave}"\nCliente: ${profileName}\nTel: ${clienteId}`;
                    try { await twilioClient.messages.create({ from: to, to: `whatsapp:+${adminIdRaw}`, body: notifAdmin }); }
                    catch (e) { try { await twilioClient.messages.create({ from: to, to: `whatsapp:${adminIdRaw}`, body: notifAdmin }); } catch (e2) { } }
                }
                await chatRef.set({
                    profileName,
                    messages: admin.firestore.FieldValue.arrayUnion(
                        { role: 'user', content: body, timestamp: new Date().toISOString() },
                        { role: 'assistant', content: textoRespuesta, timestamp: new Date().toISOString() }
                    ),
                    lastMsg: textoRespuesta, lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
                    modo_humano: false, unread: true,
                    campanaPendiente: campanaDetectada._expirada ? null : {
                        palabraClave: campanaDetectada.palabraClave,
                        contexto: campanaDetectada.contexto,
                        vigencia: campanaDetectada.vigencia
                    }
                }, { merge: true });
                return NextResponse.json({ success: true });
            }

            const bienvenida = empresaData?.mensajeBienvenida || "";
            const textoRespuesta = bienvenida ? `${bienvenida} Como te llamas?` : "Hola! Como te llamas?";
            await twilioClient.messages.create({ from: to, to: from, body: textoRespuesta });
            await guardarHistorial(chatRef, body, textoRespuesta, profileName, false, false);
            return NextResponse.json({ success: true });
        }

        // ==========================================
        // INTERCEPTOR 1.5: Campana pendiente
        // ==========================================
        if (historial.length === 2) {
            const chatData = chatDoc.exists ? chatDoc.data() : null;
            const campanaPendiente = chatData?.campanaPendiente;
            if (campanaPendiente) {
                const nombreCliente = body.trim();
                const textoRespuesta = `Hola ${nombreCliente}! ${campanaPendiente.contexto}. Te interesa?`;
                await twilioClient.messages.create({ from: to, to: from, body: textoRespuesta });
                await chatRef.update({
                    messages: admin.firestore.FieldValue.arrayUnion(
                        { role: 'user', content: body, timestamp: new Date().toISOString() },
                        { role: 'assistant', content: textoRespuesta, timestamp: new Date().toISOString() }
                    ),
                    lastMsg: textoRespuesta, lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
                    campanaPendiente: admin.firestore.FieldValue.delete()
                });
                return NextResponse.json({ success: true });
            }
        }

        // ==========================================
        // INTERCEPTOR: Campana en cualquier momento
        // ==========================================
        const campanaEnMensaje = detectarCampana(body, campanas);
        if (campanaEnMensaje && historial.length >= 2) {
            if (campanaEnMensaje._expirada) {
                const txt = "Esa promocion ya no esta vigente. Pero puedo ayudarte con lo que tenemos disponible.";
                await twilioClient.messages.create({ from: to, to: from, body: txt });
                await guardarHistorial(chatRef, body, txt, profileName, false, false);
            } else {
                const txt = `${campanaEnMensaje.contexto}. Te interesa?`;
                await twilioClient.messages.create({ from: to, to: from, body: txt });
                await guardarHistorial(chatRef, body, txt, profileName, false, false);
            }
            return NextResponse.json({ success: true });
        }

        // ==========================================
        // INTERCEPTOR VENTA: Si ya hubo venta, solo guarda
        // ==========================================
        if (yaHuboVentaEnHistorial(historial)) {
            console.log("[VENTA PREVIA] Chat tiene venta confirmada, guardando sin responder");
            await chatRef.set({
                profileName,
                messages: admin.firestore.FieldValue.arrayUnion({ role: 'user', content: body, timestamp: new Date().toISOString() }),
                lastMsg: body, lastUpdate: admin.firestore.FieldValue.serverTimestamp(), unread: true
            }, { merge: true });
            return NextResponse.json({ success: true });
        }

        // ==========================================
        // DETECCION ANTICIPADA DE FOTO
        // ==========================================
        const todosTextos = [...historial.map((m: any) => m.content), body].join(" ");
        const productoActual = obtenerProductoDelContexto(todosTextos, catalogo);
        const productoActualTieneFoto = productoActual ? itemTieneFoto(productoActual) : null;

        console.log("[PRE-IA] Producto en contexto:", productoActual?.nombre || "ninguno");
        console.log("[PRE-IA] Tiene foto:", productoActualTieneFoto);

        const clientePidioFoto = clientePideFotoExplicita(body);
        console.log("[PRE-IA] Cliente pidio foto:", clientePidioFoto);

        let instruccionFotoExtra = "";
        if (productoActual && productoActualTieneFoto === false) {
            instruccionFotoExtra = `\n\nALERTA CRITICA: El producto "${productoActual.nombre}" NO TIENE NINGUNA FOTO. JAMAS llames enviar_foto ni ofrezcas foto. Describe con palabras.`;
        } else if (!clientePidioFoto) {
            instruccionFotoExtra = `\n\nIMPORTANTE: El cliente NO ha pedido foto. NO llames enviar_foto. NO ofrezcas fotos. Describe con palabras primero.`;
        }

        // ==========================================
        // PREPARAR MENSAJES PARA LA IA
        // ==========================================
        // Usamos el historial completo (12 msgs) para que la IA tenga contexto
        const mensajesParaIA: any[] = [
            { role: "system", content: systemPrompt + instruccionFotoExtra },
            ...historial.map((m: any) => ({ role: m.role, content: m.content })),
            {
                role: "system",
                content: `CATALOGO ACTUALIZADO (fuente de verdad):
${catalogoActualizado}

RECORDATORIO:
- Nombra PRODUCTOS al responder, no categorias.
- Entiende el CONTEXTO COMPLETO de la conversacion: si el cliente mencionó que vende gorras, necesita una web para e-commerce, etc.
- Si el cliente quiere COMPRAR -> llama notificar_pedido_completo DE INMEDIATO.
- Si el cliente dice "si", "dale", "listo", "perfecto", "de una" tras hablar de un producto -> es compra.
- NO envies foto a menos que el cliente la haya pedido explicitamente.
- NUNCA inventes productos ni opciones.
- Recuerda toda la conversacion: si el cliente ya dio contexto (su negocio, necesidades), usalo.`
            },
            { role: "user", content: body }
        ];

        const toolsDisponibles: any[] = [
            {
                type: "function", function: {
                    name: "notificar_pedido_completo",
                    description: "Usar cuando el cliente confirma que quiere COMPRAR.",
                    parameters: { type: "object", properties: { resumen_compra: { type: "string" }, valor_total: { type: "string" } }, required: ["resumen_compra", "valor_total"] }
                }
            },
            {
                type: "function", function: {
                    name: "notificar_reserva",
                    description: "Cliente confirma RESERVA. REQUIERE fecha y hora concretas.",
                    parameters: { type: "object", properties: { servicio: { type: "string" }, fecha_hora_tentativa: { type: "string" } }, required: ["servicio", "fecha_hora_tentativa"] }
                }
            },
        ];

        const toolEnviarFoto = {
            type: "function", function: {
                name: "enviar_foto",
                description: "Enviar imagen de un producto. SOLO cuando el cliente pidio VER la foto explicitamente Y hay URL real.",
                parameters: {
                    type: "object",
                    properties: {
                        url_imagen: { type: "string" },
                        mensaje_acompañante: { type: "string" }
                    },
                    required: ["url_imagen", "mensaje_acompañante"]
                }
            }
        };

        if ((productoActualTieneFoto === true || productoActualTieneFoto === null) && (clientePidioFoto || productoActualTieneFoto === null)) {
            toolsDisponibles.push(toolEnviarFoto);
        }

        let completion;
        try {
            completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: mensajesParaIA,
                tools: toolsDisponibles,
                tool_choice: "auto"
            });
        } catch (e: any) {
            console.error("[AI] Error:", e.message);
            try { await twilioClient.messages.create({ from: to, to: from, body: "Disculpa, tuve un problema. Intenta de nuevo." }); } catch (te) { }
            return NextResponse.json({ error: "Error OpenAI" }, { status: 500 });
        }

        const respuestaIA = completion.choices[0].message;
        console.log("[AI] Content:", respuestaIA.content || "(tool call)");
        console.log("[AI] Tools:", respuestaIA.tool_calls?.length || 0);

        const enviarFotoPorProxy = async (firebaseUrl: string, caption: string) => {
            const proxyUrl = buildProxyUrl(firebaseUrl, baseUrl);
            try { await twilioClient.messages.create({ from: to, to: from, body: caption, mediaUrl: [proxyUrl] }); }
            catch (e: any) { await twilioClient.messages.create({ from: to, to: from, body: `${caption}\n\nVer imagen: ${firebaseUrl}` }); }
        };

        const notificarAdmin = async (texto: string) => {
            if (!adminIdRaw) return;
            try { await twilioClient.messages.create({ from: to, to: `whatsapp:+${adminIdRaw}`, body: texto }); }
            catch (e) { try { await twilioClient.messages.create({ from: to, to: `whatsapp:${adminIdRaw}`, body: texto }); } catch (e2) { } }
        };

        // notificarVenta: activa modo humano Y guarda en colección ventas
        const notificarVenta = async (resumen: string, total: string) => {
            const msgCliente = `Listo! Tu pedido quedo registrado: ${resumen} por ${total}. Un asesor te contactara pronto para confirmar los detalles.`;
            await twilioClient.messages.create({ from: to, to: from, body: msgCliente });
            await notificarAdmin(`🎉 NUEVA VENTA!\nCliente: ${profileName}\nPedido: ${resumen}\nTotal: ${total}\nTel: ${clienteId}`);

            // ✅ GUARDAR VENTA EN SUBCOLECCION
            await registrarVentaEnFirestore(empresaRef, clienteId, profileName, resumen, total);

            // Activar modo humano para que el bot deje de responder
            await chatRef.set({
                profileName,
                messages: admin.firestore.FieldValue.arrayUnion(
                    { role: 'user', content: body, timestamp: new Date().toISOString() },
                    { role: 'assistant', content: msgCliente, timestamp: new Date().toISOString() }
                ),
                lastMsg: msgCliente,
                lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
                modo_humano: true,
                modo_humano_manual: false,
                unread: true,
                ventaConfirmada: true,
                resumenVenta: resumen,
                totalVenta: total,
            }, { merge: true });
            console.log("[VENTA] Modo humano activado + venta registrada");
        };

        // ==========================================
        // PROCESAR TOOL CALLS
        // ==========================================
        if (respuestaIA.tool_calls && respuestaIA.tool_calls.length > 0) {
            const toolCall = respuestaIA.tool_calls[0];
            const args = JSON.parse((toolCall as any).function.arguments);
            const name = (toolCall as any).function.name;
            console.log(`[TOOL] ${name}`, JSON.stringify(args).substring(0, 150));

            // ENVIAR FOTO
            if (name === "enviar_foto") {
                if (esIntencionCompra(body)) {
                    const { resumen, total } = armarResumenCompra(catalogo, historial, body);
                    await notificarVenta(resumen, total);
                    return NextResponse.json({ success: true });
                }

                if (!clientePidioFoto) {
                    console.log("[FOTO-BLOCK] Cliente no pidio foto explicitamente");
                    const txt = await respuestaTextoRecovery(systemPrompt, historial, body,
                        "El cliente NO pidio foto. Responde su mensaje con texto. NO envies ni ofrezcas foto.", adminIdRaw);
                    await twilioClient.messages.create({ from: to, to: from, body: txt });
                    await guardarHistorial(chatRef, body, txt, profileName, false, false);
                    return NextResponse.json({ success: true });
                }

                if (ultimoMsgFueRedes(historial)) {
                    const txt = await respuestaTextoRecovery(systemPrompt, historial, body,
                        "El cliente acaba de ver las redes. NO envies foto. Pregunta en que mas puedes ayudarle.", adminIdRaw);
                    await twilioClient.messages.create({ from: to, to: from, body: txt });
                    await guardarHistorial(chatRef, body, txt, profileName, false, false);
                    return NextResponse.json({ success: true });
                }

                const todosLosMsgsTexto = [...historial.map((m: any) => m.content), body].join(" ");
                const productoDetectado = obtenerProductoDelContexto(todosLosMsgsTexto, catalogo);

                if (productoDetectado && !itemTieneFoto(productoDetectado)) {
                    const txt = await respuestaTextoRecovery(systemPrompt, historial, body,
                        `"${productoDetectado.nombre}" no tiene fotos. Dile al cliente que no hay imagen disponible y describelo con palabras.`, adminIdRaw);
                    await twilioClient.messages.create({ from: to, to: from, body: txt });
                    await guardarHistorial(chatRef, body, txt, profileName, false, false);
                    return NextResponse.json({ success: true });
                }

                const productoConVariantes = obtenerProductoConVariantesDelContexto([...historial, { content: body }], catalogo);
                if (productoConVariantes && !clienteNombroVariante(body, catalogo)) {
                    const conFoto = variantesConFoto(productoConVariantes);
                    if (conFoto.length === 0) {
                        const todasOpciones = productoConVariantes.variantes.flatMap((g: any) => g.opciones.map((o: any) => o.nombre));
                        const txt = `No tenemos fotos disponibles, pero lo tenemos en ${todasOpciones.join(", ")}. Cual te interesa?`;
                        await twilioClient.messages.create({ from: to, to: from, body: txt });
                        await guardarHistorial(chatRef, body, txt, profileName, false, false);
                        return NextResponse.json({ success: true });
                    }
                    const txt = `Tenemos en ${conFoto.join(", ")}. Cual te gustaria ver?`;
                    await twilioClient.messages.create({ from: to, to: from, body: txt });
                    await guardarHistorial(chatRef, body, txt, profileName, false, false);
                    return NextResponse.json({ success: true });
                }

                const firebaseUrl = args.url_imagen;
                const caption = args.mensaje_acompañante || "Aqui tienes, que te parece?";
                const urlInvalida = !firebaseUrl || firebaseUrl.trim() === "" || firebaseUrl.toLowerCase() === "no"
                    || firebaseUrl.toLowerCase().includes("sin foto") || !firebaseUrl.startsWith("http");

                if (urlInvalida) {
                    if (productoDetectado) {
                        const fotoCorrecta = obtenerFotoDeProducto(productoDetectado);
                        if (fotoCorrecta) {
                            const cap = caption.includes("?") ? caption : caption + " Que te parece?";
                            await enviarFotoPorProxy(fotoCorrecta, cap);
                            await guardarHistorial(chatRef, body, `[FOTO: ${cap}]`, profileName, false, false);
                            return NextResponse.json({ success: true });
                        }
                    }
                    const txt = await respuestaTextoRecovery(systemPrompt, historial, body,
                        "No hay foto disponible. Dile al cliente que no tienes imagen y describelo con palabras.", adminIdRaw);
                    await twilioClient.messages.create({ from: to, to: from, body: txt });
                    await guardarHistorial(chatRef, body, txt, profileName, false, false);
                    return NextResponse.json({ success: true });
                }
const msgUsuario: any = {
  role: 'user',
  content: body || (numMedia > 0 ? '[Archivo multimedia]' : ''),
  timestamp: new Date().toISOString(),
};
if (mediaUrl0 && numMedia > 0) {
  msgUsuario.mediaUrl = mediaUrl0;
  msgUsuario.mediaType = mediaType0 || 'image/jpeg';
}
                if (productoDetectado && !urlEsDeProducto(firebaseUrl, productoDetectado)) {
                    const fotoCorrecta = obtenerFotoDeProducto(productoDetectado);
                    if (fotoCorrecta) {
                        const cap = caption.includes("?") ? caption : caption + " Que te parece?";
                        await enviarFotoPorProxy(fotoCorrecta, cap);
                        await guardarHistorial(chatRef, body, `[FOTO: ${cap}]`, profileName, false, false);
                        return NextResponse.json({ success: true });
                    }
                }

                let captionFinal = caption;
                if (!captionFinal.includes("?") && !captionFinal.includes("parece")) captionFinal += " Que te parece?";
                await enviarFotoPorProxy(firebaseUrl, captionFinal);
                await guardarHistorial(chatRef, body, `[FOTO: ${captionFinal}]`, profileName, false, false);
                return NextResponse.json({ success: true });
            }

            // NOTIFICAR RESERVA
            if (name === "notificar_reserva") {
                const todosLosMsgs = [...historial.map((m: any) => m.content), body].join(" ");
                const fechaHoraArgs = (args.fecha_hora_tentativa || "").toLowerCase();
                const fechaInvalida = !fechaHoraArgs || fechaHoraArgs.includes("pendiente")
                    || fechaHoraArgs.includes("confirmar") || fechaHoraArgs.includes("por definir")
                    || fechaHoraArgs.includes("fecha y hora") || fechaHoraArgs.length < 5;

                if (fechaInvalida && !tieneFechaYHora(todosLosMsgs)) {
                    const txt = "Genial! Para agendar tu reserva, que fecha te queda bien?";
                    await twilioClient.messages.create({ from: to, to: from, body: txt });
                    await guardarHistorial(chatRef, body, txt, profileName, false, false);
                    return NextResponse.json({ success: true });
                }

                const msg = `Reserva registrada: ${args.servicio} para ${args.fecha_hora_tentativa}. Te confirmaremos pronto.`;
                await twilioClient.messages.create({ from: to, to: from, body: msg });
                await notificarAdmin(`📅 NUEVA RESERVA!\nCliente: ${profileName}\nServicio: ${args.servicio}\nFecha: ${args.fecha_hora_tentativa}\nTel: ${clienteId}`);
                await guardarHistorial(chatRef, body, msg, profileName, true, false);
                return NextResponse.json({ success: true });
            }

            // NOTIFICAR PEDIDO COMPLETO
            if (name === "notificar_pedido_completo") {
                await notificarVenta(args.resumen_compra, args.valor_total);
                return NextResponse.json({ success: true });
            }

        } else {
            // RESPUESTA TEXTO normal
            let textoRespuesta = respuestaIA.content || "Entendido.";
            textoRespuesta = limpiarNumeroAdmin(textoRespuesta, adminIdRaw);

            if (clientePidioFoto && textoRespuesta.includes("[") && textoRespuesta.includes("]")) {
                if (!ultimoMsgFueRedes(historial)) {
                    const urlFoto = buscarFotoEnCatalogo(catalogo, textoRespuesta) || buscarFotoEnCatalogo(catalogo, body);
                    if (urlFoto) {
                        const todosTextosCheck = [...historial.map((m: any) => m.content), body].join(" ");
                        const prod = obtenerProductoDelContexto(todosTextosCheck, catalogo);
                        if (!prod || urlEsDeProducto(urlFoto, prod)) {
                            const captionLimpio = textoRespuesta.replace(/\[[^\]]*\]/g, "").trim() || "Aqui la tienes, que te parece?";
                            await enviarFotoPorProxy(urlFoto, captionLimpio);
                            await guardarHistorial(chatRef, body, `[FOTO: ${captionLimpio}]`, profileName, false, false);
                            return NextResponse.json({ success: true });
                        }
                    }
                }
                textoRespuesta = textoRespuesta.replace(/\[[^\]]*\]/g, "").trim() || "Entendido.";
            } else {
                textoRespuesta = textoRespuesta.replace(/\[[^\]]*\]/g, "").trim() || "Entendido.";
            }

            if (esIntencionCompra(body)) {
                const { resumen, total } = armarResumenCompra(catalogo, historial, body);
                await notificarVenta(resumen, total);
                return NextResponse.json({ success: true });
            }

            await twilioClient.messages.create({ from: to, to: from, body: textoRespuesta });
            await guardarHistorial(chatRef, body, textoRespuesta, profileName, false, false);
        }

        console.log("========== FIN ==========\n");
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("[FATAL]:", error.message);
        return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
}

async function guardarHistorial(chatRef: any, userMsg: string, botMsg: string, profileName: string, modoHumano: boolean, soloUser: boolean) {
    const nuevosMensajes = [{ role: 'user', content: userMsg, timestamp: new Date().toISOString() }];
    if (!soloUser && botMsg) nuevosMensajes.push({ role: 'assistant', content: botMsg, timestamp: new Date().toISOString() });
    await chatRef.set({
        profileName,
        messages: admin.firestore.FieldValue.arrayUnion(...nuevosMensajes),
        lastMsg: soloUser ? userMsg : botMsg,
        lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
        modo_humano: modoHumano,
        unread: true
    }, { merge: true });
}