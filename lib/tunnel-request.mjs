import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export async function resolveTunnelHost(hostname, { systemLookup = lookup, request = fetch } = {}) {
  try { return await systemLookup(hostname, { all: true, family: 4 }); }
  catch (error) {
    if (!['ENOTFOUND', 'EAI_AGAIN'].includes(error.code) || !hostname.endsWith('.trycloudflare.com')) throw error;
    const response = await request(`https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=A`, {
      headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw error;
    const data = await response.json();
    const addresses = (data.Answer || []).filter(record => record.type === 1 && isIP(record.data) === 4)
      .map(record => ({ address: record.data, family: 4 }));
    if (data.Status !== 0 || !addresses.length) throw error;
    return addresses;
  }
}

export function requestTunnelPage(url, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      signal,
      lookup(hostname, options, callback) {
        resolveTunnelHost(hostname).then(addresses => {
          if (options.all) callback(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        }, callback);
      },
    }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 1024 * 1024) { response.destroy(new Error('Exam page is too large')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ ok: response.statusCode === 200, status: response.statusCode,
        text: async () => Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
  });
}
