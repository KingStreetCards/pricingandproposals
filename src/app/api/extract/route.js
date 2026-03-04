import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

/**
 * POST /api/extract
 * Accepts a Supabase Storage path, downloads the PDF server-side,
 * and uses Claude to extract study parameters.
 */
export async function POST(request) {
  try {
    const { storagePath } = await request.json();

    if (!storagePath) {
      return NextResponse.json({ error: 'No storage path provided' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Anthropic API key not configured. Add ANTHROPIC_API_KEY to Vercel environment variables.' }, { status: 500 });
    }

    // Download file from Supabase Storage
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: fileData, error: dlError } = await supabase.storage
      .from('protocols')
      .download(storagePath);

    if (dlError || !fileData) {
      return NextResponse.json({ error: 'Failed to download file: ' + (dlError?.message || 'unknown') }, { status: 500 });
    }

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mediaType = storagePath.endsWith('.pdf') ? 'application/pdf' : 'image/png';

    const contentBlock = mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text',
              text: `Extract clinical trial information from this protocol document. Return ONLY a JSON object with these fields (use null for any not found):
{
  "sponsor": "sponsor company name",
  "studyName": "study or protocol name/number",
  "phase": "I, I/II, II, II/III, III, III/IV, or IV",
  "ta": "therapeutic area",
  "patients": number of patients/subjects planned,
  "caregivers": number of caregivers (0 if not mentioned),
  "screenFails": estimated screen failures,
  "countriesExUS": number of countries excluding US,
  "sites": number of clinical sites,
  "studyMonths": study duration in months,
  "visitsPerPatient": number of visits per patient,
  "notes": "any relevant details about the study design, endpoints, population, or special considerations that would affect pricing"
}
Return ONLY valid JSON, no markdown backticks or other text.`
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: 'Anthropic API error: ' + err }, { status: 502 });
    }

    const data = await response.json();
    const text = data.content.map(i => i.text || '').join('\n');
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Clean up the uploaded file
    await supabase.storage.from('protocols').remove([storagePath]);

    return NextResponse.json(parsed);
  } catch (err) {
    console.error('Protocol extraction error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
