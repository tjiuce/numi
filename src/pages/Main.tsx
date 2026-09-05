import { useState, useRef, useEffect } from 'react';
import { useTransferStore } from '../store/transferStore';
import { authenticate, fetchCollection, addItem, validateUserAccess, NumistaRateLimitError, MAX_COLLECTION_PAGES } from '../lib/numistaApi';
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
  const [pageLimitWarning, setPageLimitWarning] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [resumeRemaining, setResumeRemaining] = useState<number | null>(null);
  
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
      try {
        const saved = JSON.parse(savedJobStr);
        const remaining = (saved.itemsToCopy?.length || 0) - (saved.currentIndex || 0);
        setHasResumeJob(true);
        setResumeRemaining(remaining > 0 ? remaining : 0);
      } catch {
        localStorage.removeItem('numi_copy_job');
      }
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

  // NOTE: truncated for size - will complete in follow-up if needed
  return null;
}
