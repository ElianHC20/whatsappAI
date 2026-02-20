import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import * as admin from 'firebase-admin';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const telefono = searchParams.get('telefono');
    if (!telefono) return NextResponse.json({ error: "Falta el teléfono" }, { status: 400 });
    const limpio = telefono.replace('whatsapp:', '').replace(/[^0-9+]/g, '');
    const variaciones = [limpio, limpio.startsWith('+') ? limpio.substring(1) : `+${limpio}`, `whatsapp:${limpio}`];
    try {
        for (const id of variaciones) {
            const doc = await db.collection('empresas').doc(id).get();
            if (doc.exists) return NextResponse.json(doc.data());
        }
        return NextResponse.json({ error: "No se encontró empresa" }, { status: 404 });
    } catch (error) {
        return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
}



export async function POST(req: NextRequest) {
    try {
        const rawData = await req.json();
        if (!rawData.telefonoTwilio) return NextResponse.json({ error: "Falta número del bot" }, { status: 400 });

        const catalogoLimpio = (rawData.catalogo || []).map((cat: any) => ({
            nombre: String(cat.nombre || "Sin Categoría"),
            items: (cat.items || []).map((prod: any) => ({
                nombre: String(prod.nombre || ""),
                descripcion: String(prod.descripcion || ""),
                precio: String(prod.precio || "0"),
                tipoPrecio: String(prod.tipoPrecio || "fijo"),
                frecuencia: String(prod.frecuencia || "Pago Único"),
                tienePromo: Boolean(prod.tienePromo),
                detallePromo: String(prod.detallePromo || ""),
                duracion: String(prod.duracion || ""),
                detallesIA: String(prod.detallesIA || ""),
                disponibilidad: String(prod.disponibilidad || "Siempre"),
                requiereReserva: Boolean(prod.requiereReserva),
                imagenPrincipal: String(prod.imagenPrincipal || ""),
                variantes: (prod.variantes || []).map((grupo: any) => ({
                    nombre: String(grupo.nombre || "General"),
                    opciones: (grupo.opciones || []).map((op: any) => ({
                        nombre: String(op.nombre || ""),
                        imagenUrl: String(op.imagenUrl || "")
                    }))
                }))
            }))
        }));

        const data = { ...rawData, catalogo: catalogoLimpio };

        // PERSONALIDAD
        let tono = "";
        switch (data.personalidadIA) {
            case "Vender":
                tono = `PERSONALIDAD: Asesor comercial calido y cercano. Tu objetivo es CERRAR VENTAS.
- Siempre con buena actitud, amabilidad y humildad.
- Resaltas beneficios con entusiasmo natural, nunca presionando.
- Cuando el cliente ve una foto, preguntale que le parece y guia al cierre.
- Si el cliente muestra interes, avanza: "Te lo apartamos?" o "Quieres que procedamos?"
- Si pregunta precio, responde y pregunta si quiere continuar.
- Si duda, destaca el beneficio clave y resuelve la duda.
- NUNCA sueltes precios sin que pregunten. NUNCA seas insistente ni fastidioso.
- NUNCA dejes al cliente sin guia. Siempre lleva hacia el siguiente paso.`;
                break;
            case "Serio":
                tono = `PERSONALIDAD: Profesional, respetuoso y orientado a resultados.
- Directo y claro pero siempre amable y cordial.
- Guias al cliente con confianza hacia la compra.
- Si muestra interes, avanza: "Perfecto, procedemos?" o "Lo agendamos?"
- Si pregunta precio, responde y ofrece avanzar.
- NUNCA sueltes precios sin que pregunten. NUNCA seas seco ni cortante.
- NUNCA dejes la conversacion sin direccion.`;
                break;
            case "Amigable":
            default:
                tono = `PERSONALIDAD: Amigable, calido y cercano. Como un amigo que recomienda algo bueno.
- Natural y humano, te interesas genuinamente por el cliente.
- Guias la conversacion de forma natural hacia la compra.
- Si muestra interes, avanza: "Te encantaria tenerlo! Lo procesamos?"
- Si pregunta precio, responde y sugiere avanzar.
- NUNCA sueltes precios sin que pregunten. NUNCA seas frio ni robotico.
- NUNCA dejes al cliente sin guia.`;
                break;
        }

        const extraInstructions = data.instruccionesAdicionales ? `\nINSTRUCCIONES EXTRA: ${data.instruccionesAdicionales}` : "";
        const temasProhibidos = data.temasProhibidos ? `\nPROHIBIDO HABLAR DE: ${data.temasProhibidos}` : "";
        const manejoClientesDificiles = data.manejoClientesDificiles
            ? `\nCLIENTES DIFICILES: ${data.manejoClientesDificiles}`
            : "\nCLIENTES DIFICILES: Mantente calmado y amable. Ofrece ayuda. Si insiste, dile que un asesor humano lo contactara.";

        // CAMPANAS
        let logicaCampanas = "";
        if (data.campanas && data.campanas.length > 0) {
            const activas = data.campanas.filter((c: any) => c.vigencia !== "EXPIRADO");
            const expiradas = data.campanas.filter((c: any) => c.vigencia === "EXPIRADO");
            if (activas.length > 0) {
                logicaCampanas = `\nCAMPANAS ACTIVAS:\n` + activas.map((c: any) => `Clave: "${c.palabraClave}" -> ${c.contexto} (${c.vigencia})`).join("\n");
                logicaCampanas += `\nSi el cliente dice una palabra clave, responde con el contexto. PRIMERO pide nombre si no lo tienes.`;
            }
            if (expiradas.length > 0) {
                logicaCampanas += `\nExpiradas: ${expiradas.map((c: any) => `"${c.palabraClave}"`).join(", ")}. Di que ya no estan vigentes.`;
            }
        }

        // PROMOCIONES
        let logicaPromociones = "";
        if (data.promociones && data.promociones.length > 0) {
            logicaPromociones = `\nPROMOCIONES VIGENTES:\n` + data.promociones.map((p: any) =>
                `"${p.nombre}" en "${p.servicioAsociado}": ${p.detalle}. Precio especial: ${p.precioEspecial}. ${p.vigencia}.`
            ).join("\n");
            logicaPromociones += `\nMenciona la promo SOLO cuando hablen del producto asociado.`;
        }

        // FAQs
        let logicaFaqs = "";
        if (data.faqs && data.faqs.length > 0) {
            logicaFaqs = `\nPREGUNTAS FRECUENTES:\n` + data.faqs.map((f: any) => `Pregunta: ${f.pregunta}\nRespuesta: ${f.respuesta}`).join("\n\n");
        }

        // HORARIOS
        let horariosTxt = "";
        if (data.horarios) {
            const lineas = Object.entries(data.horarios).map(([dia, val]: [string, any]) =>
                val.abierto ? `${dia}: ${val.inicio}-${val.fin}` : `${dia}: CERRADO`
            );
            horariosTxt = `\nHORARIOS:\n${lineas.join("\n")}\nDa estos horarios generales. No inventes horarios por servicio.`;
        }

        // REDES
        let redesTxt = "";
        const redes = data.redes || {};
        const redesList: string[] = [];
        if (redes.instagram) redesList.push(`Instagram: ${redes.instagram}`);
        if (redes.tiktok) redesList.push(`TikTok: ${redes.tiktok}`);
        if (redes.facebook) redesList.push(`Facebook: ${redes.facebook}`);
        if (redes.web) redesList.push(`Web: ${redes.web}`);
        if (redesList.length > 0) redesTxt = `\nREDES:\n${redesList.join("\n")}`;

        // RESERVAS
        let hayProductosConReserva = false;
        if (data.aceptaReservas === true) {
            data.catalogo.forEach((cat: any) => {
                cat.items.forEach((item: any) => { if (item.requiereReserva === true) hayProductosConReserva = true; });
            });
        }

        let politicaReservas = "";
        if (hayProductosConReserva) {
politicaReservas = `\nRESERVAS: Solo productos [REQUIERE RESERVA] llevan flujo de reserva.
FLUJO ESTRICTO:
1. Presenta el servicio normalmente y resuelve dudas.
2. Cuando el cliente muestre interés claro, pregunta UNA sola vez: "Quieres hacer la reserva?"
3. SOLO llama notificar_reserva cuando el cliente responda SI a ESA pregunta puntual.
4. NUNCA llames notificar_reserva si el cliente solo pregunta por el servicio, precio o disponibilidad.
5. El sistema manejará el resto del flujo (fecha, hora, persona).
Metodo: WhatsApp.
${data.reglasReserva ? `Instrucciones del negocio para el bot: ${data.reglasReserva}` : ""}`;
        } else {
            politicaReservas = "\nNO hay reservas.";
        }

        const terminosCondiciones = data.terminosCondiciones
            ? `\nTERMINOS Y CONDICIONES:\n${data.terminosCondiciones}\nSi preguntan por terminos, politicas, garantias o condiciones, responde con esta info.`
            : "";

        // CATALOGO
        let catalogoTxt = "";
        let hayAlgunaFotoEnCatalogo = false;

        data.catalogo.forEach((cat: any) => {
            const nombresProductos = cat.items.map((i: any) => i.nombre).filter((n: string) => n).join(", ");
            catalogoTxt += `\n=== CATEGORIA: ${cat.nombre.toUpperCase()} ===\n`;
            catalogoTxt += `Productos en esta categoria: ${nombresProductos || "ninguno"}.\n`;

            cat.items.forEach((item: any) => {
                const infoPrecio = (item.tipoPrecio === 'cotizar') ? "A COTIZAR" : `$${item.precio}`;
                const tieneImgPrincipal = item.imagenPrincipal && item.imagenPrincipal.trim() !== "";
                const imgPrincipal = tieneImgPrincipal ? `FOTO: ${item.imagenPrincipal}` : "SIN FOTO";
                if (tieneImgPrincipal) hayAlgunaFotoEnCatalogo = true;

                let infoVariantes = "  VARIANTES: ninguna\n";
                if (item.variantes && item.variantes.length > 0) {
                    const grupos: string[] = [];
                    const nombresGrupos: string[] = [];
                    item.variantes.forEach((v: any) => {
                        if (!v.opciones || v.opciones.length === 0) return;
                        nombresGrupos.push(v.nombre);
                        const ops = v.opciones.map((o: any) => {
                            const tieneImg = o.imagenUrl && o.imagenUrl.trim() !== "";
                            if (tieneImg) hayAlgunaFotoEnCatalogo = true;
                            return tieneImg ? `${o.nombre}(foto:${o.imagenUrl})` : `${o.nombre}(SIN FOTO)`;
                        }).join(", ");
                        grupos.push(`    ${v.nombre}: [${ops}]`);
                    });
                    if (grupos.length > 0) {
                        infoVariantes = `  GRUPOS DE VARIANTES (menciona estos grupos al presentar el producto): ${nombresGrupos.join(", ")}\n`;
                        infoVariantes += `  OPCIONES POR GRUPO (revelar SOLO cuando el cliente pregunte):\n${grupos.join("\n")}\n`;
                        infoVariantes += `  IMPORTANTE: Al presentar di que tiene variantes de ${nombresGrupos.join(" y ")} pero NO listes las opciones aun.\n`;
                    }
                }

                const esReservable = (data.aceptaReservas === true && item.requiereReserva === true);
                const etiqueta = esReservable ? "[REQUIERE RESERVA]" : "[VENTA DIRECTA]";

                catalogoTxt += `\n  PRODUCTO: ${item.nombre} ${etiqueta}
  Precio: ${infoPrecio}${item.frecuencia !== "Pago Único" ? ` (${item.frecuencia})` : ""}
  Imagen principal: ${imgPrincipal}
${infoVariantes}`;
                if (item.descripcion) catalogoTxt += `  Descripcion: ${item.descripcion}\n`;
                if (item.duracion) catalogoTxt += `  Duracion: ${item.duracion}\n`;
                if (item.detallesIA) catalogoTxt += `  Contexto adicional: ${item.detallesIA}\n`;
                if (item.tienePromo) catalogoTxt += `  PROMO: ${item.detallePromo}\n`;
            });
        });

        // FOTOS
        let instruccionesFotos = "";
        if (!hayAlgunaFotoEnCatalogo) {
            instruccionesFotos = `FOTOS:
- NO hay fotos en el catalogo.
- NUNCA ofrezcas mostrar fotos ni imagenes de ningun producto.
- NUNCA digas "quieres verlo?", "te muestro?", "te envio imagen?" ni nada parecido.
- NUNCA llames la funcion enviar_foto.
- Describe los productos solo con palabras.`;
        } else {
            instruccionesFotos = `FOTOS:
- SOLO ofrece foto si el producto tiene "FOTO:" seguido de una URL https://...
- Si dice "SIN FOTO": PROHIBIDO ofrecer foto de ese producto.
- NUNCA envies foto sin que el cliente la pida explicitamente ("quiero verlo", "muestrame", etc.)
- Producto con variantes: pregunta cual quiere ver, SOLO variantes con foto URL.
- Despues de enviar foto: pregunta que le parece y guia al cierre.
- REGLA DE ORO: Sin URL = NO ofrezcas foto. Punto.`;
        }

        const datosContacto = `Pagos: ${data.mediosPago?.join(", ") || "A convenir"}. Soporte: ${data.telefonoAtencion || "N/A"}.`;
        const instruccionesPago = data.instruccionesPago ? `Pago: ${data.instruccionesPago}` : "";

        const systemPrompt = `Asistente virtual de "${data.nombre}". 
${tono}
${extraInstructions}${temasProhibidos}${manejoClientesDificiles}

REGLAS:
- Maximo 30 palabras. Cero emojis. Una pregunta por mensaje.
- No uses corchetes []. No pidas datos personales.
- No digas "estoy aqui para ayudarte" ni frases de relleno.
- SIEMPRE se amable, calido y con buena actitud.

NOMBRE: Si no sabes el nombre del cliente, pidelo antes de cualquier cosa.

CONTEXTO: Entiende TODA la conversacion. Si el cliente dijo que vende gorras y necesita una web, recuerdalo y usa esa info para recomendar el producto correcto. Si pregunta "¿tienen pagina web?", entiende que esta preguntando si tu empresa ofrece ese servicio, no si la empresa tiene pagina web propia.

COMO LEER EL CATALOGO:
- "=== CATEGORIA ===" es un agrupador, NO un producto.
- "PRODUCTO:" es lo que realmente vendes.
- Cuando pregunten "que tienes?", nombra PRODUCTOS, no categorias.
- NUNCA presentes la categoria como si fuera el producto.

REGLA DE VARIANTES:
- Si el producto tiene "GRUPOS DE VARIANTES", mencionalos al presentarlo.
- NO listes opciones especificas hasta que el cliente pregunte por ese grupo.

CATALOGO (UNICA fuente de verdad):
${catalogoTxt}

PROHIBIDO INVENTAR: Solo existen los productos listados. Si no esta en el catalogo, di "eso no lo manejamos".
PRECIOS: Solo cuando pregunten. Despues de dar precio, guia al cierre.

${instruccionesFotos}

PORTAFOLIO: Si preguntan por disenos, trabajos, portafolio o ejemplos, comparte redes.
${redesTxt || "No hay redes."}
No compartas redes fuera de ese contexto.

${politicaReservas}
${horariosTxt}
${logicaCampanas}
${logicaPromociones}
${logicaFaqs}
${terminosCondiciones}

CONTEXTO NEGOCIO: ${data.descripcion || "Sin descripcion."} Industria: ${data.sector || "General"}

VENTAS: Cuando quiera comprar, llama notificar_pedido_completo. No preguntes mas.
${datosContacto} ${instruccionesPago}`;

        // GUARDAR EN FIRESTORE
        const idEmpresaLimpio = data.telefonoTwilio.replace('whatsapp:', '').replace(/[^0-9+]/g, '');
        const objetoFinal = JSON.parse(JSON.stringify({
            ...data,
            catalogo: catalogoLimpio,
            systemPrompt,
            telefonoTwilio: `whatsapp:${idEmpresaLimpio}`,
            telefonoAdmin: String(data.telefonoAdmin || "").replace(/\s+/g, ''),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }));

        await db.collection('empresas').doc(idEmpresaLimpio).set(objetoFinal);

        // ✅ FIX: Usar set con merge en lugar de update
        // Así no falla si el documento no existe en numeros_disponibles
        try {
            await db.collection('numeros_disponibles').doc(data.telefonoTwilio).set({
                asignado: true,
                empresaAsignada: data.nombre,
                fechaAsignacion: admin.firestore.FieldValue.serverTimestamp(),
                numero: data.telefonoTwilio,
            }, { merge: true });
        } catch (e: any) {
            // No crítico: si falla, la empresa igual se guardó
            console.warn("[EMPRESA] numeros_disponibles no actualizado:", e.message);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("ERROR POST EMPRESA:", error);
        return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
}