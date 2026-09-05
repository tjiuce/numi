import { useState, useRef, useEffect } from 'react';
import { useTransferStore } from '../store/transferStore';
import { authenticate, fetchCollection, addItem } from '../lib/numistaApi';
import { getGlobalStats, updateGlobalStats } from '../lib/firebase';
import { CircleHelp, Terminal } from 'lucide-react';

interface LogEntry {
  id: number;
  time: string;
  message: string;
}

const ASCII_NUMI = `
                                   /₹₹
                                  |__/
 /₹₹₹₹₹₹₹  /₹₹   /₹₹ /₹₹₹₹₹₹/₹₹₹₹  /₹₹
| ₹₹__  ₹₹| ₹₹  | ₹₹| ₹₹_  ₹₹_  ₹₹| ₹₹
| ₹₹  \\ ₹₹| ₹₹  | ₹₹| ₹₹ \\ ₹₹ \\ ₹₹| ₹₹
| ₹₹  | ₹₹| ₹₹  | ₹₹| ₹₹ | ₹₹ | ₹₹| ₹₹
| ₹₹  | ₹₹|  ₹₹₹₹₹₹/| ₹₹ | ₹₹ | ₹₹| ₹₹
|__/  |__/ \\______/ |__/ |__/ |__/|__/
                                      
`;

