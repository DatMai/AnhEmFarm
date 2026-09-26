import type { InputHTMLAttributes } from 'react'
export function FormField({ label, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = props.id ?? props.name
  return <label className="form-field" htmlFor={id}><span>{label}</span><input {...props} id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />{error && <small id={`${id}-error`} role="alert">{error}</small>}</label>
}
