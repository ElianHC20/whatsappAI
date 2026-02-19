import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import Twilio from 'twilio';
import * as admin from 'firebase-admin';

const twilioClient = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// GET: Obtener mensajes
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const botId = searchParams.get('botId');
    const chatId = searchParams.get('chatId');
    
    // Limpieza de IDs para que coincidan con Firebase
    const botIdLimpio = botId?.replace('whatsapp:', '').replace(/\s+/g, '');

    if (!botIdLimpio) return NextResponse.json({ error: "Falta botId" }, { status: 400 });

    try {
        if (chatId) {
            // Limpieza del chat ID también
            const chatIdLimpio = chatId.replace('whatsapp:', '').replace(/\s+/g, '');
            const doc = await db.collection('empresas').doc(botIdLimpio).collection('chats').doc(chatIdLimpio).get();
            return NextResponse.json(doc.exists ? doc.data() : {});
        } else {
            const snapshot = await db.collection('empresas').doc(botIdLimpio).collection('chats')
                .orderBy('lastUpdate', 'desc').limit(20).get();
            const chats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return NextResponse.json(chats);
        }
    } catch (e) {
        return NextResponse.json({ error: e }, { status: 500 });
    }
}

// POST: Enviar mensaje como Humano
export async function POST(req: NextRequest) {
    try {
        const { botId, chatId, mensaje, accion } = await req.json();
        
        // Limpieza de IDs
        const botIdLimpio = botId.replace('whatsapp:', '').replace(/\s+/g, '');
        const chatIdLimpio = chatId.replace('whatsapp:', '').replace(/\s+/g, '');

        const chatRef = db.collection('empresas').doc(botIdLimpio).collection('chats').doc(chatIdLimpio);

        // A. REACTIVAR BOT
     if (accion === 'reactivar_bot') {
    await chatRef.update({ 
        modo_humano: false,
        ventaConfirmada: false,
        modo_humano_manual: false,
    });
    return NextResponse.json({ success: true });
}

        // B. SOLO SILENCIAR (Botón Rojo)
        if (accion === 'activar_humano') {
            await chatRef.update({ modo_humano: true, lastUpdate: admin.firestore.FieldValue.serverTimestamp() });
            return NextResponse.json({ success: true });
        }

        // C. ENVIAR MENSAJE (Intervención Humana)
        // 1. Enviar por Twilio
        await twilioClient.messages.create({
            from: `whatsapp:${botIdLimpio}`,
            to: `whatsapp:${chatIdLimpio}`,
            body: mensaje
        });

        // 2. Guardar en Firebase (AQUÍ ESTÁ LA CLAVE DEL CONTEXTO)
        // Guardamos como 'assistant' para que la IA lea el historial y sepa que "el negocio" respondió esto.
        // Pero le ponemos 'esHumano: true' para que el frontend lo pinte de otro color.
        await chatRef.set({
            messages: admin.firestore.FieldValue.arrayUnion({
                role: 'assistant', 
                content: mensaje,
                timestamp: new Date().toISOString(),
                esHumano: true 
            }),
            lastMsg: `👤 TÚ: ${mensaje}`, // Actualizamos el lastMsg explícitamente
            lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
            modo_humano: true // Al hablar tú, el bot se calla automáticamente
        }, { merge: true });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Error" }, { status: 500 });
    }
}