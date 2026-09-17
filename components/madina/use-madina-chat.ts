"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { emptyLead, fieldOrder, isValidPhone, normalizeAnswer, questions, welcome } from "./madina-mock-flow";
import type { ChatMessage, LeadField, MadinaLead } from "./madina-types";

type Stage = LeadField | "confirm" | "edit" | "success";
const firstMessage: ChatMessage = { id: 0, role: "madina", text: welcome };

export function useMadinaChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([firstMessage]);
  const [lead, setLead] = useState<MadinaLead>(emptyLead);
  const [stage, setStage] = useState<Stage>("requestType");
  const [typing, setTyping] = useState(false);
  const [editing, setEditing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(1);
  const busy = useRef(false);

  const append = useCallback((role: ChatMessage["role"], text: string) => {
    setMessages(items => [...items, { id: nextId.current++, role, text }]);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const reply = useCallback((text: string, next: Stage) => {
    setTyping(true);
    timer.current = setTimeout(() => {
      append("madina", text);
      setStage(next);
      setTyping(false);
      busy.current = false;
      timer.current = null;
    }, 540);
  }, [append]);

  const send = useCallback((raw: string) => {
    const value = raw.trim();
    if (!value || busy.current || stage === "confirm" || stage === "edit" || stage === "success") return false;
    busy.current = true;
    append("customer", value);
    if (stage === "dimensions" && value === "O‘lchamni kiritaman") {
      reply("O‘lchamni metrda yozing. Masalan: 12 × 6 × 4", "dimensions");
      return true;
    }
    if (stage === "phone" && !isValidPhone(value)) {
      reply("Telefon raqamini to‘liq kiriting. Masalan: +998 90 123 45 67", "phone");
      return true;
    }
    const normalized = normalizeAnswer(stage, value);
    setLead(current => ({ ...current, [stage]: normalized }));
    if (editing) {
      setEditing(false);
      reply("Ma’lumotlarni yana bir bor tekshirib oling.", "confirm");
      return true;
    }
    const next = fieldOrder[fieldOrder.indexOf(stage) + 1];
    reply(next ? questions[next] : "Ma’lumotlarni tekshirib oling.", next || "confirm");
    return true;
  }, [append, editing, reply, stage]);

  const chooseEdit = useCallback((field: LeadField) => {
    if (busy.current || stage !== "edit") return;
    busy.current = true;
    setEditing(true);
    append("customer", field === "customerName" ? "Ismni o‘zgartirish" : `${field} ni o‘zgartirish`);
    reply(questions[field], field);
  }, [append, reply, stage]);

  const edit = useCallback(() => {
    if (busy.current || stage !== "confirm") return;
    busy.current = true;
    append("customer", "O‘zgartirish");
    reply("Qaysi ma’lumotni o‘zgartirmoqchisiz?", "edit");
  }, [append, reply, stage]);

  const confirm = useCallback(() => {
    if (busy.current || stage !== "confirm") return;
    busy.current = true;
    append("customer", "Tasdiqlash");
    reply(`Rahmat, ${lead.customerName}.\n\nMa’lumotlaringiz qabul qilindi. BUYUK KARAVAN mutaxassisi tez orada siz bilan bog‘lanadi.`, "success");
  }, [append, lead.customerName, reply, stage]);

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    busy.current = false;
    nextId.current = 1;
    setMessages([firstMessage]);
    setLead({ ...emptyLead });
    setStage("requestType");
    setTyping(false);
    setEditing(false);
  }, []);

  return { messages, lead, stage, typing, send, chooseEdit, edit, confirm, reset };
}
