import { useState, useRef, useEffect } from 'react';
import { useTransferStore } from '../store/transferStore';
import { authenticate, fetchCollection, addItem, validateUserAccess, NumistaRateLimitError } from '../lib/numistaApi';
import { getGlobalStats, updateGlobalStats } from '../lib/firebase';
import { BookOpen, Terminal, Download, Home, Settings } from 'lucide-react';
import Docs from './Docs';

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
  const { source, target, setSource, setTarget, dryRun, setDryRun, accountTier, setAccountTier } = useTransferStore();
  const [view, setView] = useState<'landing' | 'app' | 'docs' | 'logs'>('landing');

  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 0, time: new Date().toLocaleTimeString([], { hour12: false }), message: ASCII_NUMI }
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState({ totalItems: 0, totalUsers: 0 });
  const [copyStatus, setCopyStatus] = useState<{ total: number; current: number; startTime: number } | null>(null);
  
  const [previewItems, setPreviewItems] = useState<any[] | null>(null);
  const [failedItems, setFailedItems] = useState<any[]>([]);
  const [hasResumeJob, setHasResumeJob] = useState(false);
  
  const isCancelledRef = useRef<boolean>(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getGlobalStats()
      .then(data => {
        if (data) setStats({ totalItems: data.totalItems, totalUsers: data.totalUsers });
      })
      .catch(err => console.error("Firebase stats error:", err));

    const savedJobStr = localStorage.getItem('numi_copy_job');
    if (savedJobStr) {
      setHasResumeJob(true);
    }
  }, []);

  const addLog = (message: string) => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [...prev, { id: Date.now() + Math.random(), time, message }]);
  };

  const handleSourceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSource({ ...source, [e.target.name]: e.target.value });
    setPreviewItems(null);
  };

  const handleTargetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTarget({ ...target, [e.target.name]: e.target.value });
    setPreviewItems(null);
  };

  const analyzeCollection = async () => {
    if (!source.apiKey || !target.apiKey) return;
    
    isCancelledRef.current = false;
    setIsRunning(true);
    setPreviewItems(null);
    setFailedItems([]);
    setLogs([{ id: 0, time: new Date().toLocaleTimeString([], { hour12: false }), message: ASCII_NUMI }]);
    
    addLog("Starting Analysis...");
    
    try {
      addLog("Authenticating and validating Source Account...");
      const sourceToken = await authenticate(source.apiKey, source.clientId);
      await validateUserAccess(source.apiKey, sourceToken, source.userId);
      addLog(`Validated Source Account (User ID: ${source.userId})`);

      addLog("Fetching items from Source Collection...");
      const items = await fetchCollection(source.apiKey, sourceToken, source.userId);
      addLog(`Found ${items.length} items in source.`);

      if (items.length === 0) {
        addLog("Source collection is empty. Analysis complete.");
        setIsRunning(false);
        return;
      }

      addLog("Authenticating and validating Target Account...");
      const targetToken = await authenticate(target.apiKey, target.clientId);
      await validateUserAccess(target.apiKey, targetToken, target.userId);
      addLog(`Validated Target Account (User ID: ${target.userId})`);

      addLog("Fetching items from Target Collection for deduplication...");
      const targetItems = await fetchCollection(target.apiKey, targetToken, target.userId);

      const targetCounts: Record<string, number> = {};
      for (const t of targetItems) {
        const issueId = t.issue?.id || 'no-issue';
        const grade = typeof t.grade === 'object' ? t.grade?.code : (t.grade || 'no-grade');
        const key = `${issueId}-${grade}`;
        const qty = t.quantity || 1;
        targetCounts[key] = (targetCounts[key] || 0) + qty;
      }

      const itemsToCopy = [];
      let skippedCount = 0;
      for (const s of items) {
        const issueId = s.issue?.id || 'no-issue';
        const grade = typeof s.grade === 'object' ? s.grade?.code : (s.grade || 'no-grade');
        const key = `${issueId}-${grade}`;
        const sQty = s.quantity || 1;
        
        let qtyToCopy = sQty;
        if (targetCounts[key] > 0) {
          if (targetCounts[key] >= sQty) {
            targetCounts[key] -= sQty;
            skippedCount += sQty;
            qtyToCopy = 0;
          } else {
            skippedCount += targetCounts[key];
            qtyToCopy = sQty - targetCounts[key];
            targetCounts[key] = 0;
          }
        }
        
        if (qtyToCopy > 0) {
          itemsToCopy.push({
            type: s.type,
            issue: s.issue,
            quantity: qtyToCopy,
            for_swap: s.for_swap,
            grade: s.grade,
            private_comment: s.private_comment
          });
        }
      }

      addLog(`Deduplication complete. Skipped ${skippedCount} duplicates.`);
      addLog(`Items ready to copy: ${itemsToCopy.length}`);
      
      if (itemsToCopy.length === 0) {
        addLog("No new items to copy. Analysis complete.");
      } else {
        setPreviewItems(itemsToCopy);
      }
      
    } catch (err: any) {
      addLog(`[Critical Error]: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const testCredentials = async () => {
    if (!source.apiKey || !target.apiKey) return;
    
    setIsRunning(true);
    addLog("=== Testing Credentials ===");
    try {
      addLog("Testing Source Account...");
      const sourceToken = await authenticate(source.apiKey, source.clientId);
      await validateUserAccess(source.apiKey, sourceToken, source.userId);
      addLog(`[Success] Source Account Validated (User ID: ${source.userId})`);

      addLog("Testing Target Account...");
      const targetToken = await authenticate(target.apiKey, target.clientId);
      await validateUserAccess(target.apiKey, targetToken, target.userId);
      addLog(`[Success] Target Account Validated (User ID: ${target.userId})`);
      
    } catch (err: any) {
      addLog(`[Error] Credentials check failed: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const startCopy = async (isResuming: boolean = false) => {
    isCancelledRef.current = false;
    setIsRunning(true);
    setFailedItems([]);
    
    let itemsToCopy: any[] = [];
    let startIndex = 0;
    
    if (isResuming) {
      addLog("Resuming previous job...");
      const savedJobStr = localStorage.getItem('numi_copy_job');
      if (savedJobStr) {
        try {
          const savedJob = JSON.parse(savedJobStr);
          itemsToCopy = savedJob.itemsToCopy;
          startIndex = savedJob.currentIndex;
          setSource(savedJob.source);
          setTarget(savedJob.target);
          setDryRun(savedJob.dryRun);
          setAccountTier(savedJob.accountTier || 'free');
          addLog(`Loaded job: ${itemsToCopy.length - startIndex} items remaining.`);
        } catch (e) {
          addLog("[Error] Could not parse saved job.");
          setIsRunning(false);
          return;
        }
      }
    } else {
      if (!previewItems || previewItems.length === 0) {
        setIsRunning(false);
        return;
      }
      
      const warningMsg = accountTier === 'free' 
        ? "WARNING: Copying will consume your monthly API limits (2,000 requests max on free tier). Are you sure you want to proceed?"
        : "NOTE: You are using Paid/Premium Fast Mode. This will execute quickly but still consumes API quota. Proceed?";

      if (!dryRun && !window.confirm(warningMsg)) {
        setIsRunning(false);
        return;
      }

      itemsToCopy = previewItems;
      addLog(dryRun ? "Starting Dry-Run..." : (accountTier === 'paid' ? "Starting Collection Copy (Fast Mode)..." : "Starting Collection Copy..."));
      
      localStorage.setItem('numi_copy_job', JSON.stringify({
        itemsToCopy,
        currentIndex: 0,
        source,
        target,
        dryRun,
        accountTier
      }));
    }

    try {
      addLog("Authenticating Target Account...");
      let targetToken = await authenticate(target.apiKey, target.clientId);
      addLog(`Authenticated Target Account (User ID: ${target.userId})`);

      setCopyStatus({ total: itemsToCopy.length, current: startIndex, startTime: Date.now() });

      let success = 0;
      let failed = 0;
      let lastTokenRefresh = Date.now();
      const currentFailedItems: any[] = [];
      const delayMs = accountTier === 'paid' ? 50 : 500;

      for (let i = startIndex; i < itemsToCopy.length; i++) {
        if (isCancelledRef.current) {
          addLog("Copy paused/stopped by user.");
          break;
        }

        if (Date.now() - lastTokenRefresh > 3000000) {
          addLog("Refreshing target token...");
          try {
            targetToken = await authenticate(target.apiKey, target.clientId);
            lastTokenRefresh = Date.now();
          } catch (e: any) {
            addLog(`[Critical Error] Token refresh failed: ${e.message}`);
            break;
          }
        }

        const item = itemsToCopy[i];
        const title = item.type?.title || "Unknown Item";

        try {
          if (dryRun) {
            addLog(`[Dry-Run] Would copy: ${title}`);
            success++;
            await new Promise(r => setTimeout(r, 100));
          } else {
            const ok = await addItem(target.apiKey, targetToken, target.userId, item);
            if (ok) {
              success++;
              addLog(`[Success] (${i + 1}/${itemsToCopy.length}) Copied: ${title}`);
            } else {
              failed++;
              currentFailedItems.push(item);
              addLog(`[Failed]  (${i + 1}/${itemsToCopy.length}) Could not copy: ${title}`);
            }
          }
        } catch (e: any) {
          if (e instanceof NumistaRateLimitError) {
            addLog(`[Error] RATE LIMIT EXCEEDED (429). Stopping script to preserve progress.`);
            addLog(`You can resume this job once your quota resets.`);
            isCancelledRef.current = true;
            break;
          } else {
            failed++;
            currentFailedItems.push(item);
            addLog(`[Error]   (${i + 1}/${itemsToCopy.length}) Error on ${title}: ${e.message}`);
          }
        }
        
        const savedJobStr = localStorage.getItem('numi_copy_job');
        if (savedJobStr) {
          const savedJob = JSON.parse(savedJobStr);
          savedJob.currentIndex = i + 1;
          localStorage.setItem('numi_copy_job', JSON.stringify(savedJob));
        }

        setCopyStatus(prev => prev ? { ...prev, current: i + 1 } : null);
        if (!dryRun) await new Promise(r => setTimeout(r, delayMs));
      }

      addLog(`=== Copy Complete (or Paused) ===`);
      addLog(`Successfully processed: ${success} items.`);
      addLog(`Failed to process: ${failed} items.`);
      
      setFailedItems(currentFailedItems);

      const finalJobStr = localStorage.getItem('numi_copy_job');
      if (finalJobStr) {
        const finalJob = JSON.parse(finalJobStr);
        if (finalJob.currentIndex >= itemsToCopy.length) {
          localStorage.removeItem('numi_copy_job');
          setHasResumeJob(false);
          addLog("Job fully completed. History cleared.");
        }
      }

      if (success > 0 && !dryRun) {
        try {
          await updateGlobalStats(success);
          setStats(prev => ({ totalItems: prev.totalItems + success, totalUsers: prev.totalUsers + 1 }));
        } catch (e) {
        }
      }

    } catch (err: any) {
      addLog(`[Critical Error]: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const exportFailures = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(failedItems, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "numi_failed_items.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const logsPanel = (
    <div className="logs-section">
      <div className="console-container flex-grow-scroll">
        <h3 className="desktop-only-heading console-header">Logs</h3>
        <div className="console">
          {logs.map((log) => (
            <div key={log.id}>
              <span style={{ color: '#666666', marginRight: '8px' }}>[{log.time}]</span>
              <span className={
                log.message.includes('[Error]') || log.message.includes('[Failed]') || log.message.includes('[Critical Error]') ? 'console-error' :
                log.message.includes('[Warning]') || log.message.includes('RATE LIMIT EXCEEDED') ? 'console-warning' :
                log.message.includes('[Success]') || log.message.includes('Authenticated Target Account') || log.message.includes('Authenticated Source Account') || log.message.includes('Validated') || log.message.includes('Found') ? 'console-success' :
                ''
              }>
                {log.message}
              </span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
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
          <button className="icon-btn" onClick={() => setView('landing')} title="Home">
            <Home size={22} />
          </button>
          <button className="icon-btn" onClick={() => setView('app')} title="Configuration">
            <Settings size={22} />
          </button>
          <button className="icon-btn mobile-only-icon" onClick={() => setView('logs')} title="Logs">
            <Terminal size={22} />
          </button>
          <button className="icon-btn" onClick={() => setView('docs')} title="Documentation">
            <BookOpen size={22} />
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
        {view === 'landing' && (
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
          </div>
        )}
        
        {view === 'docs' && <Docs />}

        {view === 'app' && (
          <div className="two-column-grid">

            {/* Column 1: Configuration */}
            <div className="scrollable-col">
              
              {hasResumeJob && !isRunning && !previewItems && (
                <div style={{ marginBottom: '15px', padding: '15px', background: '#332200', border: '1px solid #ffaa00' }}>
                  <div style={{ color: '#ffcc00', fontWeight: 'bold', marginBottom: '8px' }}>Unfinished Job Detected</div>
                  <div style={{ color: '#e0e0e0', fontSize: '14px', marginBottom: '10px' }}>You have a copy job that was paused or interrupted.</div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => startCopy(true)} style={{ background: '#ffaa00', color: '#000', border: 'none', padding: '5px 10px', fontWeight: 'bold', cursor: 'pointer' }}>Resume Job</button>
                    <button onClick={() => { localStorage.removeItem('numi_copy_job'); setHasResumeJob(false); }} style={{ background: '#333333', border: 'none', padding: '5px 10px', color: '#e0e0e0', cursor: 'pointer' }}>Discard</button>
                  </div>
                </div>
              )}

              <div className="instructions-text" style={{ marginBottom: '15px', fontSize: '15px' }}>
                Enter your API credentials to securely copy your collection. See <a href="#" onClick={(e) => { e.preventDefault(); setView('docs'); }} style={{ color: '#fff' }}>Docs</a> for help.
              </div>

              <div className="fieldset" style={{ padding: '15px' }}>
                <div className="legend" style={{ fontSize: '18px' }}>Source Account (Copying From)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Client ID</label>
                    <input type="text" name="clientId" value={source.clientId} onChange={handleSourceChange} disabled={isRunning} placeholder="e.g. 12345" />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>User ID</label>
                    <input type="text" name="userId" value={source.userId} onChange={handleSourceChange} disabled={isRunning} placeholder="e.g. 6789" />
                  </div>
                </div>
                <div className="field">
                  <label>API Key (Client Secret)</label>
                  <input type="password" name="apiKey" value={source.apiKey} onChange={handleSourceChange} disabled={isRunning} placeholder="e.g. n3_abc123" />
                </div>
              </div>

              <div className="fieldset" style={{ padding: '15px' }}>
                <div className="legend" style={{ fontSize: '18px' }}>Target Account (Copying To)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Client ID</label>
                    <input type="text" name="clientId" value={target.clientId} onChange={handleTargetChange} disabled={isRunning} placeholder="e.g. 54321" />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>User ID</label>
                    <input type="text" name="userId" value={target.userId} onChange={handleTargetChange} disabled={isRunning} placeholder="e.g. 9876" />
                  </div>
                </div>
                <div className="field">
                  <label>API Key (Client Secret)</label>
                  <input type="password" name="apiKey" value={target.apiKey} onChange={handleTargetChange} disabled={isRunning} placeholder="e.g. n3_xyz987" />
                </div>
              </div>

              <div className="fieldset" style={{ padding: '15px' }}>
                <div className="legend" style={{ fontSize: '18px' }}>Execution Options</div>
                
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ color: '#999999', fontSize: '14px', display: 'block', marginBottom: '5px' }}>Account Tier (Affects Rate Limits)</label>
                  <select 
                    value={accountTier} 
                    onChange={(e) => setAccountTier(e.target.value as 'free' | 'paid')} 
                    disabled={isRunning}
                    style={{ width: '100%', padding: '8px', background: '#111111', color: '#eeeeee', border: '1px solid #444444', fontSize: '16px', fontFamily: 'inherit', cursor: 'pointer' }}
                  >
                    <option value="free">Free Tier (2,000 requests/mo limit)</option>
                    <option value="paid">Paid/Premium Tier (Fast Mode)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <input type="checkbox" id="dryRun" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} disabled={isRunning} style={{ marginRight: '8px', width: '18px', height: '18px', cursor: 'pointer' }} />
                  <label htmlFor="dryRun" style={{ color: '#e0e0e0', fontSize: '15px', cursor: 'pointer' }}>Dry-Run Mode (Test without copying)</label>
                </div>
              </div>

              {validationError && (
                <div style={{ color: '#ff4444', fontSize: '14px', marginBottom: '15px', padding: '10px', background: '#1a0000', border: '1px solid #330000' }}>
                  {validationError}
                </div>
              )}

              {!previewItems && !isRunning && !hasResumeJob && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                  <button
                    onClick={testCredentials}
                    disabled={!canStart}
                    style={{ padding: '12px', fontSize: '18px', borderRadius: 0, backgroundColor: '#333333' }}
                  >
                    Test Credentials
                  </button>
                  <button
                    onClick={analyzeCollection}
                    disabled={!canStart}
                    style={{ padding: '12px', fontSize: '18px', borderRadius: 0 }}
                  >
                    Analyze Collection
                  </button>
                </div>
              )}

              {previewItems && !isRunning && (
                <div style={{ marginTop: '15px', padding: '15px', background: '#111111', border: '1px solid #333333' }}>
                  <div style={{ color: '#e0e0e0', marginBottom: '10px', fontSize: '16px' }}>
                    <strong>Preview:</strong> Ready to process {previewItems.length} items.
                  </div>
                  <button
                    onClick={() => startCopy(false)}
                    style={{ width: '100%', padding: '12px', fontSize: '18px', borderRadius: 0, background: '#e0e0e0', color: '#121212' }}
                  >
                    Start {dryRun ? 'Dry-Run' : (accountTier === 'paid' ? 'Fast Copying' : 'Copying')}
                  </button>
                </div>
              )}

              {isRunning && (
                <button
                  onClick={() => { isCancelledRef.current = true; }}
                  style={{ width: '100%', padding: '12px', fontSize: '18px', borderRadius: 0, backgroundColor: '#220000', color: '#ffaaaa', border: '1px solid #550000', marginTop: '10px' }}
                >
                  Pause / Stop
                </button>
              )}

              {failedItems.length > 0 && !isRunning && (
                <button
                  onClick={exportFailures}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '12px', fontSize: '16px', borderRadius: 0, background: '#333333', marginTop: '15px', color: '#ffffff', border: 'none' }}
                >
                  <Download size={18} style={{ marginRight: '8px' }} />
                  Download Failures (JSON)
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
                              const timePerItem = elapsed / (copyStatus.current || 1);
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
            <div className="desktop-only-logs">
              {logsPanel}
            </div>

          </div>
        )}

        {view === 'logs' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {logsPanel}
          </div>
        )}
      </div>
    </>
  );
}
