//! Os mesmos casos de `shared/engine.test.ts`: se as duas implementações divergirem numa regra,
//! um destes quebra. Foi por isso que eles vieram junto no porte.

use super::*;
use crate::cards::new_deck;
use crate::evaluator::HandCategory;

fn cs(s: &str) -> Vec<Card> {
    s.split_whitespace().map(|c| Card::parse(c).expect(c)).collect()
}

/// Baralho com as cartas de `order` saindo primeiro (o resto atrás) — como o do TypeScript.
fn rigged_deck(order: &[Card]) -> Vec<Card> {
    let mut deck: Vec<Card> = new_deck().into_iter().filter(|c| !order.contains(c)).collect();
    deck.extend(order.iter().rev().copied());
    deck
}

fn hand_with(players: Vec<(usize, &str, i64)>, dealer: usize, variant: GameVariant, deck: Option<Vec<Card>>) -> Hand {
    Hand::new(HandConfig {
        players: players.into_iter().map(|(s, id, st)| (s, id.to_string(), st)).collect(),
        dealer_seat: dealer,
        small_blind: 10,
        big_blind: 20,
        deck,
        variant,
    })
    .unwrap()
}

/// Corre as apostas até a mão acabar ou chegar numa troca.
fn play_bets(h: &mut Hand, mut pick: impl FnMut(&Hand, usize) -> PlayerAction) {
    let mut guard = 0;
    while !h.finished && h.phase == Phase::Bet && h.to_act_seat().is_some() && guard < 300 {
        guard += 1;
        let seat = h.to_act_seat().unwrap();
        let action = pick(h, seat);
        h.act(seat, action).expect("ação recusada");
    }
}

/// Corre a mão inteira (apostas e trocas).
fn play_all(
    h: &mut Hand,
    mut bet: impl FnMut(&Hand, usize) -> PlayerAction,
    mut discards: impl FnMut(&Hand, usize) -> Vec<usize>,
) {
    let mut guard = 0;
    while !h.finished && h.to_act_seat().is_some() && guard < 300 {
        guard += 1;
        let seat = h.to_act_seat().unwrap();
        if h.phase == Phase::Draw {
            let d = discards(h, seat);
            h.draw(seat, &d).expect("troca recusada");
        } else {
            let a = bet(h, seat);
            h.act(seat, a).expect("ação recusada");
        }
    }
}

fn check_or_call(h: &Hand, seat: usize) -> PlayerAction {
    let l = h.legal_actions(seat).unwrap();
    PlayerAction::new(if l.can_check { ActionType::Check } else { ActionType::Call })
}

/// Um jogador aleatório, como no teste de conservação de fichas do TypeScript.
fn random_bet(h: &Hand, seat: usize) -> PlayerAction {
    let l = h.legal_actions(seat).unwrap();
    let r: f64 = rand::random();
    if r < 0.15 && l.can_fold {
        PlayerAction::new(ActionType::Fold)
    } else if r < 0.35 && l.can_raise {
        PlayerAction::raise_to(l.min_raise_to)
    } else if r < 0.42 {
        PlayerAction::new(ActionType::Allin)
    } else if l.can_check {
        PlayerAction::new(ActionType::Check)
    } else {
        PlayerAction::new(ActionType::Call)
    }
}

fn six_players() -> Vec<(usize, String, i64)> {
    (0..6).map(|s| (s, format!("p{s}"), 200 + s as i64 * 150)).collect()
}

#[test]
fn heads_up_dealer_e_sb_e_age_primeiro_no_preflop() {
    let mut h = hand_with(vec![(0, "a", 1000), (3, "b", 1000)], 0, GameVariant::Holdem, None);
    h.start();
    assert_eq!(h.by_seat(0).unwrap().bet, 10);
    assert_eq!(h.by_seat(3).unwrap().bet, 20);
    assert_eq!(h.to_act_seat(), Some(0));
    h.act(0, PlayerAction::new(ActionType::Call)).unwrap();
    // BB tem a opção
    assert_eq!(h.to_act_seat(), Some(3));
    h.act(3, PlayerAction::new(ActionType::Check)).unwrap();
    assert_eq!(h.street, Street::Flop);
    // pós-flop o BB (não-dealer) age primeiro
    assert_eq!(h.to_act_seat(), Some(3));
}

#[test]
fn conserva_fichas_e_termina_em_showdown() {
    for n in 0..200 {
        let players = six_players();
        let total: i64 = players.iter().map(|p| p.2).sum();
        let mut h = Hand::new(HandConfig {
            players,
            dealer_seat: n % 6,
            small_blind: 10,
            big_blind: 20,
            deck: None,
            variant: GameVariant::Holdem,
        })
        .unwrap();
        h.start();
        play_bets(&mut h, random_bet);
        assert!(h.finished, "mão não terminou");
        assert_eq!(h.players.iter().map(|p| p.stack).sum::<i64>(), total, "fichas sumiram ou apareceram");
    }
}

