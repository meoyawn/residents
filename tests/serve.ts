import { startRuntime } from './helpers/runtime.ts'

const runtime = await startRuntime({ port: 5188, https: true })
console.log(`Test Worker ready at ${await runtime.ready}`)
async function close() { await runtime.dispose(); process.exit(0) }
process.on('SIGTERM',close)
process.on('SIGINT',close)
