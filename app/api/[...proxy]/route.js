import { NextResponse } from 'next/server';

export async function POST(req, { params }) {
    const resolvedParams = await params;
    const path = resolvedParams.proxy.join('/');
    const backendUrl = `https://veridex-backend-4dxt.onrender.com/api/${path}`;

    try {
        const bodyText = await req.text();
        const headers = new Headers();
        headers.set('Content-Type', 'application/json');

        const response = await fetch(backendUrl, {
            method: 'POST',
            headers,
            body: bodyText,
        });

        if (!response.ok) {
            return new NextResponse(response.body, { status: response.status });
        }

        // Pass through SSE stream or normal response
        return new NextResponse(response.body, {
            status: response.status,
            headers: {
                'Content-Type': response.headers.get('Content-Type') || 'application/json',
            },
        });

    } catch (error) {
        console.error('Proxy Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
