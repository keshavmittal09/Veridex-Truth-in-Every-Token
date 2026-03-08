import { NextResponse } from 'next/server';

export async function POST(req) {
    const backendUrl = 'http://127.0.0.1:8000/api/upload-pdf';

    try {
        const formData = await req.formData();
        const file = formData.get('file');

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Forward as multipart form data to backend
        const backendForm = new FormData();
        backendForm.append('file', file);

        const response = await fetch(backendUrl, {
            method: 'POST',
            body: backendForm,
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('PDF Upload Proxy Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
