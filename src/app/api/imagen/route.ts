import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

const MAX_SIZE_BYTES = 4.5 * 1024 * 1024;
const MAX_WIDTH = 1200;

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: "Falta url" }, { status: 400 });
    }

    try {
        const response = await fetch(url);

        if (!response.ok) {
            console.error("[IMG PROXY] Error descargando:", response.status);
            return NextResponse.json({ error: "No se pudo descargar" }, { status: 502 });
        }

        const arrayBuffer = await response.arrayBuffer();
        const originalBuffer = Buffer.from(arrayBuffer);
        console.log(`[IMG PROXY] Original: ${(originalBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`);

        let finalBuffer: Buffer = Buffer.from(
            await sharp(originalBuffer)
                .resize({ width: MAX_WIDTH, withoutEnlargement: true })
                .jpeg({ quality: 80, mozjpeg: true })
                .toBuffer()
        );

        if (finalBuffer.byteLength > MAX_SIZE_BYTES) {
            finalBuffer = Buffer.from(
                await sharp(originalBuffer)
                    .resize({ width: 800, withoutEnlargement: true })
                    .jpeg({ quality: 60, mozjpeg: true })
                    .toBuffer()
            );
        }

        if (finalBuffer.byteLength > MAX_SIZE_BYTES) {
            finalBuffer = Buffer.from(
                await sharp(originalBuffer)
                    .resize({ width: 600, withoutEnlargement: true })
                    .jpeg({ quality: 40, mozjpeg: true })
                    .toBuffer()
            );
        }

        console.log(`[IMG PROXY] Comprimida: ${(finalBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`);

return new NextResponse(new Uint8Array(finalBuffer), {
    status: 200,
    headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': finalBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=86400',
    },
});
    } catch (error: any) {
        console.error("[IMG PROXY] Error:", error.message);
        return NextResponse.json({ error: "Error proxy" }, { status: 500 });
    }
}