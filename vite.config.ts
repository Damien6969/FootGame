import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'

const gzipAsync = promisify(gzip)

function localBackupPlugin(): Plugin {
  return {
    name: 'local-backup-plugin',
    configureServer(server) {
      server.middlewares.use('/api/backup/save', (req, res) => {
        if (req.method === 'POST') {
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', async () => {
            try {
              const { filename, data } = JSON.parse(body)
              const backupDir = path.resolve(process.cwd(), 'sauvegardes')
              await fs.promises.mkdir(backupDir, { recursive: true })
              const candidate = typeof filename === 'string' ? path.basename(filename) : ''
              const safeName = candidate.endsWith('.json.gz')
                ? candidate
                : `coupe-des-communes-carriere-${Date.now()}.json.gz`
              const filePath = path.join(backupDir, safeName)
              await fs.promises.writeFile(filePath, await gzipAsync(JSON.stringify(data)))
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, filePath: `sauvegardes/${safeName}`, filename: safeName }))
            } catch (err) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: String(err) }))
            }
          })
        } else {
          res.statusCode = 405
          res.end('Method Not Allowed')
        }
      })

      server.middlewares.use('/api/backup/list', async (req, res) => {
        if (req.method === 'GET') {
          try {
            const backupDir = path.resolve(process.cwd(), 'sauvegardes')
            if (!fs.existsSync(backupDir)) {
              res.setHeader('Content-Type', 'application/json')
              return res.end(JSON.stringify({ files: [] }))
            }
            const files = await fs.promises.readdir(backupDir)
            const jsonFiles = files.filter((f) => f.endsWith('.json'))
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ files: jsonFiles }))
          } catch (err) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: String(err) }))
          }
        } else {
          res.statusCode = 405
          res.end('Method Not Allowed')
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), localBackupPlugin()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
