/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

// Sobe API e frontend juntos, com saída prefixada — sem dependências externas.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const processos = [
  { nome: 'api', cor: '\x1b[34m', args: ['run', 'dev', '-w', 'api'] },
  { nome: 'web', cor: '\x1b[35m', args: ['run', 'dev', '-w', 'web'] },
].map(({ nome, cor, args }) => {
  // detached: cada filho vira líder de um grupo de processos, para encerrarmos
  // também os netos (npm → sh → node) e não deixar portas presas.
  const filho = spawn(npm, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  const prefixar = (chunk) =>
    chunk
      .toString()
      .split('\n')
      .filter(Boolean)
      .forEach((linha) => console.log(`${cor}[${nome}]\x1b[0m ${linha}`));
  filho.stdout.on('data', prefixar);
  filho.stderr.on('data', prefixar);
  filho.on('exit', (codigo) => {
    console.log(`[${nome}] encerrado (código ${codigo})`);
    encerrar(codigo ?? 0);
  });
  return filho;
});

function encerrar(codigo = 0) {
  processos.forEach((p) => {
    if (p.exitCode !== null) return;
    try {
      if (process.platform === 'win32') p.kill();
      else process.kill(-p.pid, 'SIGTERM');
    } catch {
      /* processo já terminou */
    }
  });
  process.exit(codigo);
}

process.on('SIGINT', () => encerrar(0));
process.on('SIGTERM', () => encerrar(0));
