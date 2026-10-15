import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useUi } from '@/stores/uiStore';

function PromptDialog() {
  const prompt = useUi((s) => s.prompt)!;
  const [value, setValue] = useState(prompt.initial);
  const error = prompt.validate ? prompt.validate(value) : null;
  const submit = () => {
    if (!error) prompt.resolve(value);
  };
  return (
    <Modal
      title={prompt.title}
      onClose={() => prompt.resolve(null)}
      footer={
        <>
          <button className="s-btn" onClick={() => prompt.resolve(null)}>
            Cancel
          </button>
          <button className="s-btn s-btn-primary" disabled={!!error} onClick={submit}>
            {prompt.confirmLabel}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="mb-1 block text-[12.5px]" htmlFor="solace-prompt-input">
          {prompt.label}
        </label>
        <input
          id="solace-prompt-input"
          data-autofocus
          className="s-input w-full"
          type={prompt.secret ? 'password' : 'text'}
          autoComplete={prompt.secret ? 'current-password' : 'off'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          aria-invalid={!!error && value !== prompt.initial}
        />
        <div className="mt-1 min-h-4 text-[12px] text-danger" role="status">
          {value !== prompt.initial ? error : ''}
        </div>
      </form>
    </Modal>
  );
}

/** Renders the promise-based confirm/prompt dialogs at shell level. */
export function DialogHost() {
  const confirm = useUi((s) => s.confirm);
  const prompt = useUi((s) => s.prompt);
  return (
    <>
      {confirm && (
        <Modal
          alert
          title={confirm.title}
          onClose={() => confirm.resolve('cancel')}
          footer={
            <>
              <button className="s-btn" onClick={() => confirm.resolve('cancel')}>
                {confirm.cancelLabel}
              </button>
              {confirm.altLabel && (
                <button className="s-btn s-btn-danger" onClick={() => confirm.resolve('alt')}>
                  {confirm.altLabel}
                </button>
              )}
              <button className={confirm.danger ? 's-btn s-btn-primary !border-danger !bg-danger !text-[#0b0c0f]' : 's-btn s-btn-primary'} data-autofocus onClick={() => confirm.resolve('confirm')}>
                {confirm.confirmLabel}
              </button>
            </>
          }
        >
          <div className="text-[13px]">{confirm.message}</div>
        </Modal>
      )}
      {prompt && <PromptDialog key={prompt.id} />}
    </>
  );
}
