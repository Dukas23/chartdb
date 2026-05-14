import { describe, it, expect, vi } from 'vitest';
import { McpBridge } from '../bridge';

vi.mock('ws', () => {
    return {
        WebSocketServer: vi.fn().mockImplementation(() => ({
            on: vi.fn(),
            close: vi.fn(),
        })),
    };
});

describe('McpBridge CRUD Routing', () => {
    it('should route update and delete calls to the WebSocket client', async () => {
        const bridge = new McpBridge();
        const mockWs = { send: vi.fn(), on: vi.fn() };
        // @ts-ignore - accessing private for testing
        bridge.browserWs = mockWs;

        const tools = [
            'update_table', 
            'delete_table', 
            'update_relationship', 
            'delete_relationship'
        ];

        for (const tool of tools) {
            bridge.handleToolCall(tool, { id: 'test-id' });
            expect(mockWs.send).toHaveBeenCalledWith(
                expect.stringContaining(tool)
            );
            expect(mockWs.send).toHaveBeenCalledWith(
                expect.stringContaining('test-id')
            );
        }
    });

    it('should route list_diagrams even without arguments', async () => {
        const bridge = new McpBridge();
        const mockWs = { send: vi.fn(), on: vi.fn() };
        // @ts-ignore
        bridge.browserWs = mockWs;

        // Call without awaiting to avoid timeout from browser response
        bridge.handleToolCall('list_diagrams', {});

        expect(mockWs.send).toHaveBeenCalledWith(
            expect.stringContaining('list_diagrams')
        );
    });
});
