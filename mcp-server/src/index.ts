import { McpBridge } from './bridge.js';

const bridge = new McpBridge();
bridge
    .start()
    .then(() => {
        console.error('ChartDB MCP Bridge started on stdio');
    })
    .catch((err) => {
        console.error('Failed to start MCP Bridge:', err);
    });
