//! Avaliador de mãos — o mesmo de `shared/evaluator.ts`, inclusive nos nomes em português e no
//! `core` (as cartas que *fazem* o jogo, que o cliente destaca com a moldura e o efeito).
//!
//! O `score` é comparável direto: categoria e valores empacotados em base 16, igual ao TypeScript,
//! então uma mão avaliada aqui e outra lá dão a mesma ordem.

use crate::cards::{rank_label, rank_name_plural, Card, Rank};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HandCategory {
    HighCard = 0,
    Pair = 1,
    TwoPair = 2,
    Trips = 3,
    Straight = 4,
    Flush = 5,
    FullHouse = 6,
    Quads = 7,
    StraightFlush = 8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HandValue {
    /// Maior = melhor; comparável direto.
    pub score: u64,
    pub category: HandCategory,
    /// Nome amigável em português, ex.: "Full House, Reis com Setes".
    pub name: String,
    /// As 5 cartas que formam a mão.
    pub best: Vec<Card>,
    /// Só as que fazem o jogo (o par, a trinca…); sequência/flush/full usam as cinco.
    pub core: Vec<Card>,
}

const BASE: u64 = 16;

fn pack(category: HandCategory, ranks: &[Rank]) -> u64 {
    let mut score = category as u64;
    for i in 0..5 {
        score = score * BASE + *ranks.get(i).unwrap_or(&0) as u64;
    }
    score
}

struct Eval5 {
    score: u64,
    category: HandCategory,
    ranks: Vec<Rank>,
}

/// Avalia exatamente 5 cartas.
fn evaluate5(cards: &[Card]) -> Eval5 {
    let mut counts: Vec<(Rank, usize)> = Vec::new();
    for c in cards {
        match counts.iter_mut().find(|(r, _)| *r == c.r) {
            Some((_, n)) => *n += 1,
            None => counts.push((c.r, 1)),
        }
    }
    // grupos por (quantidade desc, valor desc) — a mesma ordem do TypeScript
    counts.sort_by(|a, b| b.1.cmp(&a.1).then(b.0.cmp(&a.0)));
    let flush = cards.iter().all(|c| c.s == cards[0].s);

    let mut straight_high: Rank = 0;
    if counts.len() == 5 {
        let mut sorted: Vec<Rank> = counts.iter().map(|(r, _)| *r).collect();
        sorted.sort_by(|a, b| b.cmp(a));
        if sorted[0] - sorted[4] == 4 {
            straight_high = sorted[0];
        } else if sorted[0] == 14 && sorted[1] == 5 {
            straight_high = 5; // roda A-2-3-4-5
        }
    }

    let group_ranks: Vec<Rank> = counts.iter().map(|(r, _)| *r).collect();
    let (category, ranks) = if straight_high > 0 && flush {
        (HandCategory::StraightFlush, vec![straight_high])
    } else if counts[0].1 == 4 {
        (HandCategory::Quads, vec![counts[0].0, counts[1].0])
    } else if counts[0].1 == 3 && counts[1].1 == 2 {
        (HandCategory::FullHouse, vec![counts[0].0, counts[1].0])
    } else if flush {
        (HandCategory::Flush, group_ranks)
    } else if straight_high > 0 {
        (HandCategory::Straight, vec![straight_high])
    } else if counts[0].1 == 3 {
        (HandCategory::Trips, group_ranks)
    } else if counts[0].1 == 2 && counts[1].1 == 2 {
        (HandCategory::TwoPair, group_ranks)
    } else if counts[0].1 == 2 {
        (HandCategory::Pair, group_ranks)
    } else {
        (HandCategory::HighCard, group_ranks)
    };

    Eval5 { score: pack(category, &ranks), category, ranks }
}

fn describe(category: HandCategory, ranks: &[Rank]) -> String {
    match category {
        HandCategory::StraightFlush => {
            if ranks[0] == 14 {
                "Royal Flush".to_string()
            } else {
                format!("Straight Flush até {}", rank_label(ranks[0]))
            }
        }
        HandCategory::Quads => format!("Quadra de {}", rank_name_plural(ranks[0])),
        HandCategory::FullHouse => format!(
            "Full House, {} com {}",
            rank_name_plural(ranks[0]),
            rank_name_plural(ranks[1])
        ),
        HandCategory::Flush => format!("Flush, {} alto", rank_label(ranks[0])),
        HandCategory::Straight => format!("Sequência até {}", rank_label(ranks[0])),
        HandCategory::Trips => format!("Trinca de {}", rank_name_plural(ranks[0])),
        HandCategory::TwoPair => format!(
            "Dois Pares, {} e {}",
            rank_name_plural(ranks[0]),
            rank_name_plural(ranks[1])
        ),
        HandCategory::Pair => format!("Par de {}", rank_name_plural(ranks[0])),
        HandCategory::HighCard => format!("Carta Alta {}", rank_label(ranks[0])),
    }
}

/// As cartas que fazem o jogo, dentro das cinco melhores.
pub fn core_cards(best: &[Card], category: HandCategory, ranks: &[Rank]) -> Vec<Card> {
    let of = |wanted: &[Rank]| -> Vec<Card> {
        best.iter().filter(|c| wanted.contains(&c.r)).copied().collect()
    };
    match category {
        HandCategory::StraightFlush
        | HandCategory::Straight
        | HandCategory::Flush
        | HandCategory::FullHouse => best.to_vec(),
        HandCategory::Quads | HandCategory::Trips | HandCategory::Pair => of(&[ranks[0]]),
        HandCategory::TwoPair => of(&[ranks[0], ranks[1]]),
        HandCategory::HighCard => of(&[ranks[0]]),
    }
}

/// Melhor mão de 5 a partir de 5–7 cartas (com menos de 5, faz a avaliação parcial das dicas).
pub fn evaluate_hand(cards: &[Card]) -> HandValue {
    if cards.len() < 5 {
        return evaluate_partial(cards);
    }
    let n = cards.len();
    let mut best: Option<(Eval5, Vec<Card>)> = None;
    // todas as combinações de 5 (no máximo 21)
    for a in 0..n - 4 {
        for b in a + 1..n - 3 {
            for c in b + 1..n - 2 {
                for d in c + 1..n - 1 {
                    for e in d + 1..n {
                        let combo = vec![cards[a], cards[b], cards[c], cards[d], cards[e]];
                        let ev = evaluate5(&combo);
                        if best.as_ref().is_none_or(|(cur, _)| ev.score > cur.score) {
                            best = Some((ev, combo));
                        }
                    }
                }
            }
        }
    }
    let (ev, best_cards) = best.expect("com 5+ cartas sempre há uma combinação");
    HandValue {
        score: ev.score,
        category: ev.category,
        name: describe(ev.category, &ev.ranks),
        core: core_cards(&best_cards, ev.category, &ev.ranks),
        best: best_cards,
    }
}

/// Avaliação com 1–4 cartas (só pares/trincas/quadras), usada pelas dicas da interface.
pub fn evaluate_partial(cards: &[Card]) -> HandValue {
    if cards.is_empty() {
        return HandValue {
            score: 0,
            category: HandCategory::HighCard,
            name: String::new(),
            best: vec![],
            core: vec![],
        };
    }
    let mut counts: Vec<(Rank, usize)> = Vec::new();
    for c in cards {
        match counts.iter_mut().find(|(r, _)| *r == c.r) {
            Some((_, n)) => *n += 1,
            None => counts.push((c.r, 1)),
        }
    }
    counts.sort_by(|a, b| b.1.cmp(&a.1).then(b.0.cmp(&a.0)));
    let category = if counts[0].1 == 4 {
        HandCategory::Quads
    } else if counts[0].1 == 3 {
        HandCategory::Trips
    } else if counts[0].1 == 2 && counts.get(1).map(|g| g.1) == Some(2) {
        HandCategory::TwoPair
    } else if counts[0].1 == 2 {
        HandCategory::Pair
    } else {
        HandCategory::HighCard
    };
    let ranks: Vec<Rank> = counts.iter().map(|(r, _)| *r).collect();
    HandValue {
        score: pack(category, &ranks),
        category,
        name: describe(category, &ranks),
        best: vec![],
        core: vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cs(s: &str) -> Vec<Card> {
        s.split(' ').map(|c| Card::parse(c).expect(c)).collect()
    }

    /// Os mesmos casos de shared/engine.test.ts, para as duas implementações concordarem.
    #[test]
    fn classifica_categorias() {
        assert_eq!(evaluate_hand(&cs("As Ks Qs Js Ts 2d 3c")).name, "Royal Flush");
        assert_eq!(evaluate_hand(&cs("5h 4h 3h 2h Ah Kd Kc")).category, HandCategory::StraightFlush);
        assert_eq!(evaluate_hand(&cs("9s 9h 9d 9c 2d 3c 4h")).category, HandCategory::Quads);
        assert_eq!(evaluate_hand(&cs("Ks Kh Kd 7c 7d 2c 4h")).category, HandCategory::FullHouse);
        assert_eq!(evaluate_hand(&cs("2s 7s 9s Js Ks 2d 3c")).category, HandCategory::Flush);
        assert_eq!(evaluate_hand(&cs("As 2d 3c 4h 5s 9d Jc")).category, HandCategory::Straight);
        assert_eq!(evaluate_hand(&cs("Qs Qh Qd 7c 2d 3c 4h")).category, HandCategory::Trips);
        assert_eq!(evaluate_hand(&cs("Qs Qh 7d 7c 2d 3c 4h")).category, HandCategory::TwoPair);
        assert_eq!(evaluate_hand(&cs("Qs Qh 8d 7c 2d 3c 4h")).category, HandCategory::Pair);
        assert_eq!(evaluate_hand(&cs("Qs Jh 8d 7c 2d 3c 4h")).category, HandCategory::HighCard);
    }

    #[test]
    fn compara_kickers_e_rodas() {
        let wheel = evaluate_hand(&cs("As 2d 3c 4h 5s"));
        let six = evaluate_hand(&cs("6s 2d 3c 4h 5s"));
        assert!(six.score > wheel.score);
        assert!(evaluate_hand(&cs("As Ah Kd 7c 2d")).score > evaluate_hand(&cs("Ad Ac Qd 7c 2d")).score);
        assert!(evaluate_hand(&cs("Ks Kh 5d 5c Ad")).score > evaluate_hand(&cs("Ks Kh 5d 5c Qd")).score);
    }

    #[test]
    fn nomes_em_portugues_como_no_cliente() {
        assert_eq!(evaluate_hand(&cs("Ks Kh Kd 7c 7d")).name, "Full House, Reis com Setes");
        assert_eq!(evaluate_hand(&cs("7s 7h Kd 9c 2d")).name, "Par de Setes");
        assert_eq!(evaluate_hand(&cs("Ks Kh 7d 7c 2d")).name, "Dois Pares, Reis e Setes");
        assert_eq!(evaluate_hand(&cs("9s 9h 9d 9c Kd")).name, "Quadra de Noves");
        assert_eq!(evaluate_hand(&cs("2h 7h 9h Jh Kh")).name, "Flush, K alto");
        assert_eq!(evaluate_hand(&cs("5h 6d 7c 8s 9h")).name, "Sequência até 9");
        assert_eq!(evaluate_hand(&cs("As Kd 8c 5h 3d")).name, "Carta Alta A");
    }

    #[test]
    fn aponta_so_as_cartas_que_fazem_o_jogo() {
        let core = |s: &str| {
            let mut v: Vec<String> = evaluate_hand(&cs(s)).core.iter().map(|c| c.code()).collect();
            v.sort();
            v
        };
        assert_eq!(core("7s 7h Kd 9c 2d"), vec!["7h", "7s"]);
        assert_eq!(core("Ks Kh 7d 7c 2d"), vec!["7c", "7d", "Kh", "Ks"]);
        assert_eq!(core("9s 9h 9d Kc 2d"), vec!["9d", "9h", "9s"]);
        assert_eq!(core("9s 9h 9d 9c Kd"), vec!["9c", "9d", "9h", "9s"]);
        assert_eq!(core("As Kd 8c 5h 3d"), vec!["As"]);
        for hand in ["5h 6h 7h 8h 9h", "2s 7s 9s Js Ks", "As 2d 3c 4h 5s", "Ks Kh Kd 7c 7d"] {
            assert_eq!(evaluate_hand(&cs(hand)).core.len(), 5, "{hand}");
        }
        // com sete cartas, o jogo sai de dentro das cinco melhores
        let v = evaluate_hand(&cs("As Ah Kd Qc 7d 3s 2h"));
        assert_eq!(core("As Ah Kd Qc 7d 3s 2h"), vec!["Ah", "As"]);
        assert_eq!(v.best.len(), 5);
        for c in &v.core {
            assert!(v.best.contains(c));
        }
    }
}
