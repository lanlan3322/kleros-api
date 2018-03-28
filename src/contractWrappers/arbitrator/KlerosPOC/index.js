import kleros from 'kleros/build/contracts/KlerosPOC'
import _ from 'lodash'

import * as ethConstants from '../../../constants/eth'
import * as errorConstants from '../../../constants/error'
import * as arbitratorConstants from '../../../constants/arbitrator'
import Arbitrator from '../Arbitrator'

/**
 * Kleros API
 */
class KlerosWrapper extends Arbitrator {
  /**
   * Constructor Kleros.
   * @param {object} web3Provider - web3 instance.
   * @param {string} address - Address of the KlerosPOC contract.
   */
  constructor(web3Provider, address) {
    super(web3Provider, address, kleros)
  }

  /**
   * Kleros deploy.
   * @param {string} rngAddress address of random number generator contract
   * @param {string} pnkAddress address of pinakion contract
   * @param {number[]} timesPerPeriod array of 5 ints indicating the time limit for each period of contract
   * @param {string} account address of user
   * @param {number} value (default: 10000)
   * @returns {object} truffle-contract Object | err The contract object or error deploy
   */
  deploy = async (
    rngAddress,
    pnkAddress,
    timesPerPeriod = [1, 1, 1, 1, 1],
    account = this._Web3Wrapper.getAccount(0),
    value = ethConstants.TRANSACTION.VALUE
  ) => {
    const contractDeployed = await this._deployAsync(
      account,
      value,
      kleros,
      pnkAddress,
      rngAddress,
      timesPerPeriod
    )
    // load arbitrator based on new contract
    await this.setArbitrator(contractDeployed.address)

    return contractDeployed
  }

  /**
   * Use Arbitrator.buyPNK
   * @param {string} amount - The number of pinakion to buy.
   * @param {string} account - The address of the user.
   * @returns {object} - The result transaction object.
   */
  buyPNK = async (amount, account = this._Web3Wrapper.getAccount(0)) => {
    await this._checkContractInstanceSet()

    try {
      return this.contractInstance.buyPinakion({
        from: account,
        gas: ethConstants.TRANSACTION.GAS,
        value: this._Web3Wrapper.toWei(amount, 'ether')
      })
    } catch (err) {
      console.error(err)
      throw new Error(errorConstants.UNABLE_TO_BUY_PNK)
    }
  }

  /**
   * Get PNK Balances.
   * @param {string} account - The address of the user.
   * @returns {object} - Balance information including total PNK balance and activated tokens.
   */
  getPNKBalance = async (account = this._Web3Wrapper.getAccount(0)) => {
    await this._checkContractInstanceSet()

    const juror = await this.contractInstance.jurors(account)
    if (!juror)
      throw new Error(
        errorConstants.ACCOUNT_NOT_A_JUROR_FOR_CONTRACT(
          account,
          this.contractAddress
        )
      )

    // Total tokens
    const totalTokens = this._Web3Wrapper.fromWei(juror[0], 'ether')

    // Activated Tokens
    const currentSession = await this.contractInstance.session()
    let activatedTokens = 0
    if (juror[2].toNumber() === currentSession.toNumber())
      activatedTokens = this._Web3Wrapper.fromWei(
        juror[4].toNumber() - juror[3].toNumber(),
        'ether'
      )

    // Locked Tokens
    const lockedTokens = this._Web3Wrapper.fromWei(juror[1], 'ether')

    return {
      tokenBalance: totalTokens,
      activatedTokens,
      lockedTokens
    }
  }

  /**
   * Activate Pinakion tokens to be eligible to be a juror.
   * FIXME use estimateGas
   * @param {string} amount - number of tokens to activate.
   * @param {string} account - address of user.
   * @returns {object} - PNK balance.
   */
  activatePNK = async (
    amount, // amount in ether
    account = this._Web3Wrapper.getAccount(0)
  ) => {
    await this._checkContractInstanceSet()

    try {
      await this.contractInstance.activateTokens(
        this._Web3Wrapper.toWei(amount, 'ether'),
        {
          from: account,
          gas: ethConstants.TRANSACTION.GAS
        }
      )
    } catch (err) {
      console.error(err)
      throw new Error(errorConstants.UNABLE_TO_ACTIVATE_PNK)
    }

    return this.getPNKBalance(account)
  }

