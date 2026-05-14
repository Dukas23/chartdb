import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MCPProvider, useMCP } from '../mcp-provider';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/use-storage', () => ({
    useStorage: () => ({
        listDiagrams: vi.fn(),
        addDiagram: vi.fn(),
        getDiagram: vi.fn(),
        addTable: vi.fn(),
        addRelationship: vi.fn(),
        listTables: vi.fn(),
    }),
}));

vi.mock('@/hooks/use-chartdb', () => ({
    useChartDB: () => ({
        diagramId: '',
        loadDiagram: vi.fn(),
        addTable: vi.fn(),
        addRelationship: vi.fn(),
        tables: [],
        relationships: [],
    }),
}));

vi.mock('@/hooks/use-config', () => ({
    useConfig: () => ({
        updateConfig: vi.fn(),
    }),
}));

// Mock WebSocket
class MockWebSocket {
    onopen: any;
    onmessage: any;
    onclose: any;
    send = vi.fn();
    close = vi.fn();
    constructor(url: string) {}
}
global.WebSocket = MockWebSocket as any;

const TestComponent = () => {
    const { isConnected } = useMCP();
    return (
        <div data-testid="status">
            {isConnected ? 'connected' : 'disconnected'}
        </div>
    );
};

describe('MCPProvider', () => {
    it('should initially be disconnected', () => {
        render(
            <MemoryRouter>
                <MCPProvider>
                    <TestComponent />
                </MCPProvider>
            </MemoryRouter>
        );
        expect(screen.getByTestId('status')).toHaveTextContent('disconnected');
    });
});
