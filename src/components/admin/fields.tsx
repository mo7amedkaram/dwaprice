'use client';

// Client field components that surface the server action's per-field error (useFieldError). Used
// by the analytics, verification and contact forms.
import { Field, fieldInput } from './parts';
import { useFieldError } from './SettingsForm';

export function TextInput({
  name,
  label,
  help,
  defaultValue,
  placeholder,
  dir,
  inputMode,
  prefix,
}: {
  name: string;
  label: string;
  help?: React.ReactNode;
  defaultValue?: string;
  placeholder?: string;
  dir?: 'ltr' | 'rtl';
  inputMode?: 'text' | 'numeric' | 'url' | 'email';
  prefix?: string;
}) {
  const error = useFieldError(name);
  return (
    <Field label={label} htmlFor={`f-${name}`} help={help} error={error}>
      <div className="flex items-stretch">
        {prefix && <span className="mt-1 inline-flex items-center rounded-s-control border border-e-0 border-border bg-surface px-3 text-text-2" dir="ltr">{prefix}</span>}
        <input
          id={`f-${name}`}
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          dir={dir}
          inputMode={inputMode}
          aria-invalid={!!error}
          className={fieldInput + (prefix ? ' rounded-s-none' : '')}
        />
      </div>
    </Field>
  );
}