#[test]
fn all_in_curto_nao_reabre_a_acao_e_gera_pote_lateral() {
    // assento 0: dealer; 1: SB; 2: BB. Ordem dos pops: hole (s1,s2,s0) x2, queima, flop…
    let deck = rigged_deck(&cs("Ah Kh 2c As Kd 7d 2d 9s Jd 3c Qh 4s 5h"));
    let mut h = hand_with(vec![(0, "a", 1000), (1, "b", 1000), (2, "c", 50)], 0, GameVariant::Holdem, Some(deck));
    h.start();
    assert_eq!(h.to_act_seat(), Some(0));
    h.act(0, PlayerAction::raise_to(100)).unwrap();
    h.act(1, PlayerAction::new(ActionType::Call)).unwrap();
    // BB all-in por 50 (menor que o aumento): só pode pagar
    h.act(2, PlayerAction::new(ActionType::Allin)).unwrap();
    assert_eq!(h.street, Street::Flop);
    play_bets(&mut h, |_, _| PlayerAction::new(ActionType::Check));
    assert!(h.finished);
    assert_eq!(h.results.len(), 2, "deveria haver pote principal e lateral");
    assert_eq!(h.players.iter().map(|p| p.stack).sum::<i64>(), 2050);
}

#[test]
fn aposta_nao_pagada_e_devolvida() {
    let mut h = hand_with(vec![(0, "a", 1000), (1, "b", 1000)], 0, GameVariant::Holdem, None);
    h.start();
    h.act(0, PlayerAction::raise_to(500)).unwrap();
    h.act(1, PlayerAction::new(ActionType::Fold)).unwrap();
    assert!(h.finished);
    assert_eq!(h.by_seat(0).unwrap().stack, 1020);
    assert_eq!(h.by_seat(1).unwrap().stack, 980);
}

#[test]
fn potes_laterais_dividem_certo() {
    let pots = compute_pots(&[
        PotPlayer { seat: 0, total: 100, folded: false },
        PotPlayer { seat: 1, total: 300, folded: false },
        PotPlayer { seat: 2, total: 300, folded: false },
        PotPlayer { seat: 3, total: 50, folded: true },
    ]);
    assert_eq!(pots.len(), 2);
    assert_eq!(pots[0].amount, 350);
    assert_eq!(pots[0].eligible, vec![0, 1, 2]);
    assert_eq!(
        pots[0].contributions,
        vec![
            SeatAmount { seat: 0, amount: 100 },
            SeatAmount { seat: 1, amount: 100 },
            SeatAmount { seat: 2, amount: 100 },
            SeatAmount { seat: 3, amount: 50 },
        ]
    );
    assert_eq!(pots[1].amount, 400);
    assert_eq!(pots[1].eligible, vec![1, 2]);
    assert_eq!(pots.iter().map(|p| p.amount).sum::<i64>(), 750);
}

// ---------------------------------------------------------------- poker de 5 cartas

fn three() -> Vec<(usize, &'static str, i64)> {
    vec![(0, "a", 1000), (1, "b", 1000), (2, "c", 1000)]
}

#[test]
fn draw5_da_cinco_cartas_e_nao_usa_bordo() {
    let mut h = hand_with(three(), 0, GameVariant::Draw5, None);
    h.start();
    assert_eq!(h.street, Street::Predraw);
    assert_eq!(h.phase, Phase::Bet);
    for p in &h.players {
        assert_eq!(p.hole.len(), 5);
    }
    assert!(h.board.is_empty());
    let todas: std::collections::HashSet<String> = h.players.iter().flat_map(|p| p.hole.iter().map(|c| c.code())).collect();
    assert_eq!(todas.len(), 15);
}

#[test]
fn draw5_a_troca_vem_entre_as_duas_rodadas() {
    let mut h = hand_with(three(), 0, GameVariant::Draw5, None);
    h.start();
    play_bets(&mut h, check_or_call);
    assert_eq!(h.street, Street::Draw);
    assert_eq!(h.phase, Phase::Draw);
    assert_eq!(h.to_act_seat(), Some(1)); // SB, à esquerda do dealer
    assert!(h.legal_actions(1).is_none()); // durante a troca não se aposta

    let before = h.by_seat(1).unwrap().hole.clone();
    h.draw(1, &[0, 2]).unwrap();
    let after = h.by_seat(1).unwrap().hole.clone();
    assert_eq!(after.len(), 5);
    assert_eq!(after[1], before[1]); // as mantidas ficam no lugar
    assert_eq!(after[3], before[3]);
    assert_ne!(after[0], before[0]);
    assert_eq!(h.by_seat(1).unwrap().drew, Some(2));

    assert_eq!(h.to_act_seat(), Some(2));
    h.draw(2, &[]).unwrap(); // manter todas
    assert_eq!(h.by_seat(2).unwrap().drew, Some(0));
    h.draw(0, &[4]).unwrap();
    // todos trocaram: segunda rodada, de novo à esquerda do dealer
    assert_eq!(h.street, Street::Postdraw);
    assert_eq!(h.phase, Phase::Bet);
    assert_eq!(h.to_act_seat(), Some(1));
}

