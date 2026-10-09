const assert = require('node:assert/strict');
const path = require('node:path');
const { McpClient } = require(path.join(process.cwd(), 'dist/modules/interview/services/mcp-client.js'));
const { McpRegistry } = require(path.join(process.cwd(), 'dist/modules/interview/services/mcp-registry.js'));
const { ExternalMcpLoader } = require(path.join(process.cwd(), 'dist/modules/mcp/external-mcp-loader.js'));
(async () => {
  for (const transport of ['stdio', 'streamable-http']) {
    const name = `fixture_${transport.replace('-', '_')}`;
    McpRegistry.register({ name, displayName: name, description: 'Synthetic MCP fixture', category: 'mcp', emoji: '', enabled: true });
    const client = new McpClient({ name, transport, command: 'node', args: ['/tmp/fixture-mcp-server.cjs', '--stdio'], url: 'http://127.0.0.1:3336/mcp', timeoutMs: 3000 });
    try {
      await client.connect();
      assert.equal((await client.listTools(true))[0].name, 'fixture_echo');
      await ExternalMcpLoader.registerFromClient(name, client, { transport });
      const registered = `ext_${name}_fixture_echo`.replace(/[^a-zA-Z0-9_]/g, '_');
      assert.equal((await McpRegistry.healthCheck(name)).ok, true);
      const execute = McpRegistry.get(registered).execute;
      assert.equal((await execute({ text: 'synthetic-echo' })).content[0].text, 'synthetic-echo');
      McpRegistry.setSystemEnabled(name, false);
      assert.equal((await McpRegistry.getAvailableTools('synthetic', new Map())).some(tool => tool.name === registered), false);
      await assert.rejects(() => execute({ text: 'must-not-run' }), /禁用/);
      assert.equal((await McpRegistry.healthCheck(name)).ok, false);
      McpRegistry.setSystemEnabled(name, true);
      McpRegistry.setSystemEnabled(registered, false);
      await assert.rejects(() => execute({ text: 'must-not-run' }), /禁用/);
      console.log(`PASS actual MCP ${transport}: initialize/listTools/echo/protocol health/parent+tool shutdown`);
    } finally { ExternalMcpLoader.unregisterServer(name); McpRegistry.unregister(name); await client.close(); }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
