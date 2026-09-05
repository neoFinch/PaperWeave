import {useEffect, useMemo, useRef, useState} from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
    ArrowDown, ArrowUp, Check, ChevronDown, Copy, FilePlus2, Files,
    GripVertical, LoaderCircle, Search, Sparkles, Trash2, X
} from 'lucide-react';
import './App.css';
import {ExportPDF, OpenPDFs} from '../wailsjs/go/main/App';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type PDFDocument = { id: string; name: string; path: string; pageCount: number; size: number; data: string };
type OutputPage = { key: string; documentId: string; page: number };
type Toast = { kind: 'success' | 'error'; text: string };

const pdfCache = new Map<string, Promise<pdfjs.PDFDocumentProxy>>();

function bytes(base64: string) {
    const raw = atob(base64);
    const result = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) result[i] = raw.charCodeAt(i);
    return result;
}

function formatBytes(size: number) {
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function openPDF(document: PDFDocument) {
    let pending = pdfCache.get(document.id);
    if (!pending) {
        pending = pdfjs.getDocument({data: bytes(document.data)}).promise;
        pdfCache.set(document.id, pending);
    }
    return pending;
}

function Thumb({document, page, small = false}: {document: PDFDocument; page: number; small?: boolean}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const render = async () => {
            try {
                const pdf = await openPDF(document);
                const pdfPage = await pdf.getPage(page);
                if (cancelled || !canvasRef.current) return;
                const initial = pdfPage.getViewport({scale: 1});
                const target = small ? 112 : 188;
                const viewport = pdfPage.getViewport({scale: target / initial.width});
                const canvas = canvasRef.current;
                canvas.width = viewport.width * 1.5;
                canvas.height = viewport.height * 1.5;
                canvas.style.aspectRatio = `${viewport.width}/${viewport.height}`;
                await pdfPage.render({canvasContext: canvas.getContext('2d')!, viewport,
                    transform: [1.5, 0, 0, 1.5, 0, 0], canvas}).promise;
            } catch { if (!cancelled) setFailed(true); }
        };
        render();
        return () => { cancelled = true; };
    }, [document.id, document.data, page, small]);

    return failed ? <div className="thumb-fallback"><Files size={small ? 22 : 34}/><span>Page {page}</span></div> :
        <canvas ref={canvasRef} className="page-canvas"/>;
}

