import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Apollo GraphQL Server', () => {
  it('responds to health check', async () => {
    const request = new IncomingRequest('http://example.com/health');
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('OK');
  });

  it('shows landing page for GET without query', async () => {
    const request = new IncomingRequest('http://example.com/');
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html');
    const html = await response.text();
    expect(html).toContain('Apollo GraphQL Server');
  });

  it('returns 404 for unknown paths', async () => {
    const request = new IncomingRequest('http://example.com/unknown');
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(404);
  });

  it('handles CORS preflight requests', async () => {
    const request = new IncomingRequest('http://example.com/graphql', {
      method: 'OPTIONS',
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('handles GraphQL introspection query', async () => {
    const query = `
      query {
        __schema {
          types {
            name
          }
        }
      }
    `;
    const request = new IncomingRequest('http://example.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('data.__schema.types');
  });

  it('handles GraphQL query via GET', async () => {
    const query = encodeURIComponent('query { __typename }');
    const request = new IncomingRequest(`http://example.com/graphql?query=${query}`);
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('data.__typename');
  });

  it('returns 400 for invalid JSON', async () => {
    const request = new IncomingRequest('http://example.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: 'invalid json',
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
  });
});
