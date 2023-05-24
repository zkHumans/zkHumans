import { useState } from 'react';

export type LogFunction = (
  logType: 'info' | 'success' | 'error' | 'time',
  ...args: any[] /* eslint-disable-line @typescript-eslint/no-explicit-any */
) => void;

export function useConsole() {
  const [output, setOutput] = useState([] as string[]);

  const [lastLog, setLastLog] = useState('');

  const log: LogFunction = (logType, ...args) => {
    const logTypes = {
      info: '',
      success: '✅',
      error: '❌',
      time: '⏱️',
    };
    const msg = logTypes[logType] + ' ' + args.join(' ');
    setLastLog(() => msg);
    if (msg === lastLog) {
      output[0] += ' •';
      setOutput(() => output);
    } else {
      setOutput((s) => [msg, ...s]);
    }
  };

  return { output, log };
}
