import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MCPProvider } from '../mcp-provider';
import { useMCP } from '../mcp-context';
import React from 'react';

const TestComponent = () => {
    const { connected } = useMCP();
    return (
        <div data-testid="status">
            {connected ? 'connected' : 'disconnected'}
        </div>
    );
};

describe('MCPProvider', () => {
    it('should initially be disconnected', () => {
        render(
            <MCPProvider>
                <TestComponent />
            </MCPProvider>
        );
        expect(screen.getByTestId('status')).toHaveTextContent('disconnected');
    });
});
