import { NextRequest, NextResponse } from 'next/server';
import Twilio from 'twilio';
import OpenAI from 'openai';
import { db } from '@/lib/firebase';
import * as admin from 'firebase-admin';

const twilioClient = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const TEMPLATE_VENTA_SID = "HX8bbcff99b729ac2b2beee37ea13a51c0"; 

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const body = formData.get('Body') as string;
    const profileName = formData.get('ProfileName') as string;

    const botId = to.replace('whatsapp:', '').replace(/\s+/g, ''); 
    const clienteId = from.replace('whatsapp:', '').replace(/\s+/g, '');

    const empresaRef = db.collection('empresas').doc(botId);
    const empresaDoc = await empresaRef.get();
    if (!empresaDoc.exists) return NextResponse.json({ ok: true }); 
    const empresaData = empresaDoc.data();
    
    // ============================================================
    // 👑 MODO JEFE (BÚSQUEDA INTELIGENTE + NORMALIZACIÓN + FILTRO)
    // ============================================================
    const adminIdRaw = (empresaData?.telefonoAdmin || "").replace(/[^0-9]/g, '');
    const clienteIdRaw = clienteId.replace(/[^0-9]/g, '');
    const esElDueno = (adminIdRaw && clienteIdRaw) && (adminIdRaw === clienteIdRaw);

    if (esElDueno) {
        console.log(`👑 JEFE solicita: ${body}`);
        
        // 1. NORMALIZACIÓN TOTAL
        const texto = body.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const chatJefeRef = empresaRef.collection('chats').doc(clienteId);

        // --- CASO A: REPORTE FINANCIERO ---
        if (texto.includes("ventas") || texto.includes("resumen") || texto.includes("como vamos") || texto.includes("hoy") || texto.includes("reporte") || texto.includes("dinero")) {
            
            const hoyInicio = new Date();
            hoyInicio.setHours(0,0,0,0); 
            
            const ventasSnapshot = await empresaRef.collection('ventas').where('fecha', '>=', hoyInicio).get();
            let listaVentas = "", conteoVentas = 0, sumaTotal = 0;
            
            if (ventasSnapshot.empty) listaVentas = "• No hay ventas hoy.";
            else {
                ventasSnapshot.forEach(doc => {
                    const v = doc.data();
                    conteoVentas++;
                    const val = parseFloat((v.valor || "0").toString().replace(/[^0-9]/g, '')) || 0;
                    sumaTotal += val;
                    listaVentas += `• ${v.cliente}: ${v.resumen} ($${val.toLocaleString()})\n`;
                });
            }

            const reporte = `📊 *REPORTE DIARIO*\n\n💰 *Ventas:* ${conteoVentas}\n💵 *Total:* $${sumaTotal.toLocaleString('es-CO')}\n\n📝 *Detalle:*\n${listaVentas}`;
            await twilioClient.messages.create({ from: to, to: from, body: reporte });
            await guardarHistorial(chatJefeRef, body, reporte, "Jefe", false, false);
        
        // --- CASO B: BUSCADOR DE DATOS INTELIGENTE ---
        } else if (
            texto.includes("buscar") || texto.includes("cliente") || texto.includes("datos") || 
            texto.includes("quien") || texto.includes("info") || texto.includes("numero") || 
            texto.includes("telefono") || texto.includes("celular") || texto.includes("contacto") || 
            texto.includes("dame") || texto.includes("tienes") || texto.includes("ver") || 
            texto.includes("necesito") || texto.includes("pasame") || texto.includes("pasa") || 
            texto.includes("envia") || texto.includes("compro") || texto.includes("pago") || texto.includes("valor")
        ) {
            
            // 2. Extracción del término
            let termino = texto.replace(/buscar|cliente|datos|dame|el|la|los|las|de|quien|es|info|numero|telefono|celular|contacto|tienes|un|ver|necesito|pasame|pasa|envia|compro|pago|valor|a|por|favor|comparteme/gi, '').trim();
            
            let informe = "";
            let encontrados = false;

            // 3. LÓGICA "ESE CLIENTE" / "EL ÚLTIMO"
            const esReferenciaUltimo = termino.length < 2 || termino.includes("ese") || termino.includes("este") || termino.includes("ultimo") || termino.includes("anterior");

            if (esReferenciaUltimo) {
                // Prioridad 1: Última venta
                const lastVentaSnapshot = await empresaRef.collection('ventas').orderBy('fecha', 'desc').limit(1).get();
                if (!lastVentaSnapshot.empty) {
                    const v = lastVentaSnapshot.docs[0].data();
                    const numVenta = (v.telefono || "").replace(/[^0-9]/g,'');
                    informe = `📌 *ÚLTIMO CLIENTE (Venta Reciente):*\n\n👤 ${v.cliente}\n📱 +${numVenta}\n🔗 wa.me/${numVenta}\n📦 ${v.resumen} ($${v.valor})`;
                    encontrados = true;
                } 
                
                // Prioridad 2: Último chat activo (EXCLUYENDO AL JEFE)
                if (!encontrados) { 
                    const lastChatSnapshot = await empresaRef.collection('chats').orderBy('lastUpdate', 'desc').limit(5).get();
                    lastChatSnapshot.forEach(doc => {
                        const numChat = doc.id.replace(/[^0-9]/g,'');
                        // 🛡️ FILTRO DE SEGURIDAD: Si es el número del jefe, LO IGNORAMOS
                        if (!encontrados && numChat !== adminIdRaw) {
                            const d = doc.data();
                            informe = `📌 *ÚLTIMO CHAT ACTIVO:*\n\n👤 ${d.profileName || "Sin Nombre"}\n📱 +${numChat}\n🔗 wa.me/${numChat}\n💬 "${(d.lastMsg || "").substring(0, 50)}..."`;
                            encontrados = true;
                        }
                    });
                }
                
                if (!encontrados) informe = "❌ No encontré registros recientes de clientes (solo el tuyo).";

            } else {
                // 4. BÚSQUEDA ESPECÍFICA
                informe = `🔍 *Resultados para: "${termino}"*\n\n`;

                // Buscar en CHATS
                const chatsSnapshot = await empresaRef.collection('chats').orderBy('lastUpdate', 'desc').limit(50).get();
                let hitsChats = "";
                chatsSnapshot.forEach(doc => {
                    const numLimpio = doc.id.replace(/[^0-9]/g,''); 
                    
                    // 🛡️ FILTRO DE SEGURIDAD: Si es el chat del Jefe, NO LO MUESTRAS
                    if (numLimpio !== adminIdRaw) {
                        const d = doc.data();
                        const contenido = `${d.profileName || ""} ${doc.id} ${d.lastMsg || ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        
                        if (contenido.includes(termino)) {
                            encontrados = true;
                            hitsChats += `👤 *${d.profileName || "Sin Nombre"}*\n📱 +${numLimpio}\n🔗 wa.me/${numLimpio}\n\n`;
                        }
                    }
                });
                if (hitsChats) informe += `📂 *CHATS:*\n${hitsChats}`;

                // Buscar en VENTAS
                const ventasSnapshot = await empresaRef.collection('ventas').orderBy('fecha', 'desc').limit(50).get();
                let hitsVentas = "";
                ventasSnapshot.forEach(doc => {
                    const v = doc.data();
                    const contenidoVenta = `${v.cliente || ""} ${v.telefono || ""} ${v.resumen || ""} ${v.valor || ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    
                    if (contenidoVenta.includes(termino)) {
                        encontrados = true;
                        const fecha = v.fecha ? v.fecha.toDate().toLocaleDateString() : "N/A";
                        const numVenta = (v.telefono || "").replace(/[^0-9]/g,'');
                        hitsVentas += `💰 ${fecha}: ${v.cliente}\n📱 +${numVenta}\n🔗 wa.me/${numVenta}\n\n`;
                    }
                });
                if (hitsVentas) informe += `🛒 *VENTAS:*\n${hitsVentas}`;

                if (!encontrados) informe = `❌ No encontré datos para "${termino}".`;
            }

            // ENVIAR RESULTADO
            await twilioClient.messages.create({ from: to, to: from, body: informe });
            await guardarHistorial(chatJefeRef, body, informe, "Jefe", false, false);

        // --- CASO C: CHAT CONVERSACIONAL ---
        } else {
            const completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { 
                        role: "system", 
                        content: "Eres una interfaz de base de datos hablando con el DUEÑO. Responde brevemente." 
                    },
                    { role: "user", content: body }
                ]
            });
            const respuesta = completion.choices[0].message.content || "Entendido.";
            await twilioClient.messages.create({ from: to, to: from, body: respuesta });
            await guardarHistorial(chatJefeRef, body, respuesta, "Jefe", false, false);
        }

        return NextResponse.json({ success: true, mode: "boss_active" });
    }

    // ============================================================
    // 🧠 MODO CLIENTE (INTACTO)
    // ============================================================

    const chatRef = empresaRef.collection('chats').doc(clienteId);
    const chatDoc = await chatRef.get();
    
    // VERIFICAR MODO HUMANO
    let modoHumanoActivo = chatDoc.exists && chatDoc.data()?.modo_humano === true;
    if (modoHumanoActivo) {
        const lastUpdate = chatDoc.data()?.lastUpdate?.toDate();
        const diffMinutos = (new Date().getTime() - lastUpdate.getTime()) / 1000 / 60;
        if (diffMinutos > 30) {
            modoHumanoActivo = false;
            await chatRef.update({ modo_humano: false });
        } else {
            await guardarHistorial(chatRef, body, "", profileName, true, true);
            return NextResponse.json({ success: true, status: "silenced" });
        }
    }

    // CONTEXTO
    let historial: any[] = [];
    if (chatDoc.exists) historial = (chatDoc.data()?.messages || []).slice(-10);

    const mensajesParaIA = [
      { role: "system", content: empresaData?.systemPrompt || "Sé breve." },
      ...historial.map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: body }
    ];

    // [HERRAMIENTA: DEFINICIÓN ESTRICTA]
    const tools: any[] = [{
        type: "function",
        function: {
          name: "notificar_pedido_completo",
          description: "USAR SOLO SI: 1. Cliente dice explícitamente 'Quiero comprar', 'Pagar', 'Manda cuenta'. 2. Cliente pide 'Asesor', 'Humano'. \n⛔ PROHIBIDO SI: Pregunta info, precios, ver ejemplos.",
          parameters: {
            type: "object",
            properties: {
              tipo_accion: { type: "string", enum: ["SOLICITUD_ASESOR", "COMPRA_CONFIRMADA"] },
              resumen_compra: { type: "string" },
              valor_total: { type: "string", description: "Valor numérico." }
            },
            required: ["tipo_accion", "resumen_compra", "valor_total"]
          }
        }
    }];

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", 
      messages: mensajesParaIA as any,
      tools: tools,
      tool_choice: "auto",
    });

    const respuestaIA = completion.choices[0].message;

    // --- ACCIÓN: NOTIFICAR ---
    if (respuestaIA.tool_calls && respuestaIA.tool_calls.length > 0) {
        const toolCall = respuestaIA.tool_calls[0];
        const args = JSON.parse((toolCall as any).function.arguments);
        
        const textoCliente = `✅ Entendido. Estoy conectándote con un asesor humano para finalizar. Te escribirán en breve. 👤📲`;
        await twilioClient.messages.create({ from: to, to: from, body: textoCliente });
        await chatRef.set({ modo_humano: true, lastUpdate: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

        if (adminIdRaw) {
            const adminDestino = `whatsapp:${adminIdRaw}`; 
            const telClienteLimpio = clienteId.replace(/[^0-9]/g, '');
            const reporteJefe = `🚨 *NUEVO LEAD / VENTA* 🚨\n\n👤 *Cliente:* ${profileName}\n📱 *Tel:* +${telClienteLimpio}\n📦 *Interés:* ${args.resumen_compra}\n💰 *Valor:* ${args.valor_total || "N/A"}\n🔔 *Acción:* ${args.tipo_accion}`;

            try {
                await twilioClient.messages.create({ from: to, to: adminDestino, body: reporteJefe });
            } catch (e) {
                console.error("Error alerta jefe:", e);
            }
            
            await empresaRef.collection('ventas').add({
                tipo: args.tipo_accion,
                cliente: profileName,
                telefono: telClienteLimpio,
                resumen: args.resumen_compra,
                valor: args.valor_total,
                fecha: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        await guardarHistorial(chatRef, body, textoCliente, profileName, true, false);

    } else {
        const textoRespuesta = respuestaIA.content || "Entendido.";
        await twilioClient.messages.create({ from: to, to: from, body: textoRespuesta });
        await guardarHistorial(chatRef, body, textoRespuesta, profileName, false, false);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// Función auxiliar
async function guardarHistorial(chatRef: any, userMsg: string, botMsg: string, profileName: string, modoHumano: boolean, soloUser: boolean) {
    const nuevosMensajes = [{ role: 'user', content: userMsg, timestamp: new Date().toISOString() }];
    if (!soloUser && botMsg) {
        nuevosMensajes.push({ role: 'assistant', content: botMsg, timestamp: new Date().toISOString() });
    }
    await chatRef.set({
        profileName: profileName,
        messages: admin.firestore.FieldValue.arrayUnion(...nuevosMensajes),
        lastMsg: soloUser ? `📩 ${userMsg}` : `🤖 ${botMsg}`, 
        lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
        modo_humano: modoHumano,
        unread: true
    }, { merge: true });
}