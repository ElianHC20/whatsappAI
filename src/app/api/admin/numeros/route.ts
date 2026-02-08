import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';

// 1. GET: Para ver la lista de todos tus números (Ocupados y Libres)
export async function GET() {
  try {
    const snapshot = await db.collection('numeros_disponibles').get();
    const numeros = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json(numeros);
  } catch (error) {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// 2. POST: Para AGREGAR un número nuevo al inventario
export async function POST(req: NextRequest) {
  try {
    const { numero, pais, bandera } = await req.json();

    // ID único para Twilio: whatsapp:+57300...
    const idTwilio = `whatsapp:${numero}`;
    
    // Texto bonito para el cliente: "🇨🇴 Colombia (+57 300...)"
    const display = `${bandera} ${pais} (${numero})`;

    // Guardamos en Firebase
    await db.collection('numeros_disponibles').doc(idTwilio).set({
      numero: numero,
      display: display,
      pais: pais,
      asignado: false, // Por defecto nace libre
      creadoEn: new Date().toISOString()
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Error creando número" }, { status: 500 });
  }
}

// 3. DELETE: Por si te equivocas y quieres borrar un número
export async function DELETE(req: NextRequest) {
    try {
        const { id } = await req.json();
        await db.collection('numeros_disponibles').doc(id).delete();
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Error borrando" }, { status: 500 });
    }
}