export default function Main() {
  const { source, target, setSource, setTarget } = useTransferStore();
  const [view, setView] = useState<'landing' | 'app'>('landing');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);

  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 0, time: new Date().toLocaleTimeString([], { hour12: false }), message: ASCII_NUMI }
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState({ totalItems: 0, totalUsers: 0 });
  const [copyStatus, setCopyStatus] = useState<{ total: number; current: number; startTime: number } | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getGlobalStats()
      .then(data => {
        if (data) setStats({ totalItems: data.totalItems, totalUsers: data.totalUsers });
      })
      .catch(err => console.error("Firebase stats error:", err));
  }, []);

  const addLog = (message: string) => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [...prev, { id: Date.now() + Math.random(), time, message }]);
  };

  const handleSourceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSource({ ...source, [e.target.name]: e.target.value });
  };

  const handleTargetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTarget({ ...target, [e.target.name]: e.target.value });
  };

  const startCopy = async () => {
    if (!source.apiKey || !target.apiKey) return;

    if (!window.confirm("WARNING: This process cannot be undone automatically. Copying will consume your monthly API limits (2,000 requests max on free tier). Are you sure you want to proceed?")) {
      return;
    }

    isCancelledRef.current = false;
    setIsRunning(true);
    setCopyStatus(null);
    setLogs([
      { id: 0, time: new Date().toLocaleTimeString([], { hour12: false }), message: ASCII_NUMI }
    ]);
    addLog("Starting Collection Copy...");

    try {
      addLog("Authenticating Source Account...");
      const sourceToken = await authenticate(source.apiKey, source.clientId);
      addLog(`Authenticated Source Account (User ID: ${source.userId})`);

      addLog("Fetching items from Source Collection...");
      const items = await fetchCollection(source.apiKey, sourceToken, source.userId);
      addLog(`Found ${items.length} items to copy.`);

      if (items.length === 0) {
        addLog("Source collection is empty. Copy aborted.");
        setIsRunning(false);
        return;
      }

      addLog("Authenticating Target Account...");
      let targetToken = await authenticate(target.apiKey, target.clientId);
      addLog(`Authenticated Target Account (User ID: ${target.userId})`);

      addLog("Fetching items from Target Collection for deduplication...");
      const targetItems = await fetchCollection(target.apiKey, targetToken, target.userId);

      const targetCounts: Record<string, number> = {};
      for (const t of targetItems) {
        const issueId = t.issue?.id || 'no-issue';
        const grade = typeof t.grade === 'object' ? t.grade?.code : (t.grade || 'no-grade');
        const key = `${issueId}-${grade}`;
        targetCounts[key] = (targetCounts[key] || 0) + 1;
      }

      const itemsToCopy = [];
      let skippedCount = 0;
      for (const s of items) {
        const issueId = s.issue?.id || 'no-issue';
        const grade = typeof s.grade === 'object' ? s.grade?.code : (s.grade || 'no-grade');
        const key = `${issueId}-${grade}`;
        
        if (targetCounts[key] > 0) {
          targetCounts[key]--;
          skippedCount++;
        } else {
          itemsToCopy.push(s);
        }
      }

      addLog(`Deduplication complete. Skipped ${skippedCount} items already in target collection.`);
      addLog(`Remaining items to copy: ${itemsToCopy.length}`);

      if (itemsToCopy.length === 0) {
        addLog("No new items to copy. Copy aborted.");
        setIsRunning(false);
        return;
      }

      addLog("Beginning copy process. Please do not close this window...");
      
      setCopyStatus({ total: itemsToCopy.length, current: 0, startTime: Date.now() });

      let success = 0;
      let failed = 0;
      let lastTokenRefresh = Date.now();

      for (let i = 0; i < itemsToCopy.length; i++) {
        if (isCancelledRef.current) {
          addLog("Copy stopped by user.");
          break;
        }

        // Refresh token every 50 minutes (3,000,000 ms) to prevent 1-hour expiry
        if (Date.now() - lastTokenRefresh > 3000000) {
          addLog("Refreshing target account OAuth token...");
          try {
            targetToken = await authenticate(target.apiKey, target.clientId);
            lastTokenRefresh = Date.now();
          } catch (e: any) {
            addLog(`[Critical Error]: Failed to refresh target token: ${e.message}`);
            break;
          }
        }

        const item = itemsToCopy[i];
        const title = item.type?.title || "Unknown Item";

        try {
          const ok = await addItem(target.apiKey, targetToken, target.userId, item);
          if (ok) {
            success++;
            addLog(`[Success] (${i + 1}/${itemsToCopy.length}) Copied: ${title}`);
          } else {
            failed++;
            addLog(`[Failed]  (${i + 1}/${itemsToCopy.length}) Could not copy: ${title}`);
          }
        } catch (e: any) {
          failed++;
          addLog(`[Error]   (${i + 1}/${itemsToCopy.length}) Error on ${title}: ${e.message}`);
        }
        
        setCopyStatus(prev => prev ? { ...prev, current: i + 1 } : null);
        await new Promise(r => setTimeout(r, 500));
      }

      addLog(`=== Copy Complete ===`);
      addLog(`Successfully copied: ${success} items.`);
      addLog(`Failed to copy: ${failed} items.`);

      if (success > 0) {
        try {
          await updateGlobalStats(success);
          addLog(`Stats successfully updated.`);
          setStats(prev => ({ totalItems: prev.totalItems + success, totalUsers: prev.totalUsers + 1 }));
        } catch (e) {
          addLog(`Notice: Could not update stats.`);
        }
      }

    } catch (err: any) {
      addLog(`[Critical Error]: ${err.message}`);
      addLog(`Copy aborted due to error.`);
    } finally {
      setIsRunning(false);
    }
  };

  const logsPanel = (
    <div className={`logs-section ${isLogsOpen ? 'open' : ''}`}>
      <div className="mobile-panel-header">
        <h2>Logs</h2>
        <button onClick={() => setIsLogsOpen(false)}>Close</button>
      </div>
      <div className="console-container flex-grow-scroll">
        <h3 className="desktop-only-heading console-header">Logs</h3>
        <div className="console">
          {logs.map((log) => (
            <div key={log.id}>
              <span style={{ color: '#666666', marginRight: '8px' }}>[{log.time}]</span>
              <span className={log.message.includes('[Error]') || log.message.includes('[Failed]') ? 'console-error' : 'console-success'}>
                {log.message}
              </span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );

  const instructionsPanel = (
    <div className={`instructions-section scrollable-col instructions-panel ${isHelpOpen ? 'open' : ''}`}>
      <div className="mobile-panel-header">
        <h2>Help & Info</h2>
        <button onClick={() => setIsHelpOpen(false)}>Close</button>
      </div>
      <h2 className="desktop-only-heading">Help & Information</h2>
      
      <h3 style={{ marginTop: '0', marginBottom: '10px', fontSize: '18px', color: '#eeeeee' }}>How to get your API Keys</h3>
      <p>Follow these instructions to safely generate API keys for both your Source and Target accounts.</p>

      <ol style={{ paddingLeft: '20px', color: '#cccccc', fontSize: '15px' }}>
        <li style={{ marginBottom: '15px' }}>
          Enable the API for your account on the <a href="https://en.numista.com/api/index.php" target="_blank" rel="noreferrer" style={{ color: '#fff' }}>Numista API page</a> (link is also at the Numista footer).
        </li>
        <li style={{ marginBottom: '15px' }}>
          Generate an API key on the <a href="https://en.numista.com/api/api_key.php" target="_blank" rel="noreferrer" style={{ color: '#fff' }}>API Key page</a>.
        </li>
        <li style={{ marginBottom: '15px' }}>
          Copy the generated <strong>API Key</strong>, <strong>Client ID</strong>, and your numeric <strong>User ID</strong> into the form fields on the left.
        </li>
      </ol>

      <div style={{ padding: '10px', background: '#111111', border: '1px solid #333333', color: '#999999', fontSize: '14px', marginTop: '15px' }}>
        <strong>API Limits:</strong> The free Numista API restricts accounts to 2,000 requests per month. Since copying an item takes 1 request, you can copy roughly <strong>1,990 items per month</strong> using a free account. If your collection is larger, you will need to resume copying next month or upgrade your API tier.
      </div>

      <div style={{ padding: '10px', background: '#111111', border: '1px solid #333333', color: '#999999', fontSize: '14px', marginTop: '10px' }}>
        <strong>Limitations:</strong> This tool successfully transfers the item's issue ID, condition/grade, quantity, swap status, and private comments. However, highly specific custom fields like purchase price or purchase date might not be supported by the API and could be omitted during transfer.
      </div>

      <div style={{ marginTop: '20px', fontSize: '13px', color: '#666666', borderTop: '1px solid #333333', paddingTop: '15px' }}>
        <strong>Disclaimer:</strong> numi is an independent, open-source tool. It is not affiliated with, endorsed by, or sponsored by Numista.
      </div>
    </div>
  );

  const isFormComplete = !!(source.apiKey && source.clientId && source.userId && target.apiKey && target.clientId && target.userId);

  const getValidationError = () => {
    if (!isFormComplete) return null;
    if (source.apiKey === target.apiKey) return "Error: Source and Target API Keys cannot be identical.";
    if (source.clientId === target.clientId) return "Error: Source and Target Client IDs cannot be identical.";
    if (source.userId === target.userId) return "Error: Source and Target User IDs cannot be identical.";
    return null;
  };

  const validationError = getValidationError();
  const canStart = isFormComplete && !validationError;

  return (
    <>
      <header className="app-header">
        <h1 onClick={() => setView('landing')} style={{ cursor: 'pointer' }} title="Go to Home">numi</h1>
        <div className="header-icons">
          <button className="icon-btn mobile-only-icon" onClick={() => setIsLogsOpen(!isLogsOpen)} title="Logs">
            <Terminal size={22} />
          </button>
          <button className="icon-btn mobile-only-icon" onClick={() => setIsHelpOpen(!isHelpOpen)} title="Help">
            <CircleHelp size={22} />
          </button>
          <a href="https://github.com/tjiuce/numi" target="_blank" rel="noreferrer" className="icon-btn" title="View on GitHub">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
              <path d="M9 18c-4.51 2-5-2-7-2" />
            </svg>
          </a>
        </div>
      </header>

      <div className="container">
        {view === 'landing' ? (
          <div style={{ marginTop: '20px' }}>
            <h2 className="landing-title" style={{ fontSize: '48px', color: '#fff', marginBottom: '10px' }}>Safely and instantly copy<br />your entire collection.</h2>
            <p className="landing-desc instructions-text" style={{ fontSize: '20px', maxWidth: '600px', marginBottom: '40px' }}>
              Moving your Numista collection from a personal account to another? Consolidating? numi automates the process securely without missing a single coin or banknote.
            </p>

            <div className="stats-container" style={{ display: 'flex', gap: '40px', marginBottom: '40px', color: '#eeeeee' }}>
              <div>
                <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.totalUsers}</div>
                <div style={{ fontSize: '14px', color: '#999999' }}>Users</div>
              </div>
              <div>
                <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.totalItems}</div>
                <div style={{ fontSize: '14px', color: '#999999' }}>Items Copied</div>
              </div>
            </div>

            <button className="try-now-btn" onClick={() => setView('app')}>
              Try Now
            </button>
            <div className="mobile-only-panels">
              {logsPanel}
              {instructionsPanel}
            </div>
          </div>
        ) : (
          <div className="three-column-grid">

            {/* Column 1: Configuration */}
            <div className="scrollable-col">
              <div className="instructions-text" style={{ marginBottom: '10px', fontSize: '15px' }}>
                Enter your API credentials to securely copy your collection.
              </div>
              <div className="fieldset">
                <div className="legend">Source (Copying From)</div>
                <div className="field">
                  <label>API Key</label>
                  <input type="password" name="apiKey" value={source.apiKey} onChange={handleSourceChange} disabled={isRunning} placeholder="e.g. n3_abc123" />
                </div>
                <div className="field">
                  <label>Client ID</label>
                  <input type="text" name="clientId" value={source.clientId} onChange={handleSourceChange} disabled={isRunning} placeholder="e.g. 12345" />
                </div>
                <div className="field">
                  <label>User ID</label>
                  <input type="text" name="userId" value={source.userId} onChange={handleSourceChange} disabled={isRunning} placeholder="e.g. 6789" />
                </div>
              </div>

              <div className="fieldset">
                <div className="legend">Target (Copying To)</div>
                <div className="field">
                  <label>API Key</label>
                  <input type="password" name="apiKey" value={target.apiKey} onChange={handleTargetChange} disabled={isRunning} placeholder="e.g. n3_xyz987" />
                </div>
                <div className="field">
                  <label>Client ID</label>
                  <input type="text" name="clientId" value={target.clientId} onChange={handleTargetChange} disabled={isRunning} placeholder="e.g. 54321" />
                </div>
                <div className="field">
                  <label>User ID</label>
                  <input type="text" name="userId" value={target.userId} onChange={handleTargetChange} disabled={isRunning} placeholder="e.g. 9876" />
                </div>
              </div>

              {validationError && (
                <div style={{ color: '#ff4444', fontSize: '14px', marginBottom: '15px', padding: '10px', background: '#1a0000', border: '1px solid #330000' }}>
                  {validationError}
                </div>
              )}

              {!isRunning ? (
                <button
                  onClick={startCopy}
                  disabled={!canStart}
                  style={{ width: '100%', padding: '10px', fontSize: '18px', borderRadius: 0 }}
                >
                  Start Collection Copy
                </button>
              ) : (
                <button
                  onClick={() => { isCancelledRef.current = true; }}
                  style={{ width: '100%', padding: '10px', fontSize: '18px', borderRadius: 0, backgroundColor: '#bb0000', color: '#ffffff', border: 'none' }}
                >
                  Stop Copying
                </button>
              )}

              {copyStatus && copyStatus.total > 0 && (
                <div style={{ marginTop: '20px', padding: '15px', border: '1px solid #333333', background: '#0a0a0a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px', color: '#cccccc' }}>
                    <span>Progress: {copyStatus.current} / {copyStatus.total}</span>
                    <span>
                      ETA: {
                        copyStatus.current > 0
                          ? (() => {
                              const elapsed = Date.now() - copyStatus.startTime;
                              const timePerItem = elapsed / copyStatus.current;
                              const remaining = copyStatus.total - copyStatus.current;
                              const etaSec = Math.ceil((timePerItem * remaining) / 1000);
                              return etaSec > 60 ? `${Math.floor(etaSec/60)}m ${etaSec%60}s` : `${etaSec}s`;
                            })()
                          : 'Calculating...'
                      }
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: '#222222', position: 'relative' }}>
                    <div style={{ width: `${(copyStatus.current / copyStatus.total) * 100}%`, height: '100%', background: '#ffffff', transition: 'width 0.3s' }}></div>
                  </div>
                </div>
              )}
            </div>

            {/* Column 2: Logs */}
            {logsPanel}

            {/* Column 3: Instructions */}
            {instructionsPanel}

          </div>
        )}
      </div>
    </>
  );
}
