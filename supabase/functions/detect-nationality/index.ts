// detect-nationality
//
// Reads the caller IP from request headers and resolves it to a
// 2-letter country code using ipapi.co (free tier 1k/day, no key).
//
// Public — anyone can call. The client uses this on /register and
// /onboarding to pre-fill the country dropdown. Override is always
// allowed by the user, so a mistaken/proxy answer is harmless.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const FALLBACK = 'BR';
const KNOWN_CODES = new Set([
  'BR','AR','UY','CL','CO','PY','PE','EC','VE','BO',
  'PT','ES','FR','IT','DE','GB','NL','BE','CH','AT','PL','SE','NO','DK','FI','IE','GR','TR','RU','UA','CZ','HR','RS','RO','HU',
  'US','MX','CA','CR','JM','PA',
  'NG','SN','CM','CI','GH','MA','EG','ZA','DZ','TN',
  'JP','KR','CN','SA','IR','AU','IN','TH','VN','PH','ID','IL',
  'NZ',
]);

function pickClientIp(req: Request): string | null {
  // Supabase Edge functions expose the client IP via x-forwarded-for
  // (first entry) or cf-connecting-ip (when behind Cloudflare).
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('cf-connecting-ip')
       || req.headers.get('x-real-ip')
       || null;
}

async function lookup(ip: string): Promise<string | null> {
  try {
    const res = await fetch(`https://ipapi.co/${ip}/country/`, {
      headers: { 'User-Agent': 'football-identity/1.0' },
    });
    if (!res.ok) return null;
    const code = (await res.text()).trim().toUpperCase();
    if (code.length === 2) return code;
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const ip = pickClientIp(req);
  let country: string | null = null;
  let source = 'fallback';

  if (ip && !ip.startsWith('127.') && !ip.startsWith('::1') && !ip.startsWith('192.168.')) {
    country = await lookup(ip);
    if (country) source = 'ip';
  }

  // Map unknown codes to the fallback so the UI never has to handle
  // a country that isn't seeded.
  if (!country || !KNOWN_CODES.has(country)) {
    country = FALLBACK;
    if (source === 'ip') source = 'unknown';
  }

  return new Response(JSON.stringify({ country_code: country, source }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
