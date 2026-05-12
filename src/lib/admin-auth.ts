type AdminEnv = { ADMIN_PASSWORD?: string };

const REALM = 'Class of 2006 Admin';

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function challenge(status = 401): Response {
  return new Response('Authentication required.', {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
    },
  });
}

/**
 * Return null when the request carries valid admin credentials; otherwise
 * return a Response (401 challenge or 503 if the secret isn't configured)
 * the page should `return` immediately.
 *
 * Accepts any username — only the password is compared, in constant time.
 */
export function requireAdmin(request: Request, env: AdminEnv): Response | null {
  const expected = env.ADMIN_PASSWORD;
  if (!expected) {
    return new Response(
      'Admin password not configured. Set the ADMIN_PASSWORD secret on the Worker.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  const header = request.headers.get('authorization') ?? '';
  if (!/^basic\s+/i.test(header)) {
    return challenge();
  }

  let decoded = '';
  try {
    decoded = atob(header.replace(/^basic\s+/i, '').trim());
  } catch {
    return challenge();
  }

  const sep = decoded.indexOf(':');
  const supplied = sep >= 0 ? decoded.slice(sep + 1) : decoded;

  if (!constantTimeEquals(supplied, expected)) {
    return challenge();
  }
  return null;
}
