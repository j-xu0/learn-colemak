import { svelte } from '@sveltejs/vite-plugin-svelte'
import { createServer, defineConfig, type ViteDevServer } from 'vite'

async function prerenderApp(html: string, server: ViteDevServer) {
  const { renderApp } = await server.ssrLoadModule('/src/prerender.ts')
  return html.replace('<!--app-html-->', () => renderApp())
}

const ssr = { noExternal: ['@ui-sdk/svelte'] }

export default defineConfig({
  plugins: [
    svelte(),
    {
      name: 'prerender-app',
      async transformIndexHtml(html, { server }) {
        if (server) return prerenderApp(html, server)

        const renderer = await createServer({
          configFile: false,
          plugins: [svelte()],
          ssr,
          server: { middlewareMode: true, watch: null, ws: false },
        })
        try {
          return await prerenderApp(html, renderer)
        } finally {
          await renderer.close()
        }
      },
    },
  ],
  ssr,
})
