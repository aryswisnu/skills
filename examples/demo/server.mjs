import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] ?? process.env.PORT ?? 4317);
const html = await readFile(path.join(directory, 'index.html'));

http.createServer((request, response) => {
  if (request.url !== '/') {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(html);
}).listen(port, '127.0.0.1', () => {
  console.log(`Demo listening on http://127.0.0.1:${port}`);
});
