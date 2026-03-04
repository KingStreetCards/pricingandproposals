import { NextResponse } from 'next/server';

/**
 * POST /api/extract
 * Accepts a base64-encoded PDF and uses Claude to extract study parameters
 * Keeps the Anthropic API key server-side (never exposed to browser)
 */
export async function POST(request) {
  try {
    const { base64, mediaType } = await request.json();

    if (!base64) {
      return NextResponse.json({ error: 'No file data provided' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
    }

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

    return NextResponse.json(parsed);
  } catch (err) {
    console.error('Protocol extraction error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
