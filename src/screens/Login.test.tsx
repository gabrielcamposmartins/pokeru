import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoginPanel } from './Login';

const panel = (over: Partial<Parameters<typeof LoginPanel>[0]> = {}) =>
  renderToStaticMarkup(
    <LoginPanel
      user=""
      password=""
      remember={false}
      error={null}
      busy={false}
      serviceReady={false}
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

  it('enquanto o serviço não existe, aponta o caminho de sempre', () => {
    expect(panel({ serviceReady: false })).toContain('está sendo construído');
    expect(panel({ serviceReady: true })).not.toContain('está sendo construído');
  });
});
