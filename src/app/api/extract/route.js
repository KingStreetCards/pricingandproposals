import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';

export const maxDuration = 300; // 5 min for multi-chunk processing

const PAGES_PER_CHUNK = 80;

const EXTRACT_PROMPT = `Extract clinical trial information from this protocol document section. Return ONLY a JSON object with these fields (use null for any not found):
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
  "notes": "any relevant details about study design, endpoints, population, visit schedules",
  "confidence": {
    "sponsor": "high|medium|low",
    "studyName": "high|medium|low",
    "phase": "high|medium|low",
    "patients": "high|medium|low",
    "sites": "high|medium|low",
    "countriesExUS": "high|medium|low",
    "studyMonths": "high|medium|low",
    "visitsPerPatient": "high|medium|low",
    "screenFails": "high|medium|low"
  },
  "suggestions": [
    "Each suggestion should be a specific, actionable recommendation for the pricing team based on study characteristics. Examples: if pediatric, suggest adding caregivers; if oncology with long treatment, flag dropout risk; if many countries, suggest concierge travel; if complex visit schedule, flag Patient Kindness. Include rationale."
  ]
}
Return ONLY valid JSON, no markdown backticks or other text.`;

/**
 * Call Claude with a single PDF chunk
 */
async function extractFromChunk(base64, mediaType, apiKey, chunkLabel) {
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
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          contentBlock,
          { type: 'text', text: `This is ${chunkLabel}. ${EXTRACT_PROMPT}` }
        ]
      }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error on ${chunkLabel}: ${err}`);
  }

  const data = await response.json();
  const text = data.content.map(i => i.text || '').join('\n');
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

/**
 * Merge multiple extraction results — prefer non-null values,
 * take the most specific (longest) string, highest number for counts,
 * concatenate notes, merge confidence (take highest), collect all suggestions.
 */
function mergeResults(results) {
  const merged = {
    sponsor: null, studyName: null, phase: null, ta: null,
    patients: null, caregivers: null, screenFails: null,
    countriesExUS: null, sites: null, studyMonths: null,
    visitsPerPatient: null, notes: '',
    confidence: {}, suggestions: [],
  };

  const allNotes = [];
  const confRank = { high: 3, medium: 2, low: 1 };

  for (const r of results) {
    if (!r) continue;

    // Strings: take longest non-null value (more specific)
    for (const key of ['sponsor', 'studyName', 'phase', 'ta']) {
      if (r[key] && (!merged[key] || String(r[key]).length > String(merged[key]).length)) {
        merged[key] = r[key];
      }
    }

    // Numbers: take the largest non-null value (most complete count)
    for (const key of ['patients', 'caregivers', 'screenFails', 'countriesExUS', 'sites', 'studyMonths', 'visitsPerPatient']) {
      const val = r[key] !== null && r[key] !== undefined ? Number(r[key]) : null;
      if (val !== null && (merged[key] === null || val > merged[key])) {
        merged[key] = val;
      }
    }

    // Confidence: take highest confidence per field
    if (r.confidence) {
      for (const [key, level] of Object.entries(r.confidence)) {
        if (!merged.confidence[key] || (confRank[level] || 0) > (confRank[merged.confidence[key]] || 0)) {
          merged.confidence[key] = level;
        }
      }
    }

    // Suggestions: collect all
    if (r.suggestions && Array.isArray(r.suggestions)) {
      merged.suggestions.push(...r.suggestions);
    }

    // Notes: collect all
    if (r.notes) allNotes.push(r.notes);
  }

  // Deduplicate notes and suggestions
  const uniqueNotes = [...new Set(allNotes)];
  merged.notes = uniqueNotes.join(' | ');
  merged.suggestions = [...new Set(merged.suggestions)];

  return merged;
}

/**
 * POST /api/extract
 * Downloads PDF from Supabase Storage, splits into chunks if needed,
 * processes each chunk with Claude, and merges the results.
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

    const arrayBuffer = await fileData.arrayBuffer();
    const mediaType = storagePath.endsWith('.pdf') ? 'application/pdf' : 'image/png';

    let results = [];

    if (mediaType === 'application/pdf') {
      try {
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const totalPages = pdfDoc.getPageCount();

        if (totalPages <= PAGES_PER_CHUNK) {
          // Small PDF — process as single chunk
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          const result = await extractFromChunk(base64, mediaType, apiKey, `a ${totalPages}-page protocol document`);
          results.push(result);
        } else {
          // Large PDF — split into chunks and process each
          const numChunks = Math.ceil(totalPages / PAGES_PER_CHUNK);

          for (let i = 0; i < numChunks; i++) {
            const startPage = i * PAGES_PER_CHUNK;
            const endPage = Math.min(startPage + PAGES_PER_CHUNK, totalPages);

            const chunkDoc = await PDFDocument.create();
            const pageIndices = Array.from({ length: endPage - startPage }, (_, j) => startPage + j);
            const copiedPages = await chunkDoc.copyPages(pdfDoc, pageIndices);
            copiedPages.forEach(p => chunkDoc.addPage(p));

            const chunkBuffer = await chunkDoc.save();
            const chunkBase64 = Buffer.from(chunkBuffer).toString('base64');
            const chunkLabel = `pages ${startPage + 1}-${endPage} of ${totalPages} in a clinical trial protocol`;

            try {
              const result = await extractFromChunk(chunkBase64, mediaType, apiKey, chunkLabel);
              results.push(result);
            } catch (chunkErr) {
              console.error(`Chunk ${i + 1} failed:`, chunkErr.message);
              // Continue with other chunks
            }
          }
        }
      } catch (pdfErr) {
        // If PDF parsing fails, try sending raw (might be under limit)
        console.warn('PDF split failed, trying raw:', pdfErr.message);
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const result = await extractFromChunk(base64, mediaType, apiKey, 'a protocol document');
        results.push(result);
      }
    } else {
      // Image — single pass
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const result = await extractFromChunk(base64, mediaType, apiKey, 'a protocol document image');
      results.push(result);
    }

    if (results.length === 0) {
      return NextResponse.json({ error: 'No data could be extracted from the document.' }, { status: 422 });
    }

    // Merge results from all chunks
    const merged = results.length === 1 ? results[0] : mergeResults(results);

    // Add processing note
    if (results.length > 1) {
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      merged.notes = (merged.notes || '') + ` [Extracted from ${pdfDoc.getPageCount()}-page protocol in ${results.length} chunks]`;
    }

    // Clean up uploaded file
    await supabase.storage.from('protocols').remove([storagePath]);

    return NextResponse.json(merged);
  } catch (err) {
    console.error('Protocol extraction error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
