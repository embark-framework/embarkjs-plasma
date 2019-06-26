# EmbarkJS-Plasma
EmbarkJS-Plasma is a convenience library for adding Plasma chain support to your DApp. It's meant to be used as an extension for [EmbarkJS](https://github.com/embark-framework/embark/packages/embarkjs), by being added as a property of EmbarkJS, ie `EmbarkJS.Plasma`.

> **PLEASE NOTE**
> This is completely alpha software and should not be used in a production environment.

> NOTE: This library is meant to be used as a dependency of [`embark-plasma`](https://github.com/embark-framework/embark-plasma), however it can be used as a standalone library if so desired.

The `embarkjs-plasma` plugin will:
1. Load the contents of `embarkjs-plasma` in to the `Plasma` property of `EmbarkJS`, so it will available using `EmbarkJS.Plasma` in your DApp.
2. Instantiate `EmbarkJS.Plasma`.

This will expose convenience methods to be used by your DApp to interact with Plasma networks.

## Requirements
1. Embark `^4.1.0-beta.2`

## Plugin config
Please see [`embark-plasma`](https://github.com/embark-framework/embark-plasma) for information on how to set up the `embarkjs-plasma` plugin to be used in your DApp. 

## Current limitations and known issues
1. The plugin currently only supports OMG's Samrong network and `v0.2` of the OMG SDK. The root chain is a contract on Rinkeby and the Plasma chain runs on Samrong. Chain creation for development purposes will be added in future versions.
2. The DApp can use Metamask OR accounts configured in the contracts config of Embark. Due to this support, the private keys of the accounts configured in Embark will be passed to `EmbarkJS.Plasma` and will be visible in the code generated `embarkjs.js` file. We are hoping to remove the need to pass PK's around soon.

## Available properties/functions
`embarkjs-plasma` exposes functions that are meant to make DApp interaction with Plasma chains easier. The following functions and proeprties are available.

### Properties
`EmbarkJS.Plasma.currentAddress`: the active account exposed by Metamask.

`EmbarkJS.Plasma.initing`: `true` when the initialisation routine is in progress (ie run via `EmbarkJS.Plasma.init()`).

`EmbarkJS.Plasma.inited`: `true` when the initialisation routine has finished (ie when `EmbarkJS.Plasma.init()` has completed).

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

## Example DApp
The [`embark-plasma-demo`](https://github.com/embark-framework/embark-plasma-demo) is an example DApp using this plugin. It is based on the OMG [`js-starter-kit`](https://github.com/omisego/js-starter-kit), but instead uses `EmbarkJS.Plasma` for all its functionality.

#### Please report any other issues you find, thank you!
