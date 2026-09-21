import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoginPanel } from './Login';

const panel = (over: Partial<Parameters<typeof LoginPanel>[0]> = {}) =>
  renderToStaticMarkup(
    <LoginPanel
      mode="in"
      user=""
      password=""
      remember={false}
      error={null}
      busy={false}
      serviceReady={false}
      onMode={() => {}}
      onUser={() => {}}
      onPassword={() => {}}
      onRemember={() => {}}
      onSubmit={() => {}}
      onSkip={() => {}}
      {...over}
    />,
  );

describe('painel de login', () => {
  it('pede usuário e senha, e deixa entrar sem conta', () => {
    const html = panel();
    expect(html).toContain('Usuário');
    expect(html).toContain('Senha');
    expect(html).toContain('Entrar');
    expect(html).toContain('Jogar sem conta');
  });

  it('a senha vem escondida', () => {
    const html = panel({ password: 'senha123' });
    expect(html).toContain('type="password"');
    // o valor não é escrito no HTML como texto solto
    expect(html).toContain('value="senha123"');
    expect(html).toContain('Mostrar a senha');
  });

  it('avisa, em letras miúdas, que a senha não é salva', () => {
    const html = panel();
    expect(html).toContain('Lembrar-me neste computador');
    expect(html).toContain('<b>A senha não é salva</b>');
    expect(html).toContain('o token');
  });

  it('a marca do "lembrar" acompanha o estado', () => {
    expect(panel({ remember: true })).toContain('login-remember on');
    expect(panel({ remember: false })).not.toContain('login-remember on');
  });

  it('mostra o erro quando tem erro', () => {
    const html = panel({ error: 'Usuário ou senha incorretos.' });
    expect(html).toContain('login-error');
    expect(html).toContain('Usuário ou senha incorretos.');
    expect(panel()).not.toContain('login-error');
  });

  it('enquanto entra, o botão espera', () => {
    const html = panel({ busy: true });
    expect(html).toContain('Entrando…');
    expect(html).toContain('disabled');
  });

  it('servidor sem serviço de contas: aponta o caminho de sempre', () => {
    expect(panel({ serviceReady: false })).toContain('sem serviço de contas');
    expect(panel({ serviceReady: true })).not.toContain('sem serviço de contas');
  });

  it('quando nem o servidor responde, diz o que fazer (certificado)', () => {
    const html = panel({ serviceReady: false, serviceError: 'Não foi possível falar com o servidor. Se ele usa certificado próprio, abra https://x/health uma vez e aceite o certificado.' });
    expect(html).toContain('aceite o certificado');
    // e o caminho de sempre continua à mão
    expect(html).toContain('Jogar sem conta');
  });

  it('a mesma tela cria conta, com os textos trocados', () => {
    const entrar = panel({ mode: 'in' });
    expect(entrar).toContain('>Entrar<');
    expect(entrar).toContain('Já tenho conta');

    const criar = panel({ mode: 'up' });
    expect(criar).toContain('Criar conta');
    expect(criar).toContain('Criar e entrar');
    expect(criar).toContain('pelo menos 8 caracteres');
  });
});
