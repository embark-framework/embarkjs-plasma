import {
  confirmTransaction,
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
  constructor({pluginConfig, logger}) {
    this.logger = logger || {
      info: console.log,
      warn: console.warn,
      error: console.error,
      trace: console.trace
    };
    this.web3 = null;
    this.initing = false;
    this.inited = false;
    this.currentAddress = "";
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
    this.config = pluginConfig;
  }

  async init(web3) {
    try {
      if (this.initing) {
        const message = "Already intializing the Plasma chain, please wait...";
        throw new Error(message);
      }
      this.initing = true;

      if (web3) { // web3 is being passed in and we should use that
        this.web3 = new Web3(web3.currentProvider || web3.givenProvider, null, web3Options); // embark main process
      }
      else {
        const isConnected = await this.doConnect(this.config.dappConnection);
        if (!isConnected) {
          this.logger.error(`Could not connect web3 to any of the following connections: ${this.config.dappConnection.join(", ")}`);
        } else {
          this.logger.info("Successfully connected to an Ethereum node");
        }
      }

      // set up the Plasma chain
      this.rootChain = new RootChain(this.web3, this.config.plasmaContractAddress);
      this.childChain = new ChildChain(this.config.watcherUrl, this.config.childChainUrl);

      const accounts = await this.web3.eth.getAccounts();
      // use configured root chain account (in plugin config) or determine account to use with:
      // 1. If metamask is enabled, use the first account
      // 2. Otherwise, use the last ccount returned with web3.eth.getAccounts()
      this.currentAddress = this.config.rootChainAccount || (this.isMetaMask ? accounts[0] : accounts[accounts.length - 1]);

      // set lifecycle state vars
      this.initing = false;
      this.inited = true;

      await this.updateState();
    } catch (e) {
      const message = `Error initializing Plasma chain: ${e}`;
      throw new Error(message);
    }
  }

  async getBrowserWeb3() {
    if (window.ethereum) {
      this.web3 = new Web3(window.ethereum, null, web3Options);
      const accounts = await window.ethereum.enable();
      this.web3.eth.defaultAccount = accounts[0];
    } else if (window.web3) {
      this.web3 = new Web3(window.web3.currentProvider, null, web3Options);
    } else {
      throw new Error('Non-Ethereum browser detected. You should use MetaMask!');
    }
  }

  async doConnect(connectionList) {

    const checkConnect = async () => {
      try {
        const accounts = await this.web3.eth.getAccounts();
        this.web3.eth.defaultAccount = accounts[0];
        return true;
      } catch (err) {
        console.error("ERROR CHECKING CONNECTION: " + err.message || err);
        this.web3.setProvider(null);
        return false;
      }
    };

    const connectWeb3 = async () => {
      if (window && window.ethereum) {
        this.web3 = new Web3(window.ethereum, null, web3Options);
        await window.ethereum.enable();
      } else if (window && window.web3) { // legacy
        this.web3 = new Web3(window.web3.currentProvider, null, web3Options);
      } else {
        return false;
      }
      return checkConnect();
    };

    const connectWebsocket = async (url) => {
      this.web3 = new Web3(new Web3.providers.WebsocketProvider(url));
      return checkConnect();
    };

    const connectHttp = async (url) => {
      this.web3 = new Web3(new Web3.providers.HttpProvider(url));
      return checkConnect();
    };

    for (let connectionString of connectionList) {
      try {
        if (connectionString === '$WEB3' && await connectWeb3(connectionString)) {
          return true;
        } else if ((/^wss?:\/\//).test(connectionString) && await connectWebsocket(connectionString)) {
          return true;
        } else if (await connectHttp(connectionString)) {
          return true;
        }
      } catch (_err) {
        continue;
      }
    }
    return false;
  };

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
    try {
      let signature = await signTypedData(
        this.web3,
        this.web3.utils.toChecksumAddress(this.currentAddress),
        typedData
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
    } catch (err) {
      return err;
    }
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
