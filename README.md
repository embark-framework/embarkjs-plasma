# EmbarkJS-Plasma
EmbarkJS-Plasma is a convenience library for adding Plasma chain support to your DApp. It's meant to be used as an extension for [EmbarkJS](https://github.com/embark-framework/embark/packages/embarkjs), by being added as a property of EmbarkJS, ie `EmbarkJS.Plasma`.

> NOTE: This library is meant to be used as a dependency of [`embark-plasma`](https://github.com/embark-framework/embark-plasma), however it can be used as a standalone library is so desired.

The `embark-plasma` plugin will:
1. Load the contents of `embarkjs-plasma` in to the `Plasma` property of `EmbarkJS`, so it will available using `EmbarkJS.Plasma` in your DApp.
2. Instantiate `EmbarkJS.Plasma`.

This will expose convenience methods to be used by your DApp to interact with Plasma networks.

## Requirements
1. Embark `^4.1.0-beta.2`

## Plugin config
Please see [`embark-plasma`](https://github.com/embark-framework/embark-plasma) for information on how to set up the `embark-plasma` plugin to be used in your DApp. 

## Current limitations and known issues
1. The plugin currently only supports OMG's Samrong network and (v0.2) of the OMG SDK. The root chain is a contract on Rinkeby and the Plasma chain runs on Samrong. Chains creation for development purposes will be added in future versions.
2. The DApp must use Metamask. The accounts configured in the blockchain config cannot be used in the DApp. This is a limitation of Embark itself, and will hopefully be updated soon.

## Available properties/functions
`embarkjs-plasma` exposes functions that are meant to make DApp interaction with Plasma chains easier. The following functions and proeprties are available.

### Properties
`EmbarkJS.Plasma.currentAddress`: the active account exposed by Metamask.

`EmbarkJS.Plasma.initing`: true when the initialisation routine is in progress (ie run via `EmbarkJS.Plasma.init()`).

`EmbarkJS.Plasma.inited`: true when the initialisation routine has finished (ie when `EmbarkJS.Plasma.init()` has completed).

`EmbarkJS.Plasma.config`: Object representing the plugin config specified in the DApp's `embark.json`. See [`embark-plasma`](https://github.com/embark-framework/embark-plasma) for more config details.

`EmbarkJS.Plasma.state`: Object that is populated with the current Plasma network information. Could be used for reactive binding on the frontend, however it must be refreshed using `EmbarkJS.Plasma.updateState()`. Exposes the following:
  1. `account.address`: String containing current address from Metamask (if used in the DApp).
  2. `account.childBalances`: Array containing the balances (ETH + ERC20s) of the child account on the child chain
  3. `account.rootBalance`: Balance of the address on the main chain
  4. `transactions`: Array of transactions that occurred on the child chain for the `account.address`.
  5. `utxos`: UTXOs that exist on the child chain for the `account.address`. 

`EmbarkJS.Plasma.rootChain`: the [`omg.js` root chain object](https://github.com/omisego/omg-js/tree/master/packages/omg-js-rootchain) intialised in `EmbarkJS.Plasma.init()` using the plugin config.

`EmbarkJS.Plasma.childChain`: the [`omg.js` child chain object](https://github.com/omisego/omg-js/tree/master/packages/omg-js-childchain) intialised in `EmbarkJS.Plasma.init()` using the plugin config.

### Functions
`EmbarkJS.Plasma.balances()`: Returns an object containing the balance of the address on the main chain and an array containing the balances (ETH + ERC20s) of the child account on the child chain.

`EmbarkJS.Plasma.init()`: initialises the root chain and child chain using the plugin configuration. Sets up web3 and gets available accounts (from Metamask if used in the DApp). Refreshes the child chain state.

`EmbarkJS.Plasma.deposit(amount, currency = transaction.ETH_CURRENCY, approveDeposit = false)`: Deposits currency from the main chain in to the Plasma contract and makes the deposit available in a UTXO on the child chain. If using ETH, only the first parameter (amount) is required. `approveDeposit` should be true when depositing an ERC20. This instructs the the root chain contract to transfer the amount of tokens that you wish to deposit to the contract before depositing them. [More information on depositing](https://github.com/omisego/dev-portal/blob/master/guides/morevp_eli5.md#deposits).

`EmbarkJS.Plasma.transfer(toAddress, amount, currency = transaction.ETH_CURRENCY)`: Transfers currency (ETH or any ERC20) from the main account (active in Metamask if used in DApp context) to any other account on the network. If transferring ETH, the `currency` parameter can be omitted.

`EmbarkJS.Plasma.exitAllUtxos(fromAddress)`: Exits all UTXO's for the provided address from the child chain to the main chain. Note that exits are subject to the minimum finalisation period (current 7 days). Please see the [`elixir-omg` documentation for more information](https://github.com/omisego/elixir-omg/blob/master/docs/morevp.md#morevp-exit-protocol-specification).

`EmbarkJS.Plasma.exitUtxo(from, utxoToExit)`: Exits the given UTXO for the provided address from the child chain to the main chain. Note that exits are subject to the minimum finalisation period (current 7 days). Please see the [`elixir-omg` documentation for more information](https://github.com/omisego/elixir-omg/blob/master/docs/morevp.md#morevp-exit-protocol-specification).

`EmbarkJS.Plasma.selectUtxos(amount, currency)`: Gets UTXOs for the main account (active in Metamask if in a DApp context) given the provided currency.

`EmbarkJS.Plasma.updateState()`: Refreshes the state of the Plasma network for the current address (active address if Metamask used), which is available via `EmbarkJS.Plasma.state`. The following are updated (and available via `EmbarkJS.Plasma.state`):
  1. `account.address`: String containing current address from Metamask (if used in the DApp).
  2. `account.childBalances`: Array containing the balances (ETH + ERC20s) of the child account on the child chain
  3. `account.rootBalance`: Balance of the address on the main chain
  4. `transactions`: Array of transactions that occurred on the child chain for the `account.address`.
  5. `utxos`: UTXOs that exist on the child chain for the `account.address`. 

An example configuration in `config/blockchain.js` would look like:
```
module.exports = {
  //...
  rinkeby: {
    networkType: "rinkeby",
    syncMode: "light",
    networkId: 4,
    accounts: [
      {
        nodeAccounts: true,
        password: "config/testnet/password"
      },
      {
        mnemonic: "MNEMONIC GOES HERE",
        addressIndex: "0", // Optional. The index to start getting the address
        numAddresses: "1", // Optional. The number of addresses to get
        hdpath: "m/44'/60'/0'/0/", // Optional. HD derivation path
      }
    ]
  }
  //...
}
```

### Init
Initialises the root and child chains and sets up web3. This is already done for us in the context of Embark, however we can re-initialise the plugin using the `--force` param if needed.
```
# plasma init [--force]
plasma init
```

### Status
Gets the status of the child chain.
```
# plasma status
plasma status

Example output:
{ byzantine_events:
  [ 
    { details: [Object], event: 'unchallenged_exit' },
    { details: [Object], event: 'unchallenged_exit' },
    { details: [Object], event: 'invalid_exit' },
    { details: [Object], event: 'invalid_exit' } 
  ],
  contract_addr: '0x740ecec4c0ee99c285945de8b44e9f5bfb71eea7',
  eth_syncing: false,
  in_flight_exits: [],
  last_mined_child_block_number: 247000,
  last_mined_child_block_timestamp: 1560740479,
  last_seen_eth_block_number: 4574127,
  last_seen_eth_block_timestamp: 1560741679,
  last_validated_child_block_number: 239000,
  last_validated_child_block_timestamp: 1560431021,
  services_synced_heights:
  [ 
    { height: 4553417, service: 'block_getter' },
    { height: 4574114, service: 'challenges_responds_processor' },
    { height: 4574114, service: 'competitor_processor' },
    { height: 4574116, service: 'convenience_deposit_processor' },
    { height: 4553417, service: 'convenience_exit_processor' },
    { height: 4574116, service: 'depositor' },
    { height: 4574114, service: 'exit_challenger' },
    { height: 4553417, service: 'exit_finalizer' },
    { height: 4574114, service: 'exit_processor' },
    { height: 4553417, service: 'ife_exit_finalizer' },
    { height: 4574114, service: 'in_flight_exit_processor' },
    { height: 4574114, service: 'piggyback_challenges_processor' },
    { height: 4574114, service: 'piggyback_processor' },
    { height: 4574126, service: 'root_chain_height' } 
  ] 
}
```

### Deposit
Deposits wei from the root chain (Rinkeby) to the child chain by sending funds to the Plasma contract on Rinkeby
```
# plasma deposit [amount]
plasma deposit 10000
```

### Transfer
Transfers wei from the main child chain account to any other account on Rinkeby.
```
# plasma transfer [to_address] [amount]
plasma transfer 0xcc9581513771666c47b5f664024B2f47d5C08bD3 100
```

### Exit
Exits all UTXO's from the child chain to the root chain for a particular address. Note that exits are subject to the minimum finalisation period (current 7 days). Please see the [`elixir-omg` documentation for more information](https://github.com/omisego/elixir-omg/blob/master/docs/morevp.md#morevp-exit-protocol-specification).
```
# plasma exit [child_chain_address]
plasma exit 0xcc9581513771666c47b5f664024B2f47d5C08bD3
```

## EmbarkJS-Plasma
This project depends on [`embarkjs-plasma`]() which extends EmbarkJS and makes convenience commands available to the DApp in the browser.

## Example DApp
The [`embark-plasma-demo`](https://github.com/embark-framework/embark-plasma-demo) is an example DApp using this plugin. It is based on the OMG [`js-starter-kit`](https://github.com/omisego/js-starter-kit), but instead uses `EmbarkJS.Plasma` for all its functionality.

#### Please report any other issues you find, thank you!
