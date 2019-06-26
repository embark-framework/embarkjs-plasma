import {
  confirmTransaction,
  normalizeUrl,
  selectUtxos,
  signTypedData
} from "./utils";
import BigNumber from "bn.js";
import ChildChain from "@omisego/omg-js-childchain";
import RootChain from "@omisego/omg-js-rootchain";
import Web3 from "web3";
import {transaction} from "@omisego/omg-js-util";
const ERC20_ABI = require("human-standard-token-abi");

const web3Options = {transactionConfirmationBlocks: 1};

export default class EmbarkJSPlasma {
  constructor({pluginConfig, logger, accounts}) {
    this.logger = logger;
    this.initing = false;
    this.inited = false;
    this.currentAddress = "";
    // TODO: Remove PK support in favour of signing in Embark proxy
    this.currentPrivateKey = "";
    this.configAccounts = accounts || [];
    this.state = {
      account: {
        address: "",
        rootBalance: 0,
        childBalances: []
      },
      transactions: [],
      utxos: []
    };
    this.rootChain = null;
    this.childChain = null;

    // plugin opts
    this.config = {
      plasmaContractAddress: pluginConfig.PLASMA_CONTRACT_ADDRESS || "0x740ecec4c0ee99c285945de8b44e9f5bfb71eea7",
      watcherUrl: normalizeUrl(pluginConfig.WATCHER_URL || "https://watcher.samrong.omg.network/"),
      childChainUrl: normalizeUrl(pluginConfig.CHILDCHAIN_URL || "https://samrong.omg.network/"),
      childChainExplorerUrl: normalizeUrl(pluginConfig.CHILDCHAIN_EXPLORER_URL || "https://quest.samrong.omg.network")
    };
  }

  async init(embarkWeb3, useEmbarkWeb3 = false) {
    try {
      if (this.initing) {
        const message = "Already intializing the Plasma chain, please wait...";
        throw new Error(message);
      }
      this.initing = true;

      if (useEmbarkWeb3) { // web3 is being passed in and we should use that
        this.web3 = new Web3(embarkWeb3.currentProvider || embarkWeb3.givenProvider, null, web3Options); // embark main process
      }
      else {
        // web3 being passed in could be metamask or could be coming from Embark
        const embarkJsWeb3Provider = EmbarkJS.Blockchain.Providers["web3"];
        if (!embarkJsWeb3Provider) {throw new Error("web3 cannot be found. Please ensure you have the 'embarkjs-connector-web3' plugin installed in your DApp.");}
        const {web3} = embarkJsWeb3Provider;

        this.web3 = new Web3(web3.currentProvider || web3.givenProvider, null, web3Options); // running in the browser
      }

      // set up the Plasma chain
      this.rootChain = new RootChain(this.web3, this.config.plasmaContractAddress);
      this.childChain = new ChildChain(this.config.watcherUrl); //, this.config.childChainUrl);

      let accounts = [];
      if (!this.isMetaMask && this.configAccounts.length) {
        const account = this.configAccounts.length > 1 ? this.configAccounts[1] : this.configAccounts[0];
        this.currentAddress = account.address;
        this.currentPrivateKey = account.privateKey; // TODO: remove PK in favour of signing in Embark
        this.web3.eth.accounts.wallet.add(account.privateKey);
      }
      else {
        const accounts = await this.web3.eth.getAccounts();
        const address = accounts.length > 1 ? accounts[1] : accounts[0]; // ignore the first account because it is our deployer account, we want the manually added account
        this.currentAddress = address;
      }

      // set lifecycle state vars
      this.initing = false;
      this.inited = true;

      await this.updateState();
    } catch (e) {
      const message = `Error initializing Plasma chain: ${e}`;
      throw new Error(message);
    }
  }

  async deposit(amount, currency = transaction.ETH_CURRENCY, approveDeposit = false) {

    if (!this.inited) {
      const message = "Please wait for the Plasma chain to initialize...";
      throw new Error(message);
    }
    amount = new BigNumber(amount);
    if (!amount || amount.lte(0)) {
      const message = "You must deposit more than 0 wei.";
      throw new Error(message);
    }
    // Create the deposit transaction
    const depositTx = transaction.encodeDeposit(this.currentAddress, amount, currency);

    if (currency === transaction.ETH_CURRENCY) {
      this.logger.info(`Depositing ${amount} wei...`);
      // ETH deposit
      try {
        const receipt = await this.rootChain.depositEth(depositTx, amount, {from: this.currentAddress});
        this.logger.info(receipt);
        const message = `Successfully deposited ${amount} ${currency === transaction.ETH_CURRENCY ? "wei" : currency} in to the Plasma chain.\nView the transaction: https://rinkeby.etherscan.io/tx/${receipt.transactionHash}`;
        return message;
      } catch (e) {
        const message = `Error depositing ${amount} wei: ${e}`;
        throw new Error(message);
      }
    }

    // ERC20 token deposit
    if (approveDeposit) {
      // First approve the plasma contract on the erc20 contract
      const erc20 = new this.web3.eth.Contract(ERC20_ABI, currency);
      // const approvePromise = Promise.promisify(erc20.approve.sendTransaction)

      // TODO
      const gasPrice = 1000000;
      const receipt = await erc20.methods
        .approve(this.rootChain.plasmaContractAddress, amount)
        .send({from: this.currentAddress, gasPrice, gas: 2000000});
      // Wait for the approve tx to be mined
      this.logger.info(`${amount} erc20 approved: ${receipt.transactionHash}. Waiting for confirmation...`);
      await confirmTransaction(this.web3, receipt.transactionHash);
      this.logger.info(`... ${receipt.transactionHash} confirmed.`);
    }

    return this.rootChain.depositToken(depositTx, {from: this.currentAddress});
  }

