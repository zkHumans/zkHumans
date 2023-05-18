import { useState } from 'react';

export type LogFunction = (
  logType: 'info' | 'success' | 'error' | 'time',
  ...args: any[] /* eslint-disable-line @typescript-eslint/no-explicit-any */
) => void;

export function useConsole() {
  const [consoleLog, setConsoleLog] = useState([] as string[]);

  const [lastLog, setLastLog] = useState('');

  const log: LogFunction = (logType, ...args) => {
    const logTypes = {
      info: '',
      success: '✅',
      error: '❌',
      time: '⏱️',
    };
    const msg = logTypes[logType] + ' ' + args.join(' ');
    if (msg === lastLog) {
      consoleLog[0] += ' •';
      setConsoleLog(() => consoleLog);
    } else {
      setLastLog(() => msg);
      setConsoleLog((s) => [msg, ...s]);
    }
  };

  return { consoleLog, log };
}
