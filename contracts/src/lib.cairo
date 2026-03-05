// SPDX-License-Identifier: MIT
// Stark-Circle: SpendingVault - GPay-style delegation on Starknet
// Cairo 2.x

use starknet::ContractAddress;

/// Minimal ERC20 interface for transfer (vault is the token holder).
#[starknet::interface]
trait IERC20<TContractState> {
    fn transfer(ref self: TContractState, recipient: ContractAddress, amount: u256) -> bool;
}

/// Spending vault: owner adds members with daily limits; members call spend to pay merchants.
#[starknet::interface]
trait ISpendingVault<TContractState> {
    fn add_member(ref self: TContractState, member: ContractAddress, limit: u128);
    fn remove_member(ref self: TContractState, member: ContractAddress);
    fn spend(
        ref self: TContractState,
        token: ContractAddress,
        merchant: ContractAddress,
        amount: u128,
    );
    fn get_owner(self: @TContractState) -> ContractAddress;
    fn get_member_limit(self: @TContractState, member: ContractAddress) -> u128;
    fn get_member_spent(self: @TContractState, member: ContractAddress) -> u128;
}

const BLOCKS_PER_DAY: u64 = 43200_u64; // ~24h at ~2s/block

#[starknet::contract]
mod SpendingVault {
    use starknet::{ContractAddress, get_caller_address, get_block_number};
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use super::{IERC20Dispatcher, IERC20DispatcherTrait, ISpendingVault};

    #[storage]
    struct Storage {
        owner: ContractAddress,
        /// member -> daily limit (in token smallest units)
        members: Map<ContractAddress, u128>,
        /// member -> period index (block_number / BLOCKS_PER_DAY); new period resets spent
        member_period: Map<ContractAddress, u64>,
        /// member -> amount spent in current period
        member_spent: Map<ContractAddress, u128>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        MemberAdded: MemberAdded,
        MemberRemoved: MemberRemoved,
        Spent: Spent,
    }

    #[derive(Drop, starknet::Event)]
    struct MemberAdded {
        #[key]
        member: ContractAddress,
        daily_limit: u128,
    }

    #[derive(Drop, starknet::Event)]
    struct MemberRemoved {
        #[key]
        member: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct Spent {
        #[key]
        member: ContractAddress,
        token: ContractAddress,
        merchant: ContractAddress,
        amount: u128,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.owner.write(owner);
    }

    #[abi(embed_v0)]
    impl SpendingVaultImpl of ISpendingVault<ContractState> {
        fn add_member(ref self: ContractState, member: ContractAddress, limit: u128) {
            self.only_owner();
            self.members.entry(member).write(limit);
            self.emit(MemberAdded { member, daily_limit: limit });
        }

        fn remove_member(ref self: ContractState, member: ContractAddress) {
            self.only_owner();
            self.members.entry(member).write(0);
            self.emit(MemberRemoved { member });
        }

        fn spend(
            ref self: ContractState,
            token: ContractAddress,
            merchant: ContractAddress,
            amount: u128,
        ) {
            let caller = get_caller_address();
            let limit = self.members.entry(caller).read();
            assert(limit > 0, 'not a member');

            let block_num = get_block_number();
            let current_period = block_num / super::BLOCKS_PER_DAY;
            let stored_period = self.member_period.entry(caller).read();
            let mut spent = self.member_spent.entry(caller).read();
            if current_period != stored_period {
                spent = 0;
                self.member_period.entry(caller).write(current_period);
            }
            assert(spent + amount <= limit, 'daily limit exceeded');
            self.member_spent.entry(caller).write(spent + amount);

            let token_dispatcher = IERC20Dispatcher { contract_address: token };
            let amount_256: u256 = amount.into();
            token_dispatcher.transfer(merchant, amount_256);

            self.emit(Spent {
                member: caller,
                token,
                merchant,
                amount,
            });
        }

        fn get_owner(self: @ContractState) -> ContractAddress {
            self.owner.read()
        }

        fn get_member_limit(self: @ContractState, member: ContractAddress) -> u128 {
            self.members.entry(member).read()
        }

        fn get_member_spent(self: @ContractState, member: ContractAddress) -> u128 {
            let block_num = get_block_number();
            let current_period = block_num / super::BLOCKS_PER_DAY;
            let stored_period = self.member_period.entry(member).read();
            if current_period != stored_period {
                return 0;
            }
            self.member_spent.entry(member).read()
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn only_owner(self: @ContractState) {
            let caller = get_caller_address();
            assert(caller == self.owner.read(), 'not owner');
        }
    }
}