  /**
   * Fetch the cost of arbitration
   * @param {bytes} contractExtraData - extra data from arbitrable contract.
   * @returns {number} - The cost of arbitration.
   */
  getArbitrationCost = async contractExtraData => {
    await this._checkContractInstanceSet()

    try {
      const arbitrationCost = await this.contractInstance.arbitrationCost(
        contractExtraData
      )

      return this._Web3Wrapper.fromWei(arbitrationCost, 'ether')
    } catch (err) {
      console.error(err)
      throw new Error(errorConstants.UNABLE_TO_FETCH_ARBITRATION_COST)
    }
  }

  /**
   * Call contract to move on to the next period.
   * @param {string} account - address of user.
   */
  passPeriod = async (account = this._Web3Wrapper.getAccount(0)) => {
    await this._checkContractInstanceSet()

    try {
      await this.contractInstance.passPeriod.original({
        from: account,
        gas: ethConstants.TRANSACTION.GAS
      })
    } catch (err) {
      console.error(err)
      throw new Error(errorConstants.UNABLE_TO_PASS_PERIOD)
    }
  }

  /**
   * Submit votes. Note can only be called during Voting period (Period 2).
   * @param {number} disputeId - index of the dispute.
   * @param {number} ruling - int representing the jurors decision.
   * @param {number[]} votes - int[] of drawn votes for dispute.
   * @param {string} account - address of user.
   * @returns {object} - The result transaction object.
   */
  submitVotes = async (
    disputeId,
    ruling,
    votes,
    account = this._Web3Wrapper.getAccount(0)
  ) => {
    await this._checkContractInstanceSet()

    try {
      return this.contractInstance.voteRuling(disputeId, ruling, votes, {
        from: account,
        gas: ethConstants.TRANSACTION.GAS
      })
    } catch (err) {
      console.error(err)
      throw new Error(errorConstants.UNABLE_TO_SUBMIT_VOTES)
    }
  }

  /**
   * Appeal ruling on dispute.
   * @param {number} disputeId - Index of the dispute.
   * @param {string} extraData - Extra data.
   * @param {string} account - Address of user.
   * @returns {object} - The result transaction object.
   */
  appealRuling = async (
    disputeId,
    extraData,
    account = this._Web3Wrapper.getAccount(0)
  ) => {
    await this._checkContractInstanceSet()

    try {
      return this.contractInstance.appeal(disputeId, extraData, {
        from: account,
        value: await this.contractInstance.appealCost(disputeId, extraData),
        gas: ethConstants.TRANSACTION.GAS
      })
    } catch (err) {
      console.error(err)
      throw new Error(errorConstants.UNABLE_TO_APPEAL)
    }
  }

  /**
   * Repartition juror tokens.
   * @param {number} disputeId - index of the dispute.
   * @param {string} account - address of user.
   * @returns {object} - The result transaction object.
   */
  repartitionJurorTokens = async (
    disputeId,
    account = this._Web3Wrapper.getAccount(0)
  ) => {
    await this._checkContractInstanceSet()

    try {
      return this.contractInstance.oneShotTokenRepartition(disputeId, {
        from: account,
        gas: ethConstants.TRANSACTION.GAS
      })
    } catch (err) {
      console.error(err)
      throw new Error(errorConstants.UNABLE_TO_REPARTITION_TOKENS)
    }
  }

  /**
   * Execute ruling on dispute
   * @param {number} disputeId - index of the dispute.
   * @param {string} account - address of user.
   * @returns {object} - The result transaction object.
   */
  executeRuling = async (
    disputeId,
    account = this._Web3Wrapper.getAccount(0)
  ) => {
    await this._checkContractInstanceSet()

    try {
      return this.contractInstance.executeRuling(disputeId, {
        from: account,
        gas: ethConstants.TRANSACTION.GAS
      })
    } catch (err) {
      console.error(err)
      throw new Error(errorConstants.UNABLE_TO_EXECUTE_RULING)
    }
  }

  /**
   * Get time for a period.
   * @param {number} periodNumber - int representing period.
   * @returns {number} - The seconds in the period.
   */
  getTimeForPeriod = async periodNumber => {
    await this._checkContractInstanceSet()

    let timePerPeriod

    try {
      timePerPeriod = await this.contractInstance.timePerPeriod(periodNumber)
    } catch (err) {
      console.error(err)
      throw new Error(errorConstants.UNABLE_TO_FETCH_TIME_PER_PERIOD)
    }

    if (timePerPeriod) return timePerPeriod.toNumber()

    throw new Error(errorConstants.PERIOD_OUT_OF_RANGE(periodNumber))
  }