#[test]
fn draw5_apostar_na_troca_e_trocar_fora_da_vez_sao_recusados() {
    let mut h = hand_with(three(), 0, GameVariant::Draw5, None);
    h.start();
    assert!(h.draw(1, &[0]).is_err()); // ainda é rodada de apostas
    play_bets(&mut h, check_or_call);
    assert!(h.act(1, PlayerAction::new(ActionType::Check)).is_err());
    assert!(h.draw(2, &[0]).is_err()); // não é a vez do assento 2
}

#[test]
fn draw5_showdown_vale_pelas_cinco_cartas() {
    // uma volta por carta: (s1, s2, s0) x5
    let deck = rigged_deck(&cs("Ah 2c 7d Ad 3c 8d As 4c 9d Ac 5c Td Kh 6d 2h"));
    let mut h = hand_with(three(), 0, GameVariant::Draw5, Some(deck));
    h.start();
    assert_eq!(evaluate_hand(&h.by_seat(1).unwrap().hole).category, HandCategory::Quads);
    assert_eq!(evaluate_hand(&h.by_seat(2).unwrap().hole).category, HandCategory::Straight);
    play_all(&mut h, check_or_call, |_, _| vec![]);
    assert!(h.finished);
    assert_eq!(h.street, Street::Showdown);
    let win = &h.results[0];
    assert_eq!(win.winners[0].seat, 1);
    assert!(win.winners[0].hand.as_ref().unwrap().contains("Quadra"));
    assert_eq!(win.winners[0].best.as_ref().unwrap().len(), 5);
    // o destaque vai só nas quatro do jogo
    assert_eq!(win.winners[0].core.as_ref().unwrap().len(), 4);
}

#[test]
fn draw5_conserva_fichas_com_trocas_e_all_ins() {
    for n in 0..120 {
        let players = six_players();
        let total: i64 = players.iter().map(|p| p.2).sum();
        let mut h = Hand::new(HandConfig {
            players,
            dealer_seat: n % 6,
            small_blind: 10,
            big_blind: 20,
            deck: None,
            variant: GameVariant::Draw5,
        })
        .unwrap();
        h.start();
        // troca até 5 cartas: com 6 jogadores o baralho acaba e os descartes voltam
        play_all(&mut h, random_bet, |_, _| (0..(rand::random::<usize>() % 6)).collect());
        assert!(h.finished);
        assert_eq!(h.players.iter().map(|p| p.stack).sum::<i64>(), total);
        // ninguém fica com carta repetida, nem entre jogadores
        let em_jogo: Vec<String> = h.players.iter().flat_map(|p| p.hole.iter().map(|c| c.code())).collect();
        let unicas: std::collections::HashSet<&String> = em_jogo.iter().collect();
        assert_eq!(unicas.len(), em_jogo.len());
    }
}

#[test]
fn os_eventos_saem_no_formato_que_o_cliente_espera() {
    let mut h = hand_with(vec![(0, "a", 1000), (1, "b", 1000)], 0, GameVariant::Holdem, None);
    h.start();
    h.act(0, PlayerAction::raise_to(60)).unwrap();
    let steps = h.take_steps();
    let json: Vec<String> = steps.iter().map(|s| serde_json::to_string(&s.ev).unwrap()).collect();
    assert!(json[0].starts_with(r#"{"t":"blinds","posts":[{"seat":0,"amount":10,"kind":"sb"}"#), "{}", json[0]);
    assert!(json[1].starts_with(r#"{"t":"deal","order":"#), "{}", json[1]);
    let acao = json.iter().find(|j| j.contains(r#""t":"action""#)).unwrap();
    assert!(
        acao.contains(r#""action":"raise""#) && acao.contains(r#""betTo":60"#) && acao.contains(r#""allIn":false"#),
        "{acao}"
    );
    // a foto que acompanha o evento é do instante dele
    let blinds = &steps[0].state;
    assert_eq!(blinds.pot, 0);
    assert_eq!(blinds.players.iter().map(|p| p.bet).sum::<i64>(), 30);
}
