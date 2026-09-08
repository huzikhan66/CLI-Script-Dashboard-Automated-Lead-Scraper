export interface LeadItem {
  id: string;
  url: string;
  emails: string[];
  phones: string[];
  facebookUrl?: string;
  source: string;
  status: 'found' | 'not_found' | 'suspicious' | 'error';
  timestamp: string;
  duration?: string;
}

export interface ProgressState {
  stage: string;
  processed: number;
  total: number;
  percent: number;
  found: number;
  notFound: number;
  suspicious: number;
  errors: number;
  eta: string;
  currentItem: string;
  startedAt: string | null;
  endedAt: string | null;
  isResumed: boolean;
}

export interface CheckpointState {
  hasCheckpoint: boolean;
  cachedUrls: number;
  totalInputUrls: number;
  outputRows: number;
  suspiciousRows: number;
  canResume: boolean;
}

export interface LogEntry {
  id: string;
  time: string;
  stream: 'stdout' | 'stderr';
  text: string;
}

export interface FileMeta {
  exists: boolean;
  size: number;
  rows: number;
  mtime: string | null;
}

export interface StatusResponse {
  status: 'idle' | 'running' | 'completed' | 'stopped' | 'error';
  isRunning: boolean;
  exitCode: number | null;
  script: string;
  progress: ProgressState;
  checkpoint: CheckpointState;
  files: {
    input: FileMeta;
    output: FileMeta;
    suspicious: FileMeta;
    cache: FileMeta;
    session: FileMeta;
  };
}