  /**
   * Get dispute.
   * @param {number} disputeId - The index of the dispute.
   * @returns {object} - The dispute data from the contract.
   */
  getDispute = async disputeId => {
    await this._checkContractInstanceSet()

    try {
      const dispute = await this.contractInstance.disputes(disputeId)
      const numberOfAppeals = dispute[2].toNumber()
      const rulingChoices = dispute[3].toNumber()

      let voteCounters = []
      let status
      for (let appeal = 0; appeal <= numberOfAppeals; appeal++) {
        const voteCounts = []
        for (let choice = 0; choice <= rulingChoices; choice++)
          voteCounts.push(
            this.contractInstance
              .getVoteCount(disputeId, appeal, choice)
              .then(v => v.toNumber())
          )
        voteCounters.push(voteCounts)
      }

      ;[voteCounters, status] = await Promise.all([
        Promise.all(voteCounters.map(voteCounts => Promise.all(voteCounts))),
        this.contractInstance.disputeStatus(disputeId)
      ])

      return {
        arbitratorAddress: this.contractAddress,
        disputeId,
        arbitrableContractAddress: dispute[0],
        firstSession: dispute[1].toNumber(),
        numberOfAppeals,
        rulingChoices,
        initialNumberJurors: dispute[4].toNumber(),
        arbitrationFeePerJuror: this._Web3Wrapper.fromWei(dispute[5], 'ether'),
        state: dispute[6].toNumber(),
        voteCounters,
        status: status.toNumber()
      }
      // eslint-disable-next-line no-unused-vars
    } catch (err) {
      // console.error(err)
      throw new Error(errorConstants.UNABLE_TO_FETCH_DISPUTE)
    }
  }

  /**
   * Get number of jurors for a dispute.
   * @param {number} disputeId - Index of dispute.
   * @returns {number} - Number of jurors for a dispute.
   */
  getAmountOfJurorsForDispute = async disputeId => {
    await this._checkContractInstanceSet()

    let amountOfJurors

    try {
      amountOfJurors = await this.contractInstance.amountJurors(disputeId)
    } catch (err) {
      console.error(err)
      throw new Error(errorConstants.UNABLE_TO_FETCH_AMOUNT_OF_JURORS)
    }

    if (amountOfJurors) return amountOfJurors.toNumber()

    throw new Error(errorConstants.DISPUTE_DOES_NOT_EXIST)
  }

  /**
   * Get number of jurors for a dispute.
   * @param {number} disputeId - Index of dispute.
   * @param {number} draw - Int for draw.
   * @param {string} jurorAddress - Address of juror.
   * @returns {bool} - `true` indicates juror has a vote for draw, `false` indicates they do not.
   */
  isJurorDrawnForDispute = async (
    disputeId,
    draw,
    jurorAddress = this._Web3Wrapper.getAccount(0)
  ) => {
    await this._checkContractInstanceSet()

    const isDrawn = await this.contractInstance.isDrawn(
      disputeId,
      jurorAddress,
      draw
    )

    return isDrawn
  }

  /**
   * Can juror currently rule in dispute.
   * @param {number} disputeId - index of dispute.
   * @param {int[]} draws - voting positions for dispute.
   * @param {string} account - address of user.
   * @returns {bool} - Boolean indicating if juror can rule or not.
   */
  canRuleDispute = async (disputeId, draws, account) => {
    await this._checkContractInstanceSet()

    const validDraws = await this.contractInstance.validDraws(
      account,
      disputeId,
      draws
    )
    const lastRuling = (await this.contractInstance.getLastSessionVote(
      disputeId,
      account
    )).toNumber()
    const currentSession = await this.getSession(this.contractAddress)

    return validDraws && lastRuling !== currentSession
  }

  /**
   * Get number of jurors for a dispute.
   * @param {number} disputeId - Index of dispute.
   * @param {number} appeal - Index of appeal.
   * @returns {number} - Int indicating the ruling of the dispute.
   */
  currentRulingForDispute = async (disputeId, appeal) => {
    await this._checkContractInstanceSet()

    const ruling = await this.contractInstance.getWinningChoice(
      disputeId,
      appeal
    )

    return ruling.toNumber()
  }

