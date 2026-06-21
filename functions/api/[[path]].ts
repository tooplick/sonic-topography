interface Env {
  METING_API: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestOptions: PagesFunction<Env> = () => {
  return new Response(null, { headers: CORS_HEADERS });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const pathSegments = context.params.path as string[];
  const path = Array.isArray(pathSegments) ? pathSegments.join('/') : String(pathSegments);
  const params = url.searchParams;
  const METING_API = (context.env.METING_API || 'https://api.qijieya.cn/meting').replace(/\/?$/, '/');

  // Proxy any meting URL (used for search result pic/lrc URLs)
  if (path === 'proxy') {
    const targetUrl = params.get('url');
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'Missing url param' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    try {
      const resp = await fetch(targetUrl, { redirect: 'follow' });
      return new Response(resp.body, {
        status: resp.status,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': resp.headers.get('Content-Type') || 'application/json',
        },
      });
    } catch {
      return new Response(JSON.stringify({ error: 'Proxy failed' }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  }

  // Resolve audio ID to direct CDN URL (no proxying)
  if (path === 'resolve') {
    const id = params.get('id');
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing id param' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    const br = params.get('br') || '320';
    const bitrates = [br, '320', '192', '128'];
    const uniqueBr = [...new Set(bitrates)];

    for (const b of uniqueBr) {
      const metingUrl = `${METING_API}?server=netease&type=url&id=${id}&br=${b}`;
      try {
        const resp = await fetch(metingUrl, { redirect: 'manual' });
        const location = resp.headers.get('Location');
        if (location) {
          return new Response(JSON.stringify({ url: location }), {
            status: 200,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      } catch {
        continue;
      }
    }
    return new Response(JSON.stringify({ error: 'No audio found' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Audio proxy - follows 302 redirect and streams audio back
  if (path === 'audio') {
    const id = params.get('id');
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing id param' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    const br = params.get('br') || '2000';
    const bitrates = [br, '320', '192', '128'];
    const uniqueBr = [...new Set(bitrates)];
    const rangeHeader = context.request.headers.get('Range');

    for (const b of uniqueBr) {
      const metingUrl = `${METING_API}?server=netease&type=url&id=${id}&br=${b}`;
      try {
        const upstreamHeaders: Record<string, string> = {};
        if (rangeHeader) upstreamHeaders['Range'] = rangeHeader;

        const resp = await fetch(metingUrl, { redirect: 'follow', headers: upstreamHeaders });
        const contentType = resp.headers.get('Content-Type') || '';
        if ((resp.status === 200 || resp.status === 206) && (contentType.includes('audio') || contentType.includes('octet-stream'))) {
          const responseHeaders: Record<string, string> = {
            ...CORS_HEADERS,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
          };
          const contentLength = resp.headers.get('Content-Length');
          if (contentLength) responseHeaders['Content-Length'] = contentLength;
          const contentRange = resp.headers.get('Content-Range');
          if (contentRange) responseHeaders['Content-Range'] = contentRange;

          return new Response(resp.body, {
            status: resp.status,
            headers: responseHeaders,
          });
        }
      } catch {
        continue;
      }
    }
    return new Response(JSON.stringify({ error: 'No audio found' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Standard meting API proxy (search, song, pic, lrc, playlist)
  const typeMap: Record<string, string> = {
    search: 'search',
    song: 'song',
    pic: 'pic',
    lrc: 'lrc',
    playlist: 'playlist',
  };

  const type = typeMap[path];
  if (!type) {
    return new Response(JSON.stringify({ error: 'Invalid endpoint' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // For pic with resolve=1, return direct CDN URL instead of image data
  if (type === 'pic' && params.get('resolve') === '1') {
    const id = params.get('id');
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing id param' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    const size = params.get('cover') || params.get('size') || '300';
    const metingUrl = `${METING_API}?server=netease&type=pic&id=${id}&size=${size}`;
    try {
      const resp = await fetch(metingUrl, { redirect: 'manual' });
      const location = resp.headers.get('Location');
      if (location) {
        return new Response(JSON.stringify({ url: location }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'No redirect' }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify({ error: 'Failed to resolve' }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  }

  const metingUrl = new URL(METING_API);
  metingUrl.searchParams.set('type', type);

  for (const [key, value] of params.entries()) {
    metingUrl.searchParams.set(key, value);
  }

  try {
    const resp = await fetch(metingUrl.toString());

    return new Response(resp.body, {
      status: resp.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': resp.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Upstream request failed' }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
};
