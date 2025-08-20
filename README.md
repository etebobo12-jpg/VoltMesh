# VoltMesh

A blockchain-powered decentralized energy trading platform for microgrids, enabling prosumers (producers and consumers) to trade excess renewable energy peer-to-peer. This solves real-world issues like inefficient energy distribution, high utility costs, and underutilization of solar/wind resources in local grids — all on-chain for transparency and security.

---

## Overview

VoltMesh consists of four main smart contracts that together form a decentralized, efficient, and sustainable ecosystem for microgrid energy trading:

1. **Energy Token Contract** – Issues and manages tokens representing tradable energy units (e.g., kWh).
2. **Trading Marketplace Contract** – Facilitates peer-to-peer energy trades with automated matching.
3. **Settlement and Escrow Contract** – Handles secure fund settlements and energy delivery verification.
4. **Oracle Integration Contract** – Connects with off-chain data for real-time energy production, consumption, and pricing.

---

## Features

- **Tokenized energy units** for easy trading and ownership tracking  
- **P2P marketplace** with automated bids, offers, and matching  
- **Secure escrow** for trustless settlements based on verified delivery  
- **Real-time data integration** via oracles for production and grid status  
- **Transparent transactions** reducing intermediary fees and fraud  
- **Sustainability incentives** rewarding renewable energy contributions  
- **Scalable for microgrids** in rural, urban, or community settings  

---

## Smart Contracts

### Energy Token Contract
- Mint and burn tokens based on verified energy production
- Transfer tokens between users for trades
- Balance tracking and supply management mechanisms

### Trading Marketplace Contract
- Create buy/sell orders for energy tokens
- Automated order matching with price discovery
- Integration with user wallets for seamless participation

### Settlement and Escrow Contract
- Hold funds in escrow during trades
- Release payments upon oracle-verified energy delivery
- Dispute resolution with timeout mechanisms

### Oracle Integration Contract
- Secure fetching of off-chain data (e.g., smart meter readings, weather for renewables)
- Update contract states with production/consumption metrics
- Verification hooks for authenticity and tamper-proofing

---

## Installation

1. Install [Clarinet CLI](https://docs.hiro.so/clarinet/getting-started)
2. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/voltmesh.git
   ```
3. Run tests:
    ```bash
    npm test
    ```
4. Deploy contracts:
    ```bash
    clarinet deploy
    ```

## Usage

Each smart contract operates independently but integrates with others for a complete energy trading experience.
Refer to individual contract documentation for function calls, parameters, and usage examples.

## License

MIT License