function App() {
    const [documents, setDocuments] = useState<PDFDocument[]>([]);
    const [activeId, setActiveId] = useState('');
    const [output, setOutput] = useState<OutputPage[]>([]);
    const [query, setQuery] = useState('');
    const [busy, setBusy] = useState<'import' | 'export' | ''>('');
    const [toast, setToast] = useState<Toast | null>(null);
    const [outputName, setOutputName] = useState('Paperweave.pdf');
    const [dragKey, setDragKey] = useState('');

    const active = documents.find(d => d.id === activeId) ?? documents[0];
    const selected = useMemo(() => new Set(output.map(p => `${p.documentId}:${p.page}`)), [output]);
    const visiblePages = active ? Array.from({length: active.pageCount}, (_, i) => i + 1)
        .filter(page => !query || String(page).includes(query.trim())) : [];

    const notify = (next: Toast) => { setToast(next); window.setTimeout(() => setToast(null), 3200); };

    const importPDFs = async () => {
        setBusy('import');
        try {
            const incoming = (await OpenPDFs()) as PDFDocument[];
            if (!incoming?.length) return;
            setDocuments(current => {
                const paths = new Set(current.map(d => d.path));
                return [...current, ...incoming.filter(d => !paths.has(d.path))];
            });
            setActiveId(current => current || incoming[0].id);
        } catch (error) { notify({kind: 'error', text: String(error)}); }
        finally { setBusy(''); }
    };

    const togglePage = (documentId: string, page: number) => {
        const compound = `${documentId}:${page}`;
        setOutput(current => selected.has(compound)
            ? current.filter(p => `${p.documentId}:${p.page}` !== compound)
            : [...current, {key: crypto.randomUUID(), documentId, page}]);
    };

    const addVisible = () => {
        if (!active) return;
        setOutput(current => {
            const existing = new Set(current.map(p => `${p.documentId}:${p.page}`));
            return [...current, ...visiblePages.filter(page => !existing.has(`${active.id}:${page}`))
                .map(page => ({key: crypto.randomUUID(), documentId: active.id, page}))];
        });
    };

    const removeDocument = (id: string) => {
        const rest = documents.filter(d => d.id !== id);
        setDocuments(rest);
        setOutput(current => current.filter(p => p.documentId !== id));
        if (activeId === id) setActiveId(rest[0]?.id ?? '');
        pdfCache.delete(id);
    };

    const move = (index: number, delta: number) => {
        const target = index + delta;
        if (target < 0 || target >= output.length) return;
        setOutput(current => {
            const next = [...current];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const dropAt = (targetKey: string) => {
        if (!dragKey || dragKey === targetKey) return;
        setOutput(current => {
            const source = current.findIndex(p => p.key === dragKey);
            const target = current.findIndex(p => p.key === targetKey);
            const next = [...current];
            const [item] = next.splice(source, 1);
            next.splice(target, 0, item);
            return next;
        });
        setDragKey('');
    };

    const exportPDF = async () => {
        if (!output.length) return;
        setBusy('export');
        try {
            const result = await ExportPDF(output.map(item => {
                const doc = documents.find(d => d.id === item.documentId)!;
                return {path: doc.path, page: item.page};
            }), outputName);
            if (result?.path) notify({kind: 'success', text: `Saved ${result.pages} pages to ${result.path}`});
        } catch (error) { notify({kind: 'error', text: String(error)}); }
        finally { setBusy(''); }
    };

    return <div className="app-shell">
        <header className="topbar">
            <div className="brand"><div className="mark"><Files size={21}/></div><span>Paperweave</span></div>
            <div className="privacy"><span/> Files stay on your device</div>
            <button className="primary" onClick={importPDFs} disabled={!!busy}>
                {busy === 'import' ? <LoaderCircle className="spin" size={17}/> : <FilePlus2 size={17}/>} Add PDFs
            </button>
        </header>

        {documents.length === 0 ? <main className="welcome">
            <div className="welcome-art"><div className="sheet one"/><div className="sheet two"/><div className="sheet three"><Sparkles size={25}/></div></div>
            <p className="eyebrow">YOUR PDF WORKSPACE</p>
            <h1>Build one PDF from<br/><em>exactly</em> the pages you need.</h1>
            <p className="lede">Add a few documents, pick individual pages, arrange them in any order, and export a clean new PDF.</p>
            <button className="hero-button" onClick={importPDFs} disabled={!!busy}>
                {busy === 'import' ? <LoaderCircle className="spin"/> : <FilePlus2/>} Choose PDF files
            </button>
            <div className="feature-row"><span><Check/> Page-level control</span><span><Check/> Reorder anything</span><span><Check/> 100% offline</span></div>
        </main> : <main className="workspace">
            <aside className="sources">
                <div className="panel-heading"><div><span className="step">1</span><h2>Source files</h2></div><button className="icon-button" onClick={importPDFs} title="Add PDFs"><FilePlus2/></button></div>
                <div className="source-list">
                    {documents.map((doc, index) => <button className={`source-card ${active?.id === doc.id ? 'active' : ''}`} onClick={() => {setActiveId(doc.id); setQuery('')}} key={doc.id}>
                        <div className="file-icon">PDF</div>
                        <div className="file-copy"><strong>{doc.name}</strong><span>{doc.pageCount} pages · {formatBytes(doc.size)}</span></div>
                        <span className="file-index">{String(index + 1).padStart(2, '0')}</span>
                        <span className="remove-source" onClick={event => {event.stopPropagation(); removeDocument(doc.id)}}><X size={15}/></span>
                    </button>)}
                </div>
                <button className="add-source" onClick={importPDFs}><FilePlus2/> Add another PDF</button>
            </aside>

            <section className="picker">
                <div className="panel-heading picker-heading">
                    <div><span className="step">2</span><div><h2>Choose pages</h2><p>{active?.name}</p></div></div>
                    <div className="picker-actions"><label><Search size={16}/><input placeholder="Find page" value={query} onChange={e => setQuery(e.target.value)}/></label><button onClick={addVisible}>Select {query ? 'shown' : 'all'}</button></div>
                </div>
                <div className="page-grid">
                    {visiblePages.map(page => {
                        const isSelected = selected.has(`${active.id}:${page}`);
                        return <button className={`page-card ${isSelected ? 'selected' : ''}`} onClick={() => togglePage(active.id, page)} key={page}>
                            <div className="page-preview"><Thumb document={active} page={page}/><span className="checkmark"><Check/></span></div>
                            <span>Page {page}</span>
                        </button>;
                    })}
                </div>
            </section>

            <aside className="output-panel">
                <div className="panel-heading"><div><span className="step dark">3</span><div><h2>Final PDF</h2><p>{output.length} {output.length === 1 ? 'page' : 'pages'} selected</p></div></div>{output.length > 0 && <button className="clear" onClick={() => setOutput([])}>Clear</button>}</div>
                <div className="output-list">
                    {!output.length ? <div className="empty-output"><div><ChevronDown/></div><h3>Your pages land here</h3><p>Select pages from the middle panel. Then arrange them in the order you want.</p></div> :
                    output.map((item, index) => {
                        const doc = documents.find(d => d.id === item.documentId)!;
                        return <div className="output-item" draggable onDragStart={() => setDragKey(item.key)} onDragOver={e => e.preventDefault()} onDrop={() => dropAt(item.key)} key={item.key}>
                            <GripVertical className="grip"/>
                            <span className="order">{index + 1}</span>
                            <div className="mini-thumb"><Thumb document={doc} page={item.page} small/></div>
                            <div className="output-copy"><strong>Page {item.page}</strong><span>{doc.name}</span></div>
                            <div className="item-actions">
                                <button onClick={() => move(index, -1)} disabled={index === 0} title="Move up"><ArrowUp/></button>
                                <button onClick={() => move(index, 1)} disabled={index === output.length - 1} title="Move down"><ArrowDown/></button>
                                <button onClick={() => setOutput(current => [...current.slice(0, index + 1), {...item, key: crypto.randomUUID()}, ...current.slice(index + 1)])} title="Duplicate"><Copy/></button>
                                <button onClick={() => setOutput(current => current.filter(p => p.key !== item.key))} title="Remove"><Trash2/></button>
                            </div>
                        </div>;
                    })}
                </div>
                <div className="export-box">
                    <label>File name</label>
                    <input value={outputName} onChange={e => setOutputName(e.target.value)}/>
                    <button className="export-button" disabled={!output.length || !!busy} onClick={exportPDF}>
                        {busy === 'export' ? <LoaderCircle className="spin"/> : <Sparkles/>} Export combined PDF
                    </button>
                    <p>No quality loss · Original page sizes preserved</p>
                </div>
            </aside>
        </main>}
        {toast && <div className={`toast ${toast.kind}`}>{toast.kind === 'success' ? <Check/> : <X/>}<span>{toast.text}</span></div>}
    </div>;
}

export default App;
