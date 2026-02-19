import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'No URL' }, { status: 400 });

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Basic ${credentials}` },
    });

    if (!response.ok) return NextResponse.json({ error: 'Failed' }, { status: response.status });

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}