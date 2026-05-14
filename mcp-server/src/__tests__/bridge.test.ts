import { describe, it, expect, vi, beforeEach } from 'vitest';
// We'll import from index.ts even though it doesn't exist yet (RED phase)
import { McpBridge } from '../bridge';

describe('McpBridge Routing', () => {
    it('should route MCP tool calls to the WebSocket client', async () => {
        const bridge = new McpBridge();
        const mockWs = { send: vi.fn(), on: vi.fn() };

        // Simulate a connection
        // @ts-ignore - accessing private for testing
        bridge.browserWs = mockWs;

        // This is the logic we want: when an MCP tool is called,
        // it should send a message over WS to the browser.
        bridge.handleToolCall('get_diagram', { arg1: 'val1' });

        expect(mockWs.send).toHaveBeenCalledWith(
            expect.stringContaining('get_diagram')
        );
        expect(mockWs.send).toHaveBeenCalledWith(
            expect.stringContaining('arg1')
        );
    });
});
