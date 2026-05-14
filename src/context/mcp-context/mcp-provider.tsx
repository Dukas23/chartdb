import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useStorage } from '@/hooks/use-storage';
import { useChartDB } from '@/hooks/use-chartdb';
import { useConfig } from '@/hooks/use-config';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { DatabaseType } from '@/lib/domain/database-type';
import { generateDiagramId, generateId } from '@/lib/utils';

interface MCPContextType {
    isConnected: boolean;
}

const MCPContext = createContext<MCPContextType | undefined>(undefined);

const normalizeDatabaseType = (type?: string): DatabaseType => {
    const defaultType = DatabaseType.POSTGRESQL;
    if (!type) return defaultType;
    const lower = type.toLowerCase();
    if (lower.includes('postgre')) return DatabaseType.POSTGRESQL;
    if (lower.includes('mysql')) return DatabaseType.MYSQL;
    if (lower.includes('sqlite')) return DatabaseType.SQLITE;
    if (lower.includes('maria')) return DatabaseType.MARIADB;
    if (lower.includes('sqlserver') || lower.includes('sql_server')) return DatabaseType.SQL_SERVER;
    if (lower.includes('clickhouse')) return DatabaseType.CLICKHOUSE;
    if (lower.includes('cockroach')) return DatabaseType.COCKROACHDB;
    if (lower.includes('oracle')) return DatabaseType.ORACLE;
    return DatabaseType.GENERIC;
};

