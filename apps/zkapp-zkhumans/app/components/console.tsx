import { CommandLineIcon } from '@heroicons/react/24/outline';

interface ConsoleProps {
  output: string[]; // output log entries in reverse order
}

export function Console({ output }: ConsoleProps) {
  return (
    <div
      tabIndex={0}
      className="border-base-300 bg-neutral text-neutral-content collapse-arrow collapse border"
    >
      <input type="checkbox" defaultChecked={true} />
      <div className="collapse-title text-l flex flex-row items-center font-medium">
        <CommandLineIcon className="mr-2 h-5 w-5" strokeWidth="2" /> Console
      </div>
      <div className="collapse-content flex h-28 flex-col-reverse overflow-y-scroll">
        {output.map((v, i) => (
          <div key={i}>{v}</div>
        ))}
      </div>
    </div>
  );
}
