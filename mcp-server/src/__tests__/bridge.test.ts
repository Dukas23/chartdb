import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpBridge } from '../bridge';

vi.mock('ws', () => {
    return {
        WebSocketServer: vi.fn().mockImplementation(() => ({
            on: vi.fn(),
            close: vi.fn(),
        })),
    };
});

describe('McpBridge Routing', () => {
    it('should route MCP tool calls to the WebSocket client', async () => {
        const bridge = new McpBridge();
        const mockWs = { send: vi.fn(), on: vi.fn() };

        // Simulate a connection
        // @ts-ignore - accessing private for testing
        bridge.browserWs = mockWs;

        // Test existing tools
        bridge.handleToolCall('get_diagram', { arg1: 'val1' });
        expect(mockWs.send).toHaveBeenCalledWith(
            expect.stringContaining('get_diagram')
        );

        // Test new tools
        const tools = ['update_table', 'delete_table', 'update_relationship', 'delete_relationship'];
        for (const tool of tools) {
            bridge.handleToolCall(tool, { id: '1' });
            expect(mockWs.send).toHaveBeenCalledWith(
                expect.stringContaining(tool)
            );
        }
    });

    it('should expose the new CRUD tools', async () => {
        const bridge = new McpBridge();
        // @ts-ignore - accessing private for testing
        const server = bridge.server;
        
        // We simulate a ListTools request
        // This is a bit tricky with the SDK, but we can check the handlers or use a mock transport
        // For now, let's assume we want them in the setupMcp.
        // We'll read the code to verify later, but TDD says failing test first.
        // Let's try to get the list of tools if possible.
        const response = await (server as any)._requestHandlers.get('list_tools')({});
        const toolNames = response.tools.map((t: any) => t.name);
        
        expect(toolNames).toContain('update_table');
        expect(toolNames).toContain('delete_table');
        expect(toolNames).toContain('update_relationship');
        expect(toolNames).toContain('delete_relationship');
    });
});
