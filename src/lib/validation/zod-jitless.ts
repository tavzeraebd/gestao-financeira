import { z } from "zod";

/**
 * Zod v4 sonda `new Function("")` para compilar validadores (JIT). Sob a CSP sem 'unsafe-eval'
 * (ADR-0037) a sonda é reportada como violação de script-src, mesmo capturada. `jitless` pula a sonda
 * e usa o caminho interpretado. Importado antes de qualquer schema no cliente (theme-provider).
 */
z.config({ jitless: true });
