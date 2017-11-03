import Kleros from '../src/Kleros'
import Web3 from 'web3'
import contract from 'truffle-contract'
import {LOCALHOST_ETH_PROVIDER, LOCALHOST_STORE_PROVIDER} from '../constants'
import config from '../config'

let passPeriod = async (courtAddress) => {
  // use testRPC
  const provider = await new Web3.providers.HttpProvider(LOCALHOST_ETH_PROVIDER)
  const storeProvider = LOCALHOST_STORE_PROVIDER

  let KlerosInstance = await new Kleros(provider, storeProvider)

  const court = await KlerosInstance.court
  // deploy contract with defaults (testRPC + localhost addresses)
  const result = await court.passPeriod(courtAddress)
}

if (process.argv.length <= 2) {
    console.log('Usage: ' + __filename + ' COURT_ADDRESS');
    process.exit(-1);
}

const courtAddress = process.argv[2];

passPeriod(courtAddress)
