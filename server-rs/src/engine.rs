//! Uma mão de poker No-Limit: Texas Hold'em ou poker de 5 cartas (draw).
//!
//! Porte de `shared/engine.ts`, com as mesmas regras e os mesmos eventos — o cliente não sabe
//! dizer de qual servidor veio a mão. As duas implementações precisam concordar, e é por isso que
//! os testes daqui são os mesmos de lá (inclusive o de conservação de fichas em 200 mãos).
//!
//! **Diferença de forma, não de conteúdo:** no TypeScript cada mutação chama `onEvent` e quem
//! ouve tira uma foto do estado na hora. Em Rust isso brigaria com o empréstimo mutável, então
//! cada evento sai acompanhado da foto (`HandStep`), tirada no mesmo instante em que sairia lá.

use crate::cards::{shuffled_deck, Card};
use crate::evaluator::{evaluate_hand, HandValue};
use serde::{Deserialize, Serialize};

// ------------------------------------------------------------------ tipos da rede

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Street {
    Preflop,
    Flop,
    Turn,
    River,
    Predraw,
    Draw,
    Postdraw,
    Showdown,
}

/// É a rodada de apostas dos blinds? (o big blind já é aposta, então o 1º aumento é "raise")
pub fn is_first_street(street: Street) -> bool {
    matches!(street, Street::Preflop | Street::Predraw)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GameVariant {
    Holdem,
    Draw5,
}

impl GameVariant {
    /// Cartas na mão de cada jogador.
    pub fn hole_cards(self) -> usize {
        match self {
            GameVariant::Holdem => 2,
            GameVariant::Draw5 => 5,
        }
    }

    /// A primeira rodada de apostas (a dos blinds).
    pub fn first_street(self) -> Street {
        match self {
            GameVariant::Holdem => Street::Preflop,
            GameVariant::Draw5 => Street::Predraw,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActionType {
    Fold,
    Check,
    Call,
    Raise,
    Allin,
}

/// O que aparece na placa do jogador: a jogada, ou o blind que ele postou.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LastAction {
    Fold,
    Check,
    Call,
    Raise,
    Allin,
    Sb,
    Bb,
}

impl From<ActionType> for LastAction {
    fn from(a: ActionType) -> Self {
        match a {
            ActionType::Fold => LastAction::Fold,
            ActionType::Check => LastAction::Check,
            ActionType::Call => LastAction::Call,
            ActionType::Raise => LastAction::Raise,
            ActionType::Allin => LastAction::Allin,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerAction {
    #[serde(rename = "type")]
    pub kind: ActionType,
    /// Para 'raise': valor TOTAL da aposta na rodada ("aumentar para").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub amount: Option<i64>,
}

impl PlayerAction {
    pub fn new(kind: ActionType) -> Self {
        PlayerAction { kind, amount: None }
    }
    pub fn raise_to(amount: i64) -> Self {
        PlayerAction { kind: ActionType::Raise, amount: Some(amount) }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegalActions {
    pub can_fold: bool,
    pub can_check: bool,
    pub can_call: bool,
    pub call_amount: i64,
    pub can_raise: bool,
    pub min_raise_to: i64,
    pub max_raise_to: i64,
    /// true quando ainda não há aposta na rodada (o botão vira "Apostar").
    pub is_bet: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PotWinner {
    pub seat: usize,
    pub amount: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hand: Option<String>,
    /// As cinco cartas da mão feita.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub best: Option<Vec<Card>>,
    /// Só as cartas que fazem o jogo — é o que ganha destaque e efeito.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub core: Option<Vec<Card>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeatAmount {
    pub seat: usize,
    pub amount: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PotResult {
    pub amount: i64,
    pub winners: Vec<PotWinner>,
    /// Quanto cada jogador colocou neste pote (inclui quem desistiu).
    pub paid: Vec<SeatAmount>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlindPost {
    pub seat: usize,
    pub amount: i64,
    pub kind: LastAction,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reveal {
    pub seat: usize,
    pub cards: Vec<Card>,
    pub hand: String,
}

/// Os eventos da mão, no mesmo formato que o cliente já entende.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum HandEvent {
    Blinds { posts: Vec<BlindPost> },
    Deal { order: Vec<usize> },
    Action { seat: usize, action: ActionType, amount: i64, bet_to: i64, all_in: bool },
    Refund { seat: usize, amount: i64 },
    Collect { bets: Vec<SeatAmount> },
    Street { street: Street, cards: Vec<Card> },
    Showdown { reveals: Vec<Reveal> },
    Win { pots: Vec<PotResult>, uncontested: bool },
    /// Poker de 5 cartas: o jogador trocou as cartas nas posições `discards`.
    Draw { seat: usize, discards: Vec<usize> },
}

// ------------------------------------------------------------------ estado

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    /// A vez é de apostar.
    Bet,
    /// A vez é de trocar cartas (só no poker de 5 cartas).
    Draw,
}

#[derive(Debug, Clone)]
pub struct HandPlayer {
    pub seat: usize,
    pub id: String,
    pub stack: i64,
    pub hole: Vec<Card>,
    /// Fichas apostadas na rodada atual.
    pub bet: i64,
    /// Fichas investidas na mão inteira.
    pub total: i64,
    pub folded: bool,
    pub all_in: bool,
    pub acted: bool,
    /// Valor de `current_bet` quando o jogador agiu (regra de reabertura).
    pub acted_at: i64,
    pub last_action: Option<LastAction>,
    pub revealed: bool,
    /// Poker de 5 cartas: quantas cartas trocou.
    pub drew: Option<usize>,
}

/// A foto do jogador no instante do evento (é o que a sala usa para montar a view).
#[derive(Debug, Clone)]
pub struct SeatSnapshot {
    pub seat: usize,
    pub id: String,
    pub stack: i64,
    pub bet: i64,
    pub folded: bool,
    pub all_in: bool,
    pub hole: Vec<Card>,
    pub last_action: Option<LastAction>,
    pub revealed: bool,
    pub drew: Option<usize>,
}

/// A foto da mão no instante do evento.
#[derive(Debug, Clone)]
pub struct HandSnapshot {
    pub street: Street,
    pub phase: Phase,
    pub board: Vec<Card>,
    pub pot: i64,
    pub current_bet: i64,
    pub to_act: Option<usize>,
    pub finished: bool,
    pub seq: u64,
    pub players: Vec<SeatSnapshot>,
    pub results: Vec<PotResult>,
}

/// Um evento com a foto de quando ele aconteceu.
#[derive(Debug, Clone)]
pub struct HandStep {
    pub ev: HandEvent,
    pub state: HandSnapshot,
}

pub struct HandConfig {
    pub players: Vec<(usize, String, i64)>, // (assento, id, fichas)
    pub dealer_seat: usize,
    pub small_blind: i64,
    pub big_blind: i64,
    /// Baralho fixo (teste); None embaralha.
    pub deck: Option<Vec<Card>>,
    pub variant: GameVariant,
}

pub struct Hand {
    pub players: Vec<HandPlayer>,
    pub small_blind: i64,
    pub big_blind: i64,
    pub variant: GameVariant,
    pub board: Vec<Card>,
    pub street: Street,
    pub phase: Phase,
    /// Fichas já recolhidas ao pote central (sem as apostas da rodada).
    pub pot: i64,
    pub current_bet: i64,
    pub min_raise: i64,
    to_act: Option<usize>,
    pub finished: bool,
    pub results: Vec<PotResult>,
    /// Incrementa a cada ação aplicada — a sala usa para identificar "vezes" distintas.
    pub seq: u64,
    pub dealer_idx: usize,
    pub sb_idx: Option<usize>,
    pub bb_idx: Option<usize>,
    deck: Vec<Card>,
    /// Cartas descartadas na troca: voltam ao baralho embaralhadas se ele acabar.
    muck: Vec<Card>,
    drawn: Vec<usize>,
    steps: Vec<HandStep>,
}

impl Hand {
    pub fn new(cfg: HandConfig) -> Result<Hand, String> {
        if cfg.players.len() < 2 {
            return Err("São necessários ao menos 2 jogadores".into());
        }
        let mut players: Vec<HandPlayer> = cfg
            .players
            .iter()
            .map(|(seat, id, stack)| HandPlayer {
                seat: *seat,
                id: id.clone(),
                stack: *stack,
                hole: vec![],
                bet: 0,
                total: 0,
                folded: false,
                all_in: false,
                acted: false,
                acted_at: 0,
                last_action: None,
                revealed: false,
                drew: None,
            })
            .collect();
        players.sort_by_key(|p| p.seat);
        let dealer_idx = players.iter().position(|p| p.seat == cfg.dealer_seat).unwrap_or(0);
        Ok(Hand {
            players,
            small_blind: cfg.small_blind,
            big_blind: cfg.big_blind,
            variant: cfg.variant,
            board: vec![],
            street: cfg.variant.first_street(),
            phase: Phase::Bet,
            pot: 0,
            current_bet: 0,
            min_raise: cfg.big_blind,
            to_act: None,
            finished: false,
            results: vec![],
            seq: 0,
            dealer_idx,
            sb_idx: None,
            bb_idx: None,
            deck: cfg.deck.unwrap_or_else(shuffled_deck),
            muck: vec![],
            drawn: vec![],
            steps: vec![],
        })
    }

    // ---------------------------------------------------------------- consultas

    pub fn by_seat(&self, seat: usize) -> Option<&HandPlayer> {
        self.players.iter().find(|p| p.seat == seat)
    }

    pub fn to_act_seat(&self) -> Option<usize> {
        self.to_act.map(|i| self.players[i].seat)
    }

    /// Pote total incluindo as apostas da rodada.
    pub fn total_pot(&self) -> i64 {
        self.pot + self.players.iter().map(|p| p.bet).sum::<i64>()
    }

    /// Tira os eventos acumulados (cada um com a foto de quando aconteceu).
    pub fn take_steps(&mut self) -> Vec<HandStep> {
        std::mem::take(&mut self.steps)
    }

    fn next_idx(&self, i: usize) -> usize {
        (i + 1) % self.players.len()
    }

    fn active_count(&self) -> usize {
        self.players.iter().filter(|p| !p.folded).count()
    }

    fn needs_to_act(&self, p: &HandPlayer) -> bool {
        !p.folded && !p.all_in && (!p.acted || p.bet < self.current_bet)
    }

    pub fn legal_actions(&self, seat: usize) -> Option<LegalActions> {
        let p = self.by_seat(seat)?;
        if p.folded || p.all_in || self.finished || self.phase == Phase::Draw {
            return None;
        }
        let to_call = (self.current_bet - p.bet).max(0);
        let call_amount = to_call.min(p.stack);
        let others_can_act = self.players.iter().any(|o| o.seat != seat && !o.folded && !o.all_in);
        let reopened = !p.acted || self.current_bet - p.acted_at >= self.min_raise;
        let can_raise = p.stack > to_call && reopened && others_can_act;
        let max_raise_to = p.bet + p.stack;
        let min_raise_to = (self.current_bet + self.min_raise).min(max_raise_to);
        Some(LegalActions {
            can_fold: to_call > 0,
            can_check: to_call == 0,
            can_call: to_call > 0,
            call_amount,
            can_raise,
            min_raise_to,
            max_raise_to,
            is_bet: self.current_bet == 0,
        })
    }

    fn snapshot(&self) -> HandSnapshot {
        HandSnapshot {
            street: self.street,
            phase: self.phase,
            board: self.board.clone(),
            pot: self.pot,
            current_bet: self.current_bet,
            to_act: self.to_act_seat(),
            finished: self.finished,
            seq: self.seq,
            results: self.results.clone(),
            players: self
                .players
                .iter()
                .map(|p| SeatSnapshot {
                    seat: p.seat,
                    id: p.id.clone(),
                    stack: p.stack,
                    bet: p.bet,
                    folded: p.folded,
                    all_in: p.all_in,
                    hole: p.hole.clone(),
                    last_action: p.last_action,
                    revealed: p.revealed,
                    drew: p.drew,
                })
                .collect(),
        }
    }

    fn emit(&mut self, ev: HandEvent) {
        let state = self.snapshot();
        self.steps.push(HandStep { ev, state });
    }

    // ---------------------------------------------------------------- fluxo

    pub fn start(&mut self) {
        let n = self.players.len();
        let (sb_idx, bb_idx) = if n == 2 {
            (self.dealer_idx, self.next_idx(self.dealer_idx))
        } else {
            let sb = self.next_idx(self.dealer_idx);
            (sb, self.next_idx(sb))
        };
        self.sb_idx = Some(sb_idx);
        self.bb_idx = Some(bb_idx);

        let mut posts = Vec::new();
        for (i, amount, kind) in [(sb_idx, self.small_blind, LastAction::Sb), (bb_idx, self.big_blind, LastAction::Bb)] {
            let p = &mut self.players[i];
            let a = amount.min(p.stack);
            p.stack -= a;
            p.bet += a;
            p.total += a;
            p.last_action = Some(kind);
            if p.stack == 0 {
                p.all_in = true;
            }
            posts.push(BlindPost { seat: p.seat, amount: a, kind });
        }
        self.current_bet = self.big_blind;
        self.min_raise = self.big_blind;
        self.emit(HandEvent::Blinds { posts });

        // distribuição: uma volta por carta, começando à esquerda do dealer
        let mut order = Vec::new();
        for _ in 0..self.variant.hole_cards() {
            let mut i = self.next_idx(self.dealer_idx);
            for _ in 0..n {
                let card = self.deck.pop().expect("baralho vazio na distribuição");
                self.players[i].hole.push(card);
                order.push(self.players[i].seat);
                i = self.next_idx(i);
            }
        }
        self.emit(HandEvent::Deal { order });

        // primeiro a agir: à esquerda do BB (no heads-up, o dealer/SB)
        self.advance_or_next(bb_idx);
    }

    pub fn act(&mut self, seat: usize, action: PlayerAction) -> Result<(), String> {
        if self.finished {
            return Err("A mão já terminou".into());
        }
        if self.phase == Phase::Draw {
            return Err("É a hora de trocar cartas".into());
        }
        let idx = match self.to_act {
            Some(i) if self.players[i].seat == seat => i,
            _ => return Err("Não é a sua vez".into()),
        };
        let legal = match self.legal_actions(seat) {
            Some(l) => l,
            None => return Err("Ação inválida".into()),
        };
        let mut kind = action.kind;
        let mut added: i64 = 0;

        match kind {
            ActionType::Fold => {
                if legal.can_check {
                    kind = ActionType::Check; // nunca desistir de graça
                } else {
                    self.players[idx].folded = true;
                }
            }
            ActionType::Check => {
                if !legal.can_check {
                    return Err("Não é possível dar check".into());
                }
            }
            ActionType::Call => {
                if !legal.can_call {
                    kind = ActionType::Check;
                } else {
                    added = legal.call_amount;
                }
            }
            ActionType::Raise | ActionType::Allin => {
                let mut to = if kind == ActionType::Allin { legal.max_raise_to } else { action.amount.unwrap_or(0) };
                if to >= legal.max_raise_to {
                    to = legal.max_raise_to;
                    kind = ActionType::Allin;
                }
                if to <= self.current_bet {
                    // "all-in" que não cobre a aposta atual é um call
                    if kind == ActionType::Allin {
                        added = self.players[idx].stack;
                    } else {
                        return Err("Valor de aumento inválido".into());
                    }
                } else if !legal.can_raise {
                    if kind == ActionType::Allin {
                        // sem direito a aumentar: vira call (all-in se o call cobrir tudo)
                        added = legal.call_amount;
                        kind = if added == self.players[idx].stack { ActionType::Allin } else { ActionType::Call };
                    } else {
                        return Err("Aumento não permitido".into());
                    }
                } else if to < legal.min_raise_to && kind != ActionType::Allin {
                    return Err(format!("O aumento mínimo é para {}", legal.min_raise_to));
                } else {
                    let increment = to - self.current_bet;
                    if increment >= self.min_raise {
                        self.min_raise = increment;
                    }
                    self.current_bet = to;
                    added = to - self.players[idx].bet;
                }
            }
        }

        {
            let current_bet = self.current_bet;
            let p = &mut self.players[idx];
            if added > 0 {
                p.stack -= added;
                p.bet += added;
                p.total += added;
            }
            if p.stack == 0 && !p.folded {
                p.all_in = true;
                if kind != ActionType::Fold {
                    kind = ActionType::Allin;
                }
            }
            p.acted = true;
            p.acted_at = current_bet;
            p.last_action = Some(kind.into());
        }
        self.seq += 1;
        self.to_act = None;
        let (seat_no, bet_to, all_in) = {
            let p = &self.players[idx];
            (p.seat, p.bet, p.all_in)
        };
        self.emit(HandEvent::Action { seat: seat_no, action: kind, amount: added, bet_to, all_in });

        self.advance_or_next(idx);
        Ok(())
    }

    fn round_complete(&self) -> bool {
        let active: Vec<&HandPlayer> = self.players.iter().filter(|p| !p.folded).collect();
        if active.len() <= 1 {
            return true;
        }
        let can_act: Vec<&&HandPlayer> = active.iter().filter(|p| !p.all_in).collect();
        if can_act.is_empty() {
            return true;
        }
        if can_act.len() == 1 {
            return can_act[0].bet >= self.current_bet;
        }
        can_act.iter().all(|p| p.acted && p.bet == self.current_bet)
    }

    /// Após uma ação (ou o começo), decide se passa a vez ou encerra a rodada.
    fn advance_or_next(&mut self, from_idx: usize) {
        if !self.round_complete() {
            let mut i = self.next_idx(from_idx);
            for _ in 0..self.players.len() {
                if self.needs_to_act(&self.players[i]) {
                    self.to_act = Some(i);
                    return;
                }
                i = self.next_idx(i);
            }
        }
        self.end_street();
    }

    /// Primeiro jogador (à esquerda do dealer) que ainda precisa agir na rodada.
    fn first_to_act(&mut self) -> bool {
        let mut i = self.next_idx(self.dealer_idx);
        for _ in 0..self.players.len() {
            if self.needs_to_act(&self.players[i]) {
                self.to_act = Some(i);
                return true;
            }
            i = self.next_idx(i);
        }
        false
    }

    fn end_street(&mut self) {
        self.to_act = None;
        // devolve aposta não pagada
        let mut bets: Vec<(usize, i64)> = self.players.iter().enumerate().map(|(i, p)| (i, p.bet)).collect();
        bets.sort_by(|a, b| b.1.cmp(&a.1));
        if bets.len() > 1 && bets[0].1 > bets[1].1 {
            let refund = bets[0].1 - bets[1].1;
            let idx = bets[0].0;
            let p = &mut self.players[idx];
            p.bet -= refund;
            p.total -= refund;
            p.stack += refund;
            if p.stack > 0 {
                p.all_in = false;
            }
            let seat = p.seat;
            self.emit(HandEvent::Refund { seat, amount: refund });
        }
        let collected: Vec<SeatAmount> = self
            .players
            .iter()
            .filter(|p| p.bet > 0)
            .map(|p| SeatAmount { seat: p.seat, amount: p.bet })
            .collect();
        if !collected.is_empty() {
            for p in self.players.iter_mut() {
                self.pot += p.bet;
                p.bet = 0;
            }
            self.emit(HandEvent::Collect { bets: collected });
        }
        self.current_bet = 0;
        self.min_raise = self.big_blind;
        for p in self.players.iter_mut() {
            p.acted = false;
            p.acted_at = 0;
            if p.last_action != Some(LastAction::Fold) && p.last_action != Some(LastAction::Allin) {
                p.last_action = None;
            }
        }

        if self.active_count() <= 1 {
            self.finish();
            return;
        }

        if self.variant == GameVariant::Draw5 {
            self.after_draw_street();
            return;
        }

        // abre a próxima rua; se ninguém mais puder apostar, corre o bordo até o fim
        while self.street != Street::River {
            self.deal_street();
            let can_act = self.players.iter().filter(|p| !p.folded && !p.all_in).count();
            if can_act >= 2 && self.first_to_act() {
                return;
            }
        }
        self.finish();
    }

    /// Poker de 5 cartas: da primeira rodada vai para a troca; da segunda, para o showdown.
    fn after_draw_street(&mut self) {
        if self.street != Street::Predraw {
            self.finish();
            return;
        }
        self.street = Street::Draw;
        self.phase = Phase::Draw;
        self.drawn.clear();
        self.emit(HandEvent::Street { street: Street::Draw, cards: vec![] });
        // quem não desistiu troca, na ordem, à esquerda do dealer (quem está all-in também)
        if !self.next_drawer() {
            self.end_draw_phase();
        }
    }

    /// Passa a vez da troca para o próximo que ainda não trocou; false se todos já trocaram.
    fn next_drawer(&mut self) -> bool {
        let mut i = self.next_idx(self.dealer_idx);
        for _ in 0..self.players.len() {
            let p = &self.players[i];
            if !p.folded && !self.drawn.contains(&p.seat) {
                self.to_act = Some(i);
                return true;
            }
            i = self.next_idx(i);
        }
        false
    }

    /// Todos trocaram: abre a segunda rodada de apostas (ou vai direto ao showdown).
    fn end_draw_phase(&mut self) {
        self.phase = Phase::Bet;
        self.street = Street::Postdraw;
        self.to_act = None;
        self.emit(HandEvent::Street { street: Street::Postdraw, cards: vec![] });
        let can_act = self.players.iter().filter(|p| !p.folded && !p.all_in).count();
        if can_act >= 2 && self.first_to_act() {
            return;
        }
        self.finish();
    }

    /// Tira uma carta do baralho; se ele acabar, os descartes voltam embaralhados.
    fn draw_card(&mut self) -> Card {
        if self.deck.is_empty() && !self.muck.is_empty() {
            self.deck = std::mem::take(&mut self.muck);
            crate::cards::shuffle(&mut self.deck);
        }
        self.deck.pop().expect("sem cartas para comprar")
    }

    /// Troca de cartas: descarta as posições `indices` e compra o mesmo tanto.
    pub fn draw(&mut self, seat: usize, indices: &[usize]) -> Result<(), String> {
        if self.finished {
            return Err("A mão já terminou".into());
        }
        if self.phase != Phase::Draw {
            return Err("Não é a hora de trocar cartas".into());
        }
        let idx = match self.to_act {
            Some(i) if self.players[i].seat == seat => i,
            _ => return Err("Não é a sua vez".into()),
        };
        let hole_len = self.players[idx].hole.len();
        let mut wanted: Vec<usize> = indices.iter().copied().filter(|i| *i < hole_len).collect();
        wanted.sort_unstable();
        wanted.dedup();

        let discarded: Vec<Card> = wanted.iter().map(|i| self.players[idx].hole[*i]).collect();
        for i in &wanted {
            let card = self.draw_card();
            self.players[idx].hole[*i] = card;
        }
        self.muck.extend(discarded);
        self.drawn.push(seat);
        self.players[idx].drew = Some(wanted.len());
        self.seq += 1;
        self.to_act = None;
        self.emit(HandEvent::Draw { seat, discards: wanted });
        if !self.next_drawer() {
            self.end_draw_phase();
        }
        Ok(())
    }

    fn deal_street(&mut self) {
        self.deck.pop(); // queima
        let cards: Vec<Card> = match self.street {
            Street::Preflop => {
                self.street = Street::Flop;
                vec![self.deck.pop().unwrap(), self.deck.pop().unwrap(), self.deck.pop().unwrap()]
            }
            Street::Flop => {
                self.street = Street::Turn;
                vec![self.deck.pop().unwrap()]
            }
            _ => {
                self.street = Street::River;
                vec![self.deck.pop().unwrap()]
            }
        };
        self.board.extend(cards.iter().copied());
        let street = self.street;
        self.emit(HandEvent::Street { street, cards });
    }

    fn dist_from_dealer(&self, idx: usize) -> usize {
        let n = self.players.len();
        let d = (idx + n - self.dealer_idx) % n;
        if d == 0 { n } else { d }
    }

    fn finish(&mut self) {
        self.to_act = None;
        let active: Vec<usize> = self
            .players
            .iter()
            .enumerate()
            .filter(|(_, p)| !p.folded)
            .map(|(i, _)| i)
            .collect();

        if active.len() == 1 {
            let idx = active[0];
            let amount = self.pot;
            self.players[idx].stack += amount;
            self.pot = 0;
            let seat = self.players[idx].seat;
            let paid = self
                .players
                .iter()
                .filter(|p| p.total > 0)
                .map(|p| SeatAmount { seat: p.seat, amount: p.total })
                .collect();
            self.results = vec![PotResult { amount, winners: vec![PotWinner { seat, amount, hand: None, best: None, core: None }], paid }];
            self.finished = true;
            let pots = self.results.clone();
            self.emit(HandEvent::Win { pots, uncontested: true });
            return;
        }

        // showdown
        self.street = Street::Showdown;
        let mut values: Vec<(usize, HandValue)> = Vec::new();
        for &idx in &active {
            let mut cards = self.players[idx].hole.clone();
            cards.extend(self.board.iter().copied());
            values.push((self.players[idx].seat, evaluate_hand(&cards)));
            self.players[idx].revealed = true;
        }
        let value_of = |seat: usize| -> &HandValue { &values.iter().find(|(s, _)| *s == seat).unwrap().1 };

        // ordem de exibição: a partir da esquerda do dealer
        let mut reveals = Vec::new();
        let mut i = self.next_idx(self.dealer_idx);
        for _ in 0..self.players.len() {
            let p = &self.players[i];
            if !p.folded {
                reveals.push(Reveal { seat: p.seat, cards: p.hole.clone(), hand: value_of(p.seat).name.clone() });
            }
            i = self.next_idx(i);
        }
        self.emit(HandEvent::Showdown { reveals });

        let pots = compute_pots(
            &self
                .players
                .iter()
                .map(|p| PotPlayer { seat: p.seat, total: p.total, folded: p.folded })
                .collect::<Vec<_>>(),
        );
        let mut results: Vec<PotResult> = Vec::new();
        for pot in pots {
            let best_score = pot.eligible.iter().map(|s| value_of(*s).score).max().unwrap_or(0);
            let mut winners: Vec<usize> = pot.eligible.iter().copied().filter(|s| value_of(*s).score == best_score).collect();
            // fichas ímpares vão para o primeiro vencedor à esquerda do dealer
            winners.sort_by_key(|s| {
                let idx = self.players.iter().position(|p| p.seat == *s).unwrap();
                self.dist_from_dealer(idx)
            });
            let share = pot.amount / winners.len() as i64;
            let mut rem = pot.amount - share * winners.len() as i64;
            let mut pw = Vec::new();
            for seat in winners {
                let amt = share + if rem > 0 { 1 } else { 0 };
                if rem > 0 {
                    rem -= 1;
                }
                let v = value_of(seat).clone();
                let idx = self.players.iter().position(|p| p.seat == seat).unwrap();
                self.players[idx].stack += amt;
                pw.push(PotWinner { seat, amount: amt, hand: Some(v.name), best: Some(v.best), core: Some(v.core) });
            }
            results.push(PotResult { amount: pot.amount, winners: pw, paid: pot.contributions });
        }
        self.pot = 0;
        self.results = results.clone();
        self.finished = true;
        self.emit(HandEvent::Win { pots: results, uncontested: false });
    }
}

// ------------------------------------------------------------------ potes

pub struct PotPlayer {
    pub seat: usize,
    pub total: i64,
    pub folded: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pot {
    pub amount: i64,
    pub eligible: Vec<usize>,
    pub contributions: Vec<SeatAmount>,
}

/// Divide as fichas em potes (principal e laterais) por faixas de aposta, com quanto cada um
/// colocou em cada pote — é o que permite mostrar quem pagou quem no fim da mão.
pub fn compute_pots(players: &[PotPlayer]) -> Vec<Pot> {
    let active: Vec<&PotPlayer> = players.iter().filter(|p| !p.folded).collect();
    let mut levels: Vec<i64> = active.iter().map(|p| p.total).filter(|t| *t > 0).collect();
    levels.sort_unstable();
    levels.dedup();

    let mut pots: Vec<Pot> = Vec::new();
    let mut done: Vec<(usize, i64)> = players.iter().map(|p| (p.seat, 0)).collect();
    let mut prev = 0;
    for level in levels {
        let mut amount = 0;
        let mut contributions: Vec<SeatAmount> = Vec::new();
        for p in players {
            let part = p.total.min(level) - p.total.min(prev);
            if part > 0 {
                contributions.push(SeatAmount { seat: p.seat, amount: part });
                if let Some(d) = done.iter_mut().find(|(s, _)| *s == p.seat) {
                    d.1 += part;
                }
            }
            amount += part;
        }
        let eligible: Vec<usize> = active.iter().filter(|p| p.total >= level).map(|p| p.seat).collect();
        if amount > 0 {
            pots.push(Pot { amount, eligible, contributions });
        }
        prev = level;
    }

    // sobras (fichas de quem desistiu acima do maior nível ativo) entram no último pote
    if let Some(last) = pots.last_mut() {
        for p in players {
            let already = done.iter().find(|(s, _)| *s == p.seat).map(|(_, v)| *v).unwrap_or(0);
            let rest = p.total - already;
            if rest <= 0 {
                continue;
            }
            last.amount += rest;
            match last.contributions.iter_mut().find(|c| c.seat == p.seat) {
                Some(c) => c.amount += rest,
                None => last.contributions.push(SeatAmount { seat: p.seat, amount: rest }),
            }
        }
    }

    // funde potes com o mesmo conjunto de elegíveis
    let mut merged: Vec<Pot> = Vec::new();
    for pot in pots {
        match merged.last_mut() {
            Some(last) if last.eligible == pot.eligible => {
                last.amount += pot.amount;
                for c in pot.contributions {
                    match last.contributions.iter_mut().find(|x| x.seat == c.seat) {
                        Some(prev) => prev.amount += c.amount,
                        None => last.contributions.push(c),
                    }
                }
            }
            _ => merged.push(pot),
        }
    }
    merged
}

#[cfg(test)]
#[path = "engine_tests.rs"]
mod tests;
