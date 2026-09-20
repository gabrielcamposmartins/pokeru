//! Baralho: as mesmas cartas de `shared/cards.ts`, para o servidor falar a mesma língua do cliente.
//!
//! A carta viaja na rede como `{ "r": 14, "s": "s" }` — naipe em letra minúscula e valor de 2 a 14
//! (11 = J, 12 = Q, 13 = K, 14 = A), igualzinho ao TypeScript.

use rand::seq::SliceRandom;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Suit {
    S,
    H,
    D,
    C,
}

impl Suit {
    pub const ALL: [Suit; 4] = [Suit::S, Suit::H, Suit::D, Suit::C];

    pub fn letter(self) -> char {
        match self {
            Suit::S => 's',
            Suit::H => 'h',
            Suit::D => 'd',
            Suit::C => 'c',
        }
    }

    pub fn from_letter(c: char) -> Option<Suit> {
        match c {
            's' => Some(Suit::S),
            'h' => Some(Suit::H),
            'd' => Some(Suit::D),
            'c' => Some(Suit::C),
            _ => None,
        }
    }
}

/// Valor da carta: 2 a 14.
pub type Rank = u8;

pub const RANKS: [Rank; 13] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Card {
    pub r: Rank,
    pub s: Suit,
}

impl Card {
    pub fn new(r: Rank, s: Suit) -> Self {
        Card { r, s }
    }

    /// "As", "Td", "7h" — o mesmo texto que `parse` aceita (útil em teste e log).
    pub fn code(&self) -> String {
        format!("{}{}", rank_label(self.r), self.s.letter())
    }

    /// Lê "As", "Td", "7h". Devolve None se não for carta.
    pub fn parse(code: &str) -> Option<Card> {
        let mut chars = code.chars();
        let rank_part: String = chars.by_ref().take(code.chars().count() - 1).collect();
        let suit = Suit::from_letter(chars.next()?)?;
        let r = match rank_part.to_uppercase().as_str() {
            "A" => 14,
            "K" => 13,
            "Q" => 12,
            "J" => 11,
            "T" => 10,
            other => other.parse().ok()?,
        };
        if !(2..=14).contains(&r) {
            return None;
        }
        Some(Card { r, s: suit })
    }
}

impl fmt::Display for Card {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.code())
    }
}

pub fn rank_label(r: Rank) -> String {
    match r {
        14 => "A".to_string(),
        13 => "K".to_string(),
        12 => "Q".to_string(),
        11 => "J".to_string(),
        _ => r.to_string(),
    }
}

/// Nome no plural, como o cliente escreve ("Full House, Reis com Setes").
pub fn rank_name_plural(r: Rank) -> &'static str {
    match r {
        14 => "Ases",
        13 => "Reis",
        12 => "Damas",
        11 => "Valetes",
        10 => "Dez",
        9 => "Noves",
        8 => "Oitos",
        7 => "Setes",
        6 => "Seis",
        5 => "Cincos",
        4 => "Quatros",
        3 => "Três",
        2 => "Dois",
        _ => "?",
    }
}

pub fn new_deck() -> Vec<Card> {
    let mut deck = Vec::with_capacity(52);
    for s in Suit::ALL {
        for r in RANKS {
            deck.push(Card { r, s });
        }
    }
    deck
}

/// Embaralha no lugar (Fisher–Yates do `rand`).
pub fn shuffle(deck: &mut [Card]) {
    deck.shuffle(&mut rand::thread_rng());
}

pub fn shuffled_deck() -> Vec<Card> {
    let mut deck = new_deck();
    shuffle(&mut deck);
    deck
}

/// Inteiro uniforme em [0, max).
pub fn random_int(max: usize) -> usize {
    if max == 0 {
        return 0;
    }
    rand::thread_rng().gen_range(0..max)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn baralho_tem_52_cartas_diferentes() {
        let deck = new_deck();
        assert_eq!(deck.len(), 52);
        let unicas: std::collections::HashSet<_> = deck.iter().map(|c| c.code()).collect();
        assert_eq!(unicas.len(), 52);
    }

    #[test]
    fn le_e_escreve_o_codigo_da_carta() {
        assert_eq!(Card::parse("As"), Some(Card::new(14, Suit::S)));
        assert_eq!(Card::parse("Td"), Some(Card::new(10, Suit::D)));
        assert_eq!(Card::parse("7h"), Some(Card::new(7, Suit::H)));
        assert_eq!(Card::parse("2c").unwrap().code(), "2c");
        assert_eq!(Card::parse("Xz"), None);
        assert_eq!(Card::parse("1s"), None);
    }

    #[test]
    fn a_carta_vai_para_a_rede_como_no_cliente() {
        let json = serde_json::to_string(&Card::new(14, Suit::S)).unwrap();
        assert_eq!(json, r#"{"r":14,"s":"s"}"#);
        let volta: Card = serde_json::from_str(r#"{"r":9,"s":"h"}"#).unwrap();
        assert_eq!(volta, Card::new(9, Suit::H));
    }

    #[test]
    fn embaralhar_mantem_as_mesmas_cartas() {
        let mut deck = new_deck();
        shuffle(&mut deck);
        assert_eq!(deck.len(), 52);
        let unicas: std::collections::HashSet<_> = deck.iter().map(|c| c.code()).collect();
        assert_eq!(unicas.len(), 52);
    }
}
