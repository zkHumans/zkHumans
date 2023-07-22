import { CommandLineIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

interface ConsoleProps {
  output: string[]; // output log entries in reverse order
}

export function Console({ output }: ConsoleProps) {
  const [collapsed, setCollapsed] = useState(false as boolean);
  return (
    <div className="flex flex-col">
      <div
        tabIndex={0}
        className="collapse-arrow border-base-300 bg-base-200 collapse rounded-none border"
      >
        <input
          type="checkbox"
          checked={!collapsed}
          onChange={() => setCollapsed(!collapsed)}
        />
        <div className="collapse-title flex flex-row items-center text-xl font-medium">
          <CommandLineIcon className="mr-2 h-5 w-5" strokeWidth="2" /> Console
        </div>
        <div className="collapse-content p-0">
          <div className="flex h-72 flex-col-reverse overflow-y-scroll">
            {output.map((v, i) => (
              <div key={i}>{v}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
