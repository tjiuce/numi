import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export interface Credentials {
  apiKey: string;
  clientId: string;
  userId: string;
}

interface TransferState {
  source: Credentials;
  target: Credentials;
  setSource: (creds: Credentials) => void;
  setTarget: (creds: Credentials) => void;
  dryRun: boolean;
  setDryRun: (value: boolean) => void;
  accountTier: 'free' | 'paid';
  setAccountTier: (value: 'free' | 'paid') => void;
}

const defaultCreds: Credentials = { apiKey: '', clientId: '', userId: '' };

const TransferContext = createContext<TransferState | undefined>(undefined);

export function TransferProvider({ children }: { children: ReactNode }) {
  const [source, setSource] = useState<Credentials>(defaultCreds);
  const [target, setTarget] = useState<Credentials>(defaultCreds);
  const [dryRun, setDryRun] = useState<boolean>(false);
  const [accountTier, setAccountTier] = useState<'free' | 'paid'>('free');

  return (
    <TransferContext.Provider value={{ source, target, setSource, setTarget, dryRun, setDryRun, accountTier, setAccountTier }}>
      {children}
    </TransferContext.Provider>
  );
}

export function useTransferStore() {
  const context = useContext(TransferContext);
  if (!context) {
    throw new Error('useTransferStore must be used within a TransferProvider');
  }
  return context;
}