  async transfer(toAddress, amount, currency = transaction.ETH_CURRENCY) {
    if (!this.inited) {
      const message = "Please wait for the Plasma chain to initialize...";
      throw new Error(message);
    }
    const verifyingContract = this.config.plasmaContractAddress;

    const utxosToSpend = await this.selectUtxos(amount, currency);
    if (!utxosToSpend) {
      throw new Error(`No utxo big enough to cover the amount ${amount}`);
    }

    const txBody = transaction.createTransactionBody(this.currentAddress, utxosToSpend, toAddress, amount, currency);

    // Get the transaction data
    const typedData = transaction.getTypedData(txBody, verifyingContract);

    let signature = await signTypedData(
      this.web3,
      this.web3.utils.toChecksumAddress(this.currentAddress),
      typedData,
      this.childChain,
      this.currentPrivateKey
    );

    // ensure we have an array
    signature = signature instanceof Array ? signature : [signature];

    // Build the signed transaction
    const signedTx = this.childChain.buildSignedTransaction(typedData, signature);

    // Submit the signed transaction to the childchain
    const result = await this.childChain.submitTransaction(signedTx);

    const message = `Successfully submitted tx on the child chain: ${JSON.stringify(
      result
    )}\nView the transaction: ${this.config.childChainExplorerUrl}transaction/${
      result.txhash
      }`;

    return message;
  }

  get isMetaMask() {
    return this.web3 &&
      ((this.web3.currentProvider &&
        this.web3.currentProvider.isMetaMask) ||
        (this.web3.givenProvider &&
          this.web3.givenProvider.isMetaMask));
  }

  async exitAllUtxos(fromAddress) {
    if (!this.inited) {
      const message = "Please wait for the Plasma chain to initialize...";
      throw new Error(message);
    }

    const utxos = await this.childChain.getUtxos(fromAddress);
    if (utxos.length <= 0) {
      const message = `No UTXOs found on the Plasma chain for ${fromAddress}.`;
      throw new Error(message);
    }
    const errors = [];
    const messages = [];
    utxos.forEach(async utxo => {
      const exitData = await this.childChain.getExitData(utxo);

      try {
        let receipt = await this.rootChain.startStandardExit(
          Number(exitData.utxo_pos.toString()),
          exitData.txbytes,
          exitData.proof,
          {
            from: fromAddress,
            privateKey: this.addressPrivateKey

          }
        );
        messages.push(`Exited UTXO from address ${fromAddress} with value ${
          utxo.amount
          }. View the transaction: https://rinkeby.etherscan.io/tx/${
          receipt.transactionHash
          }`);
      } catch (e) {
        const message = `Error exiting the Plasma chain for UTXO ${JSON.stringify(
          utxo
        )}: ${e}`;
        errors.push(message);
      }
    });
    if (errors.length) {
      throw new Error(errors.join("\n\n"));
    }
    return messages.join("\n");
  }

  async exitUtxo(from, utxoToExit) {
    if (!this.inited) {
      const message = "Please wait for the Plasma chain to initialize...";
      throw new Error(message);
    }

    const exitData = await this.childChain.getExitData(utxoToExit);

    return this.rootChain.startStandardExit(
      Number(exitData.utxo_pos.toString()),
      exitData.txbytes,
      exitData.proof,
      {from}
    );
  }

  async selectUtxos(amount, currency) {
    const transferZeroFee = currency !== transaction.ETH_CURRENCY;
    const utxos = await this.childChain.getUtxos(this.currentAddress);
    return selectUtxos(utxos, amount, currency, transferZeroFee);
  }

  async balances() {
    if (!this.inited) {
      const message = "Please wait for the Plasma chain to initialize...";
      throw new Error(message);
    }

    const rootBalance = await this.web3.eth.getBalance(this.currentAddress);

    const childchainBalances = await this.childChain.getBalance(this.currentAddress);
    const childBalances = await Promise.all(childchainBalances.map(
      async (balance) => {
        if (balance.currency === transaction.ETH_CURRENCY) {
          balance.symbol = 'wei';
        } else {
          const tokenContract = new this.web3.eth.Contract(ERC20_ABI, balance.currency);
          try {
            balance.symbol = await tokenContract.methods.symbol().call();
          } catch (err) {
            balance.symbol = 'Unknown ERC20';
          }
        }
        return balance;
      }
    ));
    return {
      rootBalance,
      childBalances
    };
  }

  async updateState() {
    if (!this.inited) {
      const message = "Please wait for the Plasma chain to initialize...";
      throw new Error(message);
    }

    const {rootBalance, childBalances} = await this.balances();
    this.state.account.address = this.currentAddress;
    this.state.account.rootBalance = rootBalance;
    this.state.account.childBalances = childBalances;

    this.state.transactions = await this.childChain.getTransactions({address: this.currentAddress});

    this.state.utxos = await this.childChain.getUtxos(this.currentAddress);
  }
}
