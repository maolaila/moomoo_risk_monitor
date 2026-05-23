import path from "node:path";
import { fileExists, readJsonFile } from "./utils";

export const DEFAULT_TICKER_ALIASES: Record<string, string[]> = {
  AAOI: ["Applied Optoelectronics", "AOI"],
  CIEN: ["Ciena"],
  IONQ: ["IonQ"],
  LITE: ["Lumentum"],
  SNDK: ["SanDisk", "Sandisk"],
  VIAV: ["Viavi", "Viavi Solutions"]
};

export async function loadAliases(dataDir: string): Promise<Record<string, string[]>> {
  const customPath = path.join(dataDir, "ticker_aliases.json");
  if (!(await fileExists(customPath))) {
    return DEFAULT_TICKER_ALIASES;
  }
  const custom = await readJsonFile<Record<string, string[]>>(customPath);
  return { ...DEFAULT_TICKER_ALIASES, ...custom };
}
