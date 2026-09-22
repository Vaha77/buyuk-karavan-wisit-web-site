"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";
import {PasswordInput} from "./password-input";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  return <form className="admin-login-form" action={action}>
    <label htmlFor="admin-phone">Telefon raqam</label>
    <input id="admin-phone" name="phone" type="tel" autoComplete="username" inputMode="tel" placeholder="+998 90 123 45 67" required disabled={pending} />
    <label htmlFor="admin-password">Parol</label>
    <PasswordInput id="admin-password" name="password" autoComplete="current-password" disabled={pending}/>
    {state.error && <p className="admin-login-error" role="alert">{state.error}</p>}
    <button type="submit" disabled={pending}>{pending ? "Tekshirilmoqda..." : "Kirish"}</button>
  </form>;
}
