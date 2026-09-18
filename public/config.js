// Configuração do cliente em tempo de execução. O servidor web (Docker) reescreve este arquivo a
// partir de POKERSOUL_SERVER_URL; em desenvolvimento ele fica vazio e o cliente usa o padrão.
window.PokerSoulConfig = Object.assign({ serverUrl: '' }, window.PokerSoulConfig);
