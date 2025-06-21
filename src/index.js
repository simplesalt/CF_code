/**
 * Cloudflare Worker Entry Point
 * 
 * This worker can access the CF_state KV namespace to read/write
 * Zero Trust application configurations.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Example: Read Zero Trust applications from KV
    if (url.pathname === '/api/zero-trust-apps') {
      try {
        const apps = await env.CF_STATE.get('0trust_applications');
        return new Response(apps || '[]', {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to read applications' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Example: Update Zero Trust applications in KV
    if (url.pathname === '/api/zero-trust-apps' && request.method === 'POST') {
      try {
        const body = await request.json();
        await env.CF_STATE.put('0trust_applications', JSON.stringify(body));
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to update applications' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Default response
    return new Response(JSON.stringify({
      message: 'CF Workers API',
      endpoints: [
        'GET /api/zero-trust-apps - Read Zero Trust applications',
        'POST /api/zero-trust-apps - Update Zero Trust applications'
      ]
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  },
};