//! RitualGate — the mechanics contract for RitualCoin (RITUAL).
//!
//! The mechanic: a "ritual" is lit during a daily UTC window. While it is
//! lit, any transfer routed through this gate (via the token's standard
//! `ft_transfer_call`) skims a small tax into a community pot and forwards
//! the rest to the real recipient. Every routed transfer increments a
//! collective counter; when the counter reaches the target, the whole pot
//! is released to the treasury account and the counter resets.
//!
//! Outside the window the gate refuses to take anything: `ft_on_transfer`
//! returns the full amount, which the NEP-141 resolver refunds to the sender.
//!
//! The gate never custodies user funds beyond the pot: the tax is the only
//! amount it keeps, and the pot is exactly its token balance minus pending
//! forwards — fully visible via `get_state` and `ft_balance_of`.
//!
//! NOTE on the release: the pot is NOT paid out inside `ft_on_transfer`.
//! The NEP-141 resolver (near-contract-standards `ft_resolve_transfer`)
//! guards senders by asserting the receiver's token balance does not drop
//! during the callback — paying out earlier transfers' taxes in the same
//! callback trips that guard. So completing the counter only *arms* the
//! release; anyone then calls `release_pot()` to send the pot to the
//! treasury as its own transaction.
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, ext_contract, near, require, AccountId, Gas, NearToken, PanicOnDefault, PromiseOrValue,
};

const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(10);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

#[ext_contract(ext_ft)]
pub trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct RitualGate {
    ft_contract: AccountId,
    treasury: AccountId,
    tax_bps: u32,
    target_count: u64,
    transfers_count: u64,
    pot_yocto: u128,
    releases_count: u64,
    release_pending: bool,
    window_start_minute_utc: u32,
    window_len_minutes: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub struct GateState {
    pub ft_contract: AccountId,
    pub treasury: AccountId,
    pub tax_bps: u32,
    pub target_count: u64,
    pub transfers_count: u64,
    pub pot_yocto: U128,
    pub releases_count: u64,
    pub release_pending: bool,
    pub window_start_minute_utc: u32,
    pub window_len_minutes: u32,
    pub ritual_active_now: bool,
    pub minutes_until_window_opens: u32,
}

#[near]
impl RitualGate {
    #[init]
    pub fn init(
        ft_contract: AccountId,
        treasury: AccountId,
        tax_bps: u32,
        target_count: u64,
        window_start_minute_utc: u32,
        window_len_minutes: u32,
    ) -> Self {
        require!(tax_bps <= 10_000, "tax_bps over 100%");
        require!(target_count > 0, "target_count must be positive");
        require!(window_len_minutes > 0 && window_len_minutes <= 1440, "bad window length");
        require!(window_start_minute_utc < 1440, "bad window start");
        Self {
            ft_contract,
            treasury,
            tax_bps,
            target_count,
            transfers_count: 0,
            pot_yocto: 0,
            releases_count: 0,
            release_pending: false,
            window_start_minute_utc,
            window_len_minutes,
        }
    }

    fn minute_of_day_utc() -> u32 {
        let secs = env::block_timestamp_ms() / 1000;
        ((secs / 60) % 1440) as u32
    }

    fn is_active_at(&self, minute: u32) -> bool {
        let rel = (minute + 1440 - self.window_start_minute_utc) % 1440;
        rel < self.window_len_minutes
    }

    /// Permissionless: pays the armed pot to the treasury. Callable by anyone
    /// once a completed ritual counter has armed the release.
    pub fn release_pot(&mut self) -> U128 {
        require!(self.release_pending, "no release is armed");
        require!(self.pot_yocto > 0, "pot is empty");
        let pot = self.pot_yocto;
        self.pot_yocto = 0;
        self.release_pending = false;
        self.releases_count += 1;
        env::log_str(&format!(
            "RITUAL_RELEASE pot={} to treasury={} release #{}",
            pot, self.treasury, self.releases_count
        ));
        ext_ft::ext(self.ft_contract.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(self.treasury.clone(), U128(pot), Some("ritual pot release".to_string()));
        U128(pot)
    }

    pub fn get_state(&self) -> GateState {
        let now = Self::minute_of_day_utc();
        let active = self.is_active_at(now);
        let until = if active {
            0
        } else {
            (self.window_start_minute_utc + 1440 - now) % 1440
        };
        GateState {
            ft_contract: self.ft_contract.clone(),
            treasury: self.treasury.clone(),
            tax_bps: self.tax_bps,
            target_count: self.target_count,
            transfers_count: self.transfers_count,
            pot_yocto: U128(self.pot_yocto),
            releases_count: self.releases_count,
            release_pending: self.release_pending,
            window_start_minute_utc: self.window_start_minute_utc,
            window_len_minutes: self.window_len_minutes,
            ritual_active_now: active,
            minutes_until_window_opens: until,
        }
    }
}

#[near]
impl FungibleTokenReceiver for RitualGate {
    /// Called by the RITUAL token during `ft_transfer_call`.
    /// `msg` is JSON: {"receiver": "<final recipient account>", "memo": "..."}.
    /// Returns the amount to refund to the sender (full amount outside the
    /// ritual window; zero when the ritual transfer is accepted).
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::predecessor_account_id() == self.ft_contract,
            "only the RITUAL token can call ft_on_transfer"
        );
        let amount = amount.0;
        if !self.is_active_at(Self::minute_of_day_utc()) {
            env::log_str(&format!(
                "RITUAL_INACTIVE sender={} amount={} refunded in full",
                sender_id, amount
            ));
            return PromiseOrValue::Value(U128(amount));
        }
        #[derive(Deserialize)]
        #[serde(crate = "near_sdk::serde")]
        struct GateMsg {
            receiver: AccountId,
            memo: Option<String>,
        }
        let parsed: GateMsg = near_sdk::serde_json::from_str(&msg)
            .unwrap_or_else(|_| env::panic_str("msg must be JSON {\"receiver\": \"...\", \"memo\": \"...\"}"));

        let tax = amount * self.tax_bps as u128 / 10_000;
        let net = amount - tax;
        self.pot_yocto += tax;
        self.transfers_count += 1;
        env::log_str(&format!(
            "RITUAL_TRANSFER sender={} receiver={} amount={} tax={} pot={} count={}/{}",
            sender_id, parsed.receiver, amount, tax, self.pot_yocto, self.transfers_count,
            self.target_count
        ));

        if net > 0 {
            ext_ft::ext(self.ft_contract.clone())
                .with_attached_deposit(ONE_YOCTO)
                .with_static_gas(GAS_FOR_FT_TRANSFER)
                .ft_transfer(parsed.receiver, U128(net), parsed.memo);
        }

        if self.transfers_count >= self.target_count && self.pot_yocto > 0 && !self.release_pending {
            // Arm the release only — see the note at the top of this file for
            // why the payout itself must not happen inside this callback.
            self.release_pending = true;
            self.transfers_count = 0;
            env::log_str(&format!(
                "RITUAL_RELEASE_ARMED pot={} — call release_pot() to pay the treasury",
                self.pot_yocto
            ));
        }

        PromiseOrValue::Value(U128(0))
    }
}
