import type { Contact } from "./types.ts";

export type ContactErrors = Partial<Record<keyof Contact, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContact(c: Contact): ContactErrors {
  const e: ContactErrors = {};
  if (c.fullName.trim().length < 3) e.fullName = "Enter your full name.";
  if (!EMAIL.test(c.email.trim())) e.email = "Enter a valid email address.";
  const digits = c.phone.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) e.phone = "Enter a valid phone number, e.g. +263 77 123 4567.";
  return e;
}
