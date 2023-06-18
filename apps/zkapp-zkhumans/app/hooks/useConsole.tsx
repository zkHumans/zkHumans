import { useState } from 'react';

type LogType = 'info' | 'success' | 'error' | 'time' | 'tic' | 'toc';

type LogFunction = (
  logType: LogType,
  ...args: any[] /* eslint-disable-line @typescript-eslint/no-explicit-any */
) => void;

let timingStack: [string, number][] = [];

export function useConsole() {
  const [output, setOutput] = useState([] as string[]);
  const [lastLog, setLastLog] = useState('');

  const log: LogFunction = (logType, ...args) => {
    const logTypes = {
      info: '',
      tic: '➡️',
      toc: '⬅️',
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

  const now = () => window.performance.now();

  function tic(label: string) {
    log('tic', label);
    timingStack.push([label, now()]);
  }

  function toc(logType: LogType = 'toc', msg: string | undefined = undefined) {
    const x = timingStack.pop();
    if (!x) return;

    const [label, start] = x;
    const time = (now() - start) / 1000;

    const out = [label];
    if (msg) out.push(msg);
    out.push(`⏱️ ${time.toFixed(3)} seconds`);

    log(logType, out.join(' | '));
  }

  function clearTictoc() {
    timingStack = [];
  }

  return { output, log, tic, toc, clearTictoc };
}

export type CNSL = ReturnType<typeof useConsole>;
