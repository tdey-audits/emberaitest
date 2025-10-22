import { http, HttpResponse } from 'msw';

export const CHAINLINK_BASE_URL = 'https://api.chainlink-streams.example.com';
export const GMX_BASE_URL = 'https://api.gmx.example.com';

export const dataFeedsHandlers = [
  http.get(`${CHAINLINK_BASE_URL}/feeds/:feedId/latest`, ({ params }) => {
    const { feedId } = params;

    return HttpResponse.json({
      feedId: feedId,
      answer: '2000000000000000000000',
      updatedAt: Date.now(),
      decimals: 18,
    });
  }),

  http.get(`${CHAINLINK_BASE_URL}/feeds/historical`, ({ request }) => {
    const url = new URL(request.url);
    const feedId = url.searchParams.get('feedId');
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);

    const data = Array.from({ length: limit }, (_, i) => ({
      feedId: feedId,
      answer: `${2000000000000000000000n + BigInt(i * 100000000000000000n)}`,
      updatedAt: Date.now() - i * 60000,
      decimals: 18,
    }));

    return HttpResponse.json(data);
  }),

  http.get(`${CHAINLINK_BASE_URL}/health`, () => {
    return HttpResponse.json({ status: 'ok' });
  }),

  http.get(`${GMX_BASE_URL}/prices/latest`, ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    return HttpResponse.json({
      token: token,
      minPrice: '1990000000000000000000',
      maxPrice: '2010000000000000000000',
      timestamp: Date.now(),
    });
  }),

  http.get(`${GMX_BASE_URL}/oracle/latest`, ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    return HttpResponse.json({
      token: token,
      price: '2000000000000000000000',
      timestamp: Date.now(),
      blockNumber: 12345678,
      oracleDecimals: 18,
    });
  }),

  http.get(`${GMX_BASE_URL}/prices/historical`, ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);

    const data = Array.from({ length: limit }, (_, i) => ({
      token: token,
      minPrice: `${1990000000000000000000n + BigInt(i * 50000000000000000n)}`,
      maxPrice: `${2010000000000000000000n + BigInt(i * 50000000000000000n)}`,
      timestamp: Date.now() - i * 60000,
    }));

    return HttpResponse.json(data);
  }),

  http.get(`${GMX_BASE_URL}/oracle/historical`, ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);

    const data = Array.from({ length: limit }, (_, i) => ({
      token: token,
      price: `${2000000000000000000000n + BigInt(i * 100000000000000000n)}`,
      timestamp: Date.now() - i * 60000,
      blockNumber: 12345678 - i,
      oracleDecimals: 18,
    }));

    return HttpResponse.json(data);
  }),

  http.get(`${GMX_BASE_URL}/health`, () => {
    return HttpResponse.json({ status: 'ok' });
  }),
];
