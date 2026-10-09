interface PagesEnv {
  BACKEND_URL?: string;
  VITE_API_BASE_URL?: string;
  FIRESTORE_DATABASE_ID?: string;
  FIRESTORE_DOC_ID?: string;
}

export type PagesFunction<Env = unknown> = (context: {
  request: Request;
  env: Env;
  params?: Record<string, string | string[]>;
  next?: () => Promise<Response>;
}) => Promise<Response>;

export const onRequest: PagesFunction<PagesEnv> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // 1. Health check endpoint directly on Cloudflare Edge
  if (url.pathname === '/api/health' || url.pathname === '/api/health/') {
    return new Response(
      JSON.stringify({
        status: 'ok',
        platform: 'Cloudflare Pages',
        runtime: 'Edge Worker',
        timestamp: new Date().toISOString(),
        independentDb: true,
        documentId: env.FIRESTORE_DOC_ID || 'indoor_media_db_multicast',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  // 2. If a remote backend URL is configured, proxy the request to the backend service
  const targetBackend = env.BACKEND_URL || env.VITE_API_BASE_URL;
  if (targetBackend) {
    const backendBase = targetBackend.replace(/\/api\/?$/, '').replace(/\/+$/, '');
    const forwardUrl = `${backendBase}${url.pathname}${url.search}`;

    try {
      const forwardHeaders = new Headers(request.headers);
      forwardHeaders.set('X-Forwarded-Host', url.host);
      forwardHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

      const proxyResponse = await fetch(forwardUrl, {
        method: request.method,
        headers: forwardHeaders,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'follow',
      });

      const responseHeaders = new Headers(proxyResponse.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Headers', '*');

      return new Response(proxyResponse.body, {
        status: proxyResponse.status,
        statusText: proxyResponse.statusText,
        headers: responseHeaders,
      });
    } catch (err: any) {
      // In case of backend connection error, return 502 so client fallback to Firestore can take over
      return new Response(
        JSON.stringify({
          error: 'Erro de conexão com o backend remoto. Alternando para sincronização direta no Firestore.',
          detail: err?.message || String(err),
        }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
  }

  // 3. If no backend is configured, return 404 with JSON so the client-side
  // Firebase Firestore engine seamlessly handles all operations locally & in cloud!
  return new Response(
    JSON.stringify({
      error: 'Backend remoto não configurado. Utilizando motor direto no Firebase Firestore.',
      documentId: env.FIRESTORE_DOC_ID || 'indoor_media_db_multicast',
    }),
    {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
};
