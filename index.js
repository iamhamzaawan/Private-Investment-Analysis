const http = require('http');
const querystring = require('querystring');
const url = require('url');
const util = require('util');
const crypto = require('crypto');
const fs = require('fs');
const readline = require('readline');
const axios = require('axios');

let tradecounter = 0;
let tradecounterWait = 0;
let control = false;

// Define your variables here (CumulativeInvestment, BTCMin, ETHMin, DiffMin, tradecounter, tradecounterWait, control, etc.)

function condition(value) {
    if (value > 1000) {
        return 0;
    }
    return value;
}

function sendEmail(Subject, Body) {
  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: 'your_email@gmail.com',
      pass: 'your_password',
    },
  });

  const mailOptions = {
    from: 'your_email@gmail.com',
    to: 'recipient_email@example.com',
    subject: Subject,
    text: Body,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
}

async function main() {
    while (true) {
        control = false;
        console.log("...");
        const incre = 0.15 / 100;
        const PriceAdj = 1 + incre;
        const PriceAdj2 = 1 - incre;
        await sleep(5000);
        if (tradecounter !== tradecounterWait) {
            await sleep(60 * 30);
            tradecounterWait = tradecounterWait + 1;
            // Implement TransferToTradingAccount('BTC') here
            break;
        }

        const Exchanges = ["Binance", "Bittrex", "Cryptopia", "HitBTC"];

        const BinancePriceList = await populateExchangePriceList(Exchanges[0]);
        const BittrexPriceList = await populateExchangePriceList(Exchanges[1]);
        const CryptopiaPriceList = await populateExchangePriceList(Exchanges[2]);
        const HitBTCPriceList = await populateExchangePriceList(Exchanges[3]);

        // Remove any ETH Pairs
        const Regex = /[a-zA-Z0-9]*ETH/;
        BinancePriceList.ETH = BinancePriceList.symbol.filter(symbol => !Regex.test(symbol));
        BittrexPriceList.ETH = BittrexPriceList.symbol.filter(symbol => !Regex.test(symbol));
        CryptopiaPriceList.ETH = CryptopiaPriceList.symbol.filter(symbol => !Regex.test(symbol));
        HitBTCPriceList.ETH = HitBTCPriceList.symbol.filter(symbol => !Regex.test(symbol));

        BinancePriceList = BinancePriceList.filter(entry => !entry.ETH);
        BittrexPriceList = BittrexPriceList.filter(entry => !entry.ETH);
        CryptopiaPriceList = CryptopiaPriceList.filter(entry => !entry.ETH);
        HitBTCPriceList = HitBTCPriceList.filter(entry => !entry.ETH);

        const Directions = [];
        const Exchange1 = [];
        const Exchange2 = [];
        const Differences = [];
        let Methods1 = [];
        let Methods2 = [];
        const Thresholds = [];

        const d = {};

        for (let i = 0; i < Exchanges.length; i++) {
            for (let b = 0; b < Exchanges.length - 1; b++) {
                const table = `${Exchanges[i]}&${Exchanges[b + 1]}`;
                if (!(table in d)) {
                    if (Exchanges[b + 1] !== Exchanges[i]) {
                        d[table] = mergePriceLists(
                            locals[`${Exchanges[i]}PriceList`],
                            locals[`${Exchanges[b + 1]}PriceList`]
                        );
                    }
                }
            }
        }

        let differences = [];

        for (const table in d) {
            const FirstExchange = table.split('&')[0];
            const SecondExchange = table.split('&')[1];

            Directions.push(`${FirstExchange}To${SecondExchange}`);
            Directions.push(`${SecondExchange}To${FirstExchange}`);

            if (FirstExchange.includes("HitBTC") || SecondExchange.includes("HitBTC")) {
                Thresholds.push(17.5);
                Thresholds.push(17.5);
            } else {
                Thresholds.push(7.5);
                Thresholds.push(7.5);
            }

            Exchange1.push(FirstExchange);
            Exchange2.push(SecondExchange);
            Exchange1.push(SecondExchange);
            Exchange2.push(FirstExchange);

            d[table][`${FirstExchange}To${SecondExchange}Difference`] =
                ((d[table][`${SecondExchange}BidPrice`] - d[table][`${FirstExchange}AskPrice`]) / d[table][`${FirstExchange}AskPrice`]) * 100;

            d[table][`${FirstExchange}To${SecondExchange}Difference`] = d[table][`${FirstExchange}To${SecondExchange}Difference`].map(condition);

            d[table][`${SecondExchange}To${FirstExchange}Difference`] =
                ((d[table][`${FirstExchange}BidPrice`] - d[table][`${SecondExchange}AskPrice`]) / d[table][`${SecondExchange}AskPrice`]) * 100;

            d[table][`${SecondExchange}To${FirstExchange}Difference`] = d[table][`${SecondExchange}To${FirstExchange}Difference`].map(condition);

            try {
                const max1 = Math.max(...d[table][`${FirstExchange}To${SecondExchange}Difference`]);
                const max2 = Math.max(...d[table][`${SecondExchange}To${FirstExchange}Difference`]);
            } catch (e) {
                console.log(`Error in Max Determination: ${e}`);
                continue;
            }

            const FirstRow1 = d[table].filter(row => row[`${FirstExchange}To${SecondExchange}Difference`] === max1);
            const FirstRow2 = d[table].filter(row => row[`${SecondExchange}To${FirstExchange}Difference`] === max2);

            differences = differences.concat(FirstRow1).concat(FirstRow2);
        }

        const NumberOfDirections = Exchanges.length * (Exchanges.length - 1);

        const Pairs = [];
        const PurchasePrices = [];
        const SellingPrices = [];

        try {
            for (let i = 0; i < Directions.length; i++) {
                Differences.push(differences[i][`${Directions[i]}Difference`]);
                Pairs.push(differences[i].symbol2);
                PurchasePrices.push(differences[i][`${Exchange1[i]}AskPrice`]);
                SellingPrices.push(differences[i][`${Exchange2[i]}BidPrice`]);
            }
        } catch (e) {
            console.log(`Error in Price population: ${e}`);
            continue;
        }

        Methods1 = Directions.map(direction => `InitiateOn${direction.split("To")[0]}`);
        Methods2 = Directions.map(direction => `CloseOn${direction.split("To")[1]}`);

        const PriceDifferencesTable = {
            Direction: Directions,
            Exchange1: Exchange1,
            Exchange2: Exchange2,
            Difference: Differences,
            Initiation: Methods1,
            Closing: Methods2,
            Pair: Pairs,
            PurchasePrice: PurchasePrices,
            SellingPrice: SellingPrices,
            Threshold: Thresholds,
            NetProfit: Differences.map((diff, i) => diff - Thresholds[i]),
        };

        // Turn off exchange where we don't have seed money yet
        PriceDifferencesTable = PriceDifferencesTable.filter(
            row => row.Exchange1 !== "Binance" && row.Exchange1 !== "Bittrex"
        );

        PriceDifferencesTable.sort((a, b) => b.NetProfit - a.NetProfit);

        console.log(PriceDifferencesTable[0].NetProfit);

        if (PriceDifferencesTable[0].NetProfit <= 0) {
            continue;
        }

        console.log(PriceDifferencesTable);

        // Parameters
        const Pair = PriceDifferencesTable[0].Pair;
        const Coin1 = Pair.split("-")[0];
        const Coin2 = Pair.split("-")[1];
        const PurchasePrice = PriceDifferencesTable[0].PurchasePrice;
        const SellingPrice = PriceDifferencesTable[0].SellingPrice;
        const SellingExchange = PriceDifferencesTable[0].Exchange2;
        const PurchasingExchange = PriceDifferencesTable[0].Exchange1;
        const address1 = getExchangeAddress(SellingExchange, Coin1);
        const address2 = getExchangeAddress(PurchasingExchange, Coin2);

        // Begin Trading
        InitiateOn(Pair, PurchasePrice, address1);
        if (control === true) {
            continue;
        }

        CloseOn(Pair, SellingPrice, address2);

        tradecounter = tradecounter + 1;
        sendEmail(
            `Bought ${Coin1} on ${PurchasingExchange} to sell on ${SellingExchange} for a price difference of ${PriceDifferencesTable[0].Difference}%`,
            PriceDifferencesTable
        );

        await sleep(60000);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main();