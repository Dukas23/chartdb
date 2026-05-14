import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer, WebSocket } from 'ws';

export class McpBridge {
    private server: Server;
    private wss: WebSocketServer;
    private browserWs: WebSocket | null = null;
    private pendingRequests = new Map<string, (result: any) => void>();

    constructor() {
        this.server = new Server(
            { name: 'chartdb-bridge', version: '1.2.0' },
            { capabilities: { tools: {} } }
        );
        this.wss = new WebSocketServer({ port: 3000 });
        this.setupMcp();
        this.setupWs();
    }

    private setupMcp() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'list_diagrams',
                    description: 'List all projects',
                    inputSchema: { type: 'object', properties: {} }
                },
                {
                    name: 'create_diagram',
                    description: 'Create a new project',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            databaseType: { type: 'string' }
                        },
                        required: ['name']
                    }
                },
                {
                    name: 'get_diagram',
                    description: 'Get current state',
                    inputSchema: { type: 'object', properties: {} }
                },
                {
                    name: 'add_table',
                    description: 'Add a table',
                    inputSchema: { type: 'object', properties: { table: { type: 'object' } }, required: ['table'] }
                },
                {
                    name: 'update_table',
                    description: 'Update a table',
                    inputSchema: { type: 'object', properties: { id: { type: 'string' }, attributes: { type: 'object' } }, required: ['id', 'attributes'] }
                },
                {
                    name: 'delete_table',
                    description: 'Delete a table',
                    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
                },
                {
                    name: 'add_relationship',
                    description: 'Connect two tables',
                    inputSchema: { type: 'object', properties: { relationship: { type: 'object' } }, required: ['relationship'] }
                },
                {
                    name: 'delete_relationship',
                    description: 'Delete a link',
                    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
                },
                {
                    name: 'add_area',
                    description: 'Add a visual group (Area) for tables',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            area: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    color: { type: 'string' },
                                    x: { type: 'number' },
                                    y: { type: 'number' },
                                    width: { type: 'number' },
                                    height: { type: 'number' }
                                },
                                required: ['name']
                            }
                        },
                        required: ['area']
                    }
                },
                {
                    name: 'add_note',
                    description: 'Add a sticky note to the diagram',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            note: {
                                type: 'object',
                                properties: {
                                    content: { type: 'string' },
                                    x: { type: 'number' },
                                    y: { type: 'number' },
                                    color: { type: 'string' }
                                },
                                required: ['content']
                            }
                        },
                        required: ['note']
                    }
                }
            ]
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const args = request.params.arguments || {};
            const result = await this.handleToolCall(request.params.name, args);
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                isError: !!(result as any)?.error
            };
        });
    }

    private setupWs() {
        this.wss.on('connection', (ws) => {
            this.browserWs = ws;
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'response' && message.id) {
                        const resolve = this.pendingRequests.get(message.id);
                        if (resolve) {
                            resolve(message.result);
                            this.pendingRequests.delete(message.id);
                        }
                    }
                } catch (e) {}
            });
            ws.on('close', () => { this.browserWs = null; });
        });
    }

    async handleToolCall(name: string, args: any): Promise<any> {
        if (!this.browserWs) return { error: 'Open ChartDB in browser first.' };
        const id = Math.random().toString(36).substring(7);
        return new Promise((resolve) => {
            this.pendingRequests.set(id, resolve);
            this.browserWs!.send(JSON.stringify({ type: 'tool_call', id, method: name, params: args }));
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    resolve({ error: 'Browser timeout' });
                }
            }, 20000);
        });
    }

    async start() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
    }
}
