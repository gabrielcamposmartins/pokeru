//! Servidor Pokeru — as regras do jogo e, adiante, as salas, as contas e o WebSocket.
//!
//! Porte de `shared/` (TypeScript), que continua sendo o que o cliente usa para jogar offline.
//! As duas implementações precisam concordar: os testes daqui são os mesmos de lá.
//!
//! O porte está em fatias; o README do projeto conta em que pé está.

pub mod cards;
pub mod engine;
pub mod evaluator;
