"use client";

import { useActionState } from "react";
import { PasswordInput } from "../login/password-input";
import { setNewPasswordAction, type NewPasswordState } from "./actions";

const initialState: NewPasswordState = { error: null };

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(setNewPasswordAction, initialState);
  return <form className="admin-login-form" action={action}>
    <label htmlFor="new-password">Yangi parol</label>
    <PasswordInput id="new-password" name="password" autoComplete="new-password" disabled={pending}/>
    <label htmlFor="new-password-confirm">Yangi parolni takrorlang</label>
    <PasswordInput id="new-password-confirm" name="confirm" autoComplete="new-password" disabled={pending}/>
    <p className="admin-login-forgot" style={{ marginTop: 0, textAlign: "left" }}>Kamida 12 ta belgi.</p>
    {state.error && <p className="admin-login-error" role="alert">{state.error}</p>}
    <button type="submit" disabled={pending}>{pending ? "Saqlanmoqda..." : "Parolni saqlash"}</button>
  </form>;
}