export const MCPProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const storage = useStorage();
    const chartdb = useChartDB();
    const { updateConfig } = useConfig();
    const navigate = useNavigate();
    const [isConnected, setIsConnected] = useState(false);
    
    const activeMcpDiagramIdRef = useRef<string | null>(null);
    const chartdbRef = useRef(chartdb);
    const storageRef = useRef(storage);

    useEffect(() => { chartdbRef.current = chartdb; }, [chartdb]);
    useEffect(() => { storageRef.current = storage; }, [storage]);

    const withRetry = async <T,>(fn: () => Promise<T>, attempts = 4, delay = 600): Promise<T> => {
        let lastError: any;
        for (let i = 0; i < attempts; i++) {
            try {
                return await fn();
            } catch (err) {
                lastError = err;
                if (i < attempts - 1) await new Promise(r => setTimeout(resolve, delay));
            }
        }
        throw lastError;
    };

    useEffect(() => {
        const connect = () => {
            const ws = new WebSocket('ws://localhost:3000');

            ws.onopen = () => {
                console.log('%c[MCP v1.2] Bridge Connected', 'background: #1a1a2e; color: #00ff9d; font-weight: bold;');
                setIsConnected(true);
            };

            ws.onmessage = async (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'tool_call') {
                    let result: any;
                    try {
                        const { params } = message;
                        console.group(`%c[MCP] Tool: ${message.method}`, 'color: #70a1ff');

                        const getTargetId = async () => {
                            if (activeMcpDiagramIdRef.current) return activeMcpDiagramIdRef.current;
                            if (chartdbRef.current.diagramId) return chartdbRef.current.diagramId;
                            const diagrams = await storageRef.current.listDiagrams();
                            return diagrams?.length > 0 ? diagrams.sort((a,b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0].id : null;
                        };

                        switch (message.method) {
                            case 'list_diagrams':
                                result = await storageRef.current.listDiagrams();
                                break;

                            case 'create_diagram': {
                                const id = generateDiagramId();
                                const dbType = normalizeDatabaseType(params.databaseType);
                                await storageRef.current.addDiagram({ diagram: {
                                    id, name: params.name || 'New Project', databaseType: dbType,
                                    createdAt: new Date(), updatedAt: new Date(),
                                }});
                                await updateConfig({ config: { defaultDiagramId: id } });
                                activeMcpDiagramIdRef.current = id;
                                navigate(`/diagrams/${id}`);
                                result = { status: 'success', diagramId: id };
                                break;
                            }

                            case 'get_diagram': {
                                const id = await getTargetId();
                                if (!id) throw new Error('No diagram found.');
                                if (id === chartdbRef.current.diagramId) {
                                    result = { id: id, name: chartdbRef.current.diagramName, tables: chartdbRef.current.tables, relationships: chartdbRef.current.relationships };
                                } else {
                                    result = await storageRef.current.getDiagram(id, { includeTables: true, includeRelationships: true });
                                }
                                break;
                            }

                            case 'add_table': {
                                const id = await getTargetId();
                                const tableData = params.table || params;
                                const newTable = {
                                    id: tableData.id || nanoid(),
                                    name: tableData.name,
                                    schema: tableData.schema || (chartdbRef.current.databaseType === DatabaseType.POSTGRESQL ? 'public' : null),
                                    x: tableData.x ?? (Math.random() * 500), y: tableData.y ?? (Math.random() * 500),
                                    color: tableData.color || '#3b82f6', isView: !!tableData.isView,
                                    comments: tableData.comments || tableData.comment || '',
                                    createdAt: Date.now(),
                                    fields: (tableData.fields || []).map((f: any) => ({
                                        id: f.id || nanoid(), name: f.name,
                                        type: typeof f.type === 'string' ? { id: f.type.toUpperCase(), name: f.type.toUpperCase() } : (f.type || { id: 'VARCHAR', name: 'VARCHAR' }),
                                        nullable: f.nullable ?? !f.isNotNull, isPrimaryKey: !!(f.isPrimaryKey || f.primaryKey),
                                        isUnique: !!(f.isUnique || f.unique), defaultValue: f.defaultValue || null, comment: f.comment || '',
                                    })),
                                    indexes: tableData.indexes || [],
                                };
                                if (id === chartdbRef.current.diagramId) { await chartdbRef.current.addTable(newTable); }
                                else { await storageRef.current.addTable({ diagramId: id, table: newTable }); await chartdbRef.current.loadDiagram(id); }
                                result = { status: 'success', tableId: newTable.id };
                                break;
                            }

                            case 'add_relationship': {
                                const id = await getTargetId();
                                const rel = params.relationship || params;
                                result = await withRetry(async () => {
                                    const tables = id === chartdbRef.current.diagramId ? chartdbRef.current.tables : (await storageRef.current.listTables(id));
                                    
                                    const findTable = (name: string) => tables.find((t: any) => 
                                        t.id === name || t.name.toLowerCase() === name.toLowerCase()
                                    );
                                    
                                    const sName = rel.sourceTable || rel.source_table || rel.startTable || rel.start_table;
                                    const tName = rel.targetTable || rel.target_table || rel.endTable || rel.end_table;
                                    
                                    const sourceTable = findTable(sName);
                                    const targetTable = findTable(tName);

                                    if (!sourceTable || !targetTable) throw new Error(`Tables not found: source=${sName}, target=${tName}`);

                                    const findField = (table: any, name: string) => (table.fields || []).find((f: any) => 
                                        f.id === name || f.name.toLowerCase() === name.toLowerCase()
                                    );

                                    const sFieldName = rel.sourceField || rel.source_field || rel.startField || rel.start_field;
                                    const tFieldName = rel.targetField || rel.target_field || rel.endField || rel.end_field;

                                    const sourceField = findField(sourceTable, sFieldName);
                                    const targetField = findField(targetTable, tFieldName);

                                    if (!sourceField || !targetField) {
                                        const availSource = (sourceTable.fields || []).map((f:any) => f.name).join(', ');
                                        const availTarget = (targetTable.fields || []).map((f:any) => f.name).join(', ');
                                        throw new Error(`Fields not found. ${sourceTable.name} has: [${availSource}], ${targetTable.name} has: [${availTarget}]`);
                                    }

                                    const newRel = {
                                        id: rel.id || nanoid(), name: rel.name || `${sourceTable.name}_${sourceField.name}_fk`,
                                        sourceTableId: sourceTable.id, targetTableId: targetTable.id,
                                        sourceFieldId: sourceField.id, targetFieldId: targetField.id,
                                        sourceCardinality: (rel.sourceCardinality || 'many').toLowerCase().includes('one') ? 'one' : 'many',
                                        targetCardinality: (rel.targetCardinality || 'one').toLowerCase().includes('one') ? 'one' : 'many',
                                        createdAt: Date.now(),
                                    };

                                    if (id === chartdbRef.current.diagramId) { await chartdbRef.current.addRelationship(newRel); }
                                    else { await storageRef.current.addRelationship({ diagramId: id, relationship: newRel }); await chartdbRef.current.loadDiagram(id); }
                                    return { status: 'success', relationshipId: newRel.id };
                                });
                                break;
                            }

                            case 'add_area': {
                                const id = await getTargetId();
                                if (id !== chartdbRef.current.diagramId) throw new Error('Switch to the diagram first.');
                                const areaData = params.area || params;
                                const newArea = {
                                    id: generateId(),
                                    name: areaData.name,
                                    color: areaData.color || '#e2e8f0',
                                    x: areaData.x || 0,
                                    y: areaData.y || 0,
                                    width: areaData.width || 200,
                                    height: areaData.height || 200,
                                };
                                await chartdbRef.current.addArea(newArea);
                                result = { status: 'success', areaId: newArea.id };
                                break;
                            }

                            case 'add_note': {
                                const id = await getTargetId();
                                if (id !== chartdbRef.current.diagramId) throw new Error('Switch to the diagram first.');
                                const noteData = params.note || params;
                                const newNote = {
                                    id: generateId(),
                                    content: noteData.content,
                                    x: noteData.x || 0,
                                    y: noteData.y || 0,
                                    color: noteData.color || '#fef3c7',
                                    createdAt: new Date(),
                                    updatedAt: new Date(),
                                };
                                await chartdbRef.current.addNote(newNote);
                                result = { status: 'success', noteId: newNote.id };
                                break;
                            }

                            case 'update_table':
                                await chartdbRef.current.updateTable(params.id, params.attributes);
                                result = { status: 'success' };
                                break;

                            case 'delete_table':
                                await chartdbRef.current.removeTable(params.id);
                                result = { status: 'success' };
                                break;

                            default:
                                result = { error: `Method ${message.method} not implemented` };
                        }
                    } catch (err) {
                        result = { status: 'error', error: (err as Error).message };
                        console.error('[MCP] Error:', err);
                    } finally { console.groupEnd(); }
                    
                    ws.send(JSON.stringify({ type: 'response', id: message.id, result: result || { status: 'success' } }));
                }
            };

            ws.onclose = () => { setIsConnected(false); setTimeout(connect, 3000); };
        };
        connect();
    }, [navigate, updateConfig]);

    return <MCPContext.Provider value={{ isConnected }}>{children}</MCPContext.Provider>;
};

export const useMCP = () => {
    const context = useContext(MCPContext);
    if (!context) throw new Error('useMCP must be used within MCPProvider');
    return context;
};
