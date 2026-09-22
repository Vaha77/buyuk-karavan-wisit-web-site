"use client";

import {useState} from "react";
import {Eye,EyeOff} from "lucide-react";

export function PasswordInput({id,name,autoComplete,disabled,minLength,maxLength}:{id:string;name:string;autoComplete:"current-password"|"new-password";disabled?:boolean;minLength?:number;maxLength?:number}){
  const[visible,setVisible]=useState(false);
  return <span className="admin-password-field"><input id={id} name={name} type={visible?"text":"password"} autoComplete={autoComplete} required disabled={disabled} minLength={minLength} maxLength={maxLength}/><button type="button" onClick={()=>setVisible(value=>!value)} disabled={disabled} aria-label={visible?"Parolni yashirish":"Parolni ko‘rsatish"} aria-pressed={visible}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></span>;
}
