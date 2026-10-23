/**
 * Serves the built Anahad SPA on port 3000 for the sandbox preview gateway.
 * Zero dependencies. SPA-safe (falls back to index.html), correct MIME types.
 */
const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = '/home/z/my-project/music-app/dist'
const PORT = 3000

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
}

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
    let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath)
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403)
      return res.end('Forbidden')
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(ROOT, 'index.html') // SPA fallback
    }
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    })
    fs.createReadStream(filePath).pipe(res)
  } catch (err) {
    res.writeHead(500)
    res.end('Internal error')
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Anahad preview serving ${ROOT} on http://0.0.0.0:${PORT}`)
})
