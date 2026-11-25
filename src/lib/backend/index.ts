import { useSupabase } from "@/config";
import { mockBackend } from "./mock";
import { supabaseBackend } from "./supabase";
import type { Backend } from "./types";

export const backend: Backend = useSupabase ? supabaseBackend : mockBackend;

export type * from "./types";
export type * from "./models";
