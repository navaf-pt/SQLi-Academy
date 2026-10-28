import { useState } from 'react';

interface Props {
  code: string;
  label?: string;
  tone?: 'default' | 'danger' | 'mint';
}

export function CodeBlock({ code, label, tone = 'default' }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`codeblock codeblock--${tone}`}>
      <div className="codeblock__bar">
        <span className="codeblock__label">{label ?? 'payload'}</span>
        <button type="button" className="codeblock__copy" onClick={copy}>
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
