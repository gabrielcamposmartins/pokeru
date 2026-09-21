import { describe, expect, it } from 'vitest';
import { whyClosed } from './transport';

/**
 * O navegador esconde o motivo de uma falha de WebSocket (é a especificação), então certificado
 * recusado e servidor fora do ar chegam iguais. Num `wss://` com certificado próprio a causa comum
 * é a primeira — e ninguém adivinha que precisa aceitar o certificado, então o recado diz.
 */
describe('por que a conexão não abriu', () => {
  it('em wss, ensina a aceitar o certificado, com o endereço certo', () => {
    const msg = whyClosed('wss://35.209.186.9:3001');
    expect(msg).toContain('https://35.209.186.9:3001/health');
    expect(msg).toContain('aceite o certificado');
  });

  it('não confunde o caminho com o host', () => {
    expect(whyClosed('wss://poker.exemplo.com:3001/ws')).toContain('https://poker.exemplo.com:3001/health');
  });

  it('em ws puro não há certificado para culpar', () => {
    const msg = whyClosed('ws://localhost:3001');
    expect(msg).toBe('Não foi possível conectar ao servidor');
    expect(msg).not.toContain('certificado');
  });
});
