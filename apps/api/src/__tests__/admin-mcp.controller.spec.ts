jest.mock('../modules/interview/services/mcp-registry', () => ({
  McpRegistry: {
    loadFromConfig: jest.fn(),
    listWithStatus: jest.fn(),
    setSystemEnabled: jest.fn(),
    healthCheck: jest.fn(),
  },
}));

import { AdminMcpController } from '../modules/interview/admin-mcp.controller';
import { McpRegistry } from '../modules/interview/services/mcp-registry';

describe('AdminMcpController reload audit', () => {
  const prisma = { labOperationLog: { create: jest.fn() } };
  const req = { user: { userId: 'admin-1' } };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.labOperationLog.create.mockResolvedValue({ id: 'operation-1' });
  });

  it('records a fixed success operation after reloading the MCP registry', async () => {
    (McpRegistry.loadFromConfig as jest.Mock).mockResolvedValue({ errors: [], loaded: 2 });
    const controller = new AdminMcpController(prisma as any);

    await expect(controller.reload(req)).resolves.toMatchObject({ ok: true, loaded: 2 });
    expect(prisma.labOperationLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'admin-1',
        action: 'MCP_CONFIG_RELOAD',
        objectType: 'MCP_REGISTRY',
        objectId: 'system-mcp-registry',
        outcome: 'SUCCEEDED',
      },
    });
  });

  it('records a fixed rejected operation without copying the reload error', async () => {
    (McpRegistry.loadFromConfig as jest.Mock).mockRejectedValue(new Error('sensitive configuration detail'));
    const controller = new AdminMcpController(prisma as any);

    await expect(controller.reload(req)).rejects.toThrow('sensitive configuration detail');
    expect(prisma.labOperationLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'admin-1',
        action: 'MCP_CONFIG_RELOAD',
        objectType: 'MCP_REGISTRY',
        objectId: 'system-mcp-registry',
        outcome: 'REJECTED',
      },
    });
    expect(JSON.stringify(prisma.labOperationLog.create.mock.calls)).not.toContain('sensitive configuration detail');
  });
});