  /**
   * Get current period of the contract
   * @returns {number} - Int indicating the period.
   */
  getPeriod = async () => {
    await this._checkContractInstanceSet()

    const currentPeriod = await this.contractInstance.period()

    return currentPeriod.toNumber()
  }

  /**
   * Get current session of the contract.
   * @returns {number} - Int indicating the session.
   */
  getSession = async () => {
    await this._checkContractInstanceSet()

    const currentSession = await this.contractInstance.session()

    return currentSession.toNumber()
  }

  /**
   * Get disputes from Kleros contract.
   * @param {string} account - Address of user.
   * @returns {object[]} - Array of disputes.
   */
  getDisputesForJuror = async account => {
    await this._checkContractInstanceSet()

    // contract data
    const openDisputes = await this.getOpenDisputesForSession()

    const disputes = await Promise.all(
      openDisputes.map(async disputeId => {
        const draws = await this.getDrawsForJuror(disputeId, account)

        const disputeData = await this.getDispute(disputeId)
        disputeData.appealDraws = []
        disputeData.appealDraws[disputeData.numberOfAppeals] = draws

        return disputeData
      })
    )

    return disputes
  }

  /**
   * Fetch the votes a juror has in a dispute.
   * @param {number} disputeId - ID of the dispute.
   * @param {string} account - Potential jurors address.
   * @returns {number[]} - Array of integers indicating the draw.
   */
  getDrawsForJuror = async (disputeId, account) => {
    await this._checkContractInstanceSet()

    const numberOfJurors = await this.getAmountOfJurorsForDispute(disputeId)
    const draws = []
    for (let draw = 1; draw <= numberOfJurors; draw++) {
      const isJuror = await this.isJurorDrawnForDispute(
        disputeId,
        draw,
        account
      )
      if (isJuror) {
        draws.push(draw)
      }
    }
    return draws
  }

  /** Get all disputes that are active this session.
   * @returns {int[]} - array of active disputeId
   */
  getOpenDisputesForSession = async () => {
    await this._checkContractInstanceSet()

    const currentSession = await this.getSession()
    const openDisputes = []

    let disputeId = 0
    let dispute
    while (1) {
      // Iterate over all the disputes
      // TODO: Implement a more performant solution
      try {
        dispute = await this.getDispute(disputeId)
      } catch (err) {
        // Dispute out of range, break
        if (err.message === errorConstants.UNABLE_TO_FETCH_DISPUTE) break
        console.error(err)
        throw err
      }

      // Dispute has no arbitrable contract, break
      if (dispute.arbitrableContractAddress === ethConstants.NULL_ADDRESS) break

      // If dispute is in the current session, add it to the result array
      if (dispute.firstSession + dispute.numberOfAppeals === currentSession)
        openDisputes.push(disputeId)

      // Advance to the next dispute
      disputeId++
    }

    return openDisputes
  }

  /**
   * Gets the deadline for an arbitrator's period, which is also the deadline for all its disputes.
   * @param {number} [period=PERIODS.VOTE] - The period to get the deadline for.
   * @returns {number} - epoch timestamp
   */
  getDeadlineForOpenDispute = async (
    period = arbitratorConstants.PERIOD.VOTE
  ) => {
    await this._checkContractInstanceSet()

    // Get arbitrator data
    const lastPeriodChange = (await this.contractInstance.lastPeriodChange()).toNumber()

    // Last period change + current period duration = deadline
    const result =
      1000 * (lastPeriodChange + (await this.getTimeForPeriod(period)))

    return result
  }

  /**
   * Get data from Kleros contract.
   * TODO split these into their own methods for more flexability and speed
   * @returns {object} - Data for kleros POC from contract.
   */
  getData = async () => {
    await this._checkContractInstanceSet()

    const [
      pinakionContractAddress,
      rngContractAddress,
      period,
      session,
      lastPeriodChange
    ] = await Promise.all([
      this.contractInstance.pinakion(),
      this.contractInstance.rng(),
      this.contractInstance.period(),
      this.contractInstance.session(),
      this.contractInstance.lastPeriodChange()
    ])

    return {
      pinakionContractAddress,
      rngContractAddress,
      period: period.toNumber(),
      session: session.toNumber(),
      lastPeriodChange: lastPeriodChange.toNumber()
    }
  }
}

export default KlerosWrapper