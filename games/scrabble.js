const fs = require('fs');
const util = require('util');

const textConverterHelper = require('../helpers/text-converter');

const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);
const fileExistsAsync = util.promisify(fs.exists);

class ScrabbleGame {
    constructor(logger, slackService, channel) {
        this.logger = logger;
        this.slackService = slackService;
        this.channel = channel;
    }

    async loadGame() {
        const fileName = `./data/scrabble-${this.channel}.json`;

        if (await fileExistsAsync(fileName)) {
            return JSON.parse(await readFileAsync(fileName));
        }

        return null;
    }

    async saveGame(gameState) {
        try {
            const fileName = `./data/scrabble-${this.channel}.json`;
            await writeFileAsync(fileName, JSON.stringify(gameState));
        } catch (err) {
            this.logger.error('Failed to save game state');
            this.logger.error(err);
            this.logger.error(gameState);
        }
    }

    async startGame(user, players) {
        // check for existing game
        if (await this.loadGame() != null) {
            this.logger.warn('Existing game in channel');
            await this.slackService.postEphemeral({
                text: 'A game is already in progress in this channel',
                channel: this.channel,
                user: user
            });
            return;
        }
        
        // validate player count
        if (players.length < 2 || players.length > 4) {
            this.logger.warn(`Invalid number of players for scrabble: ${players.length}`);
            await this.slackService.postEphemeral({
                text: 'Invalid number of players\nMust @ 2 - 4 users',
                channel: this.channel,
                user: user
            });
            return;
        }

        this.logger.info(`Creating new scrabble game in channel: ${this.channel}`);
        
        // load initial game state
        this.logger.debug('loading initial game state');
        const initialState = JSON.parse(await readFileAsync('./data/scrabble.json'));
        this.logger.debug('done');

        // set the channel for the game
        this.logger.debug('setting channel');
        initialState.channel = this.channel;
        this.logger.debug('done');

        // randomize player order
        this.logger.debug('randomizing player order');
        initialState.players = players.map((a) => ({sort: Math.random(), value: a}))
            .sort((a, b) => a.sort - b.sort)
            .map((a) => {
                return {
                    ...a.value,
                    tiles: [],
                    score: 0
                };
            });
        this.logger.debug('done');

        // generate tile list
        this.logger.debug('generating tile list');
        let tiles = ('E'.repeat(12) + 'A'.repeat(9) + 'I'.repeat(9) + 'O'.repeat(8) + 'N'.repeat(6) + 'R'.repeat(6) + 'T'.repeat(6) + 'L'.repeat(4) + 'S'.repeat(4) + 'U'.repeat(4)
            + 'D'.repeat(4) + 'G'.repeat(3)
            + 'B'.repeat(2) + 'C'.repeat(2) + 'M'.repeat(2) + 'P'.repeat(2)
            + 'F'.repeat(2) + 'H'.repeat(2) + 'V'.repeat(2) + 'W'.repeat(2) + 'Y'.repeat(2)
            + 'KJXQZ'
        ).split('');

        tiles.push('blank');
        tiles.push('blank');
        this.logger.debug('done');

        // randomly shuffle tiles
        this.logger.debug('shuffling tile list');
        initialState.tiles = tiles.map((a) => ({sort: Math.random(), value: a}))
            .sort((a, b) => a.sort - b.sort)
            .map((a) => a.value);
        this.logger.debug('done');

        let gameState = initialState;

        // save game state
        this.logger.debug('saving game');
        await this.saveGame(initialState);
        this.logger.debug('done');

        // display initial board
        const board = await this.getBoardString(initialState);

        let message = gameState.players.map(p => `<@${p.id}|${p.username}>`).join('\n');
        message += `\n\nA new Scrabble game has been started! <@${initialState.players[0].id}|${initialState.players[0].username}> goes first!`;
        message += `\n\n${board}`;

        await this.slackService.postMessage({
            text: message,
            channel: this.channel
        });

        // show each player their tiles
        for (const player of gameState.players) {
            await this.displayPlayerRack(player.id);
        }
    }

    async displayPlayerRack(playerId) {
        const gameState = await this.loadGame();
        if (gameState == null) {
            // TODO: return no game active for channel message
            return;
        }

        const playerIndex = gameState.players.findIndex(p => p.id === playerId);
        const playerTiles = gameState.players[playerIndex].tiles;

        // ensure player always has 7 tiles
        while (playerTiles.length < 7) {
            const index = Math.floor((Math.random() * gameState.tiles.length));
            const tile = gameState.tiles[index];
            playerTiles.push(tile);
            gameState.tiles.splice(index, 1);
        }

        gameState.players[playerIndex].tiles = playerTiles;

        await this.saveGame(gameState);

        const rack = await textConverterHelper.textToScrabbleTiles(playerTiles.map(t => t === 'blank' ? ':blank:' : t).join(' '));

        await this.slackService.postEphemeral({
            text: rack,
            channel: gameState.channel,
            user: gameState.players[playerIndex].id
        });
    }

    async getBoardString(gameState) {
        const board = gameState.board;
        let boardString = '';
        // for each row on the board
        for (const row of board) {
            for (const col of row) {
                // convert letters to scrabble tiles
                if (col.length === 1) {
                    boardString += await textConverterHelper.textToScrabbleTiles(col);
                } else {
                    boardString += `:${col}:`;
                }
            }

            boardString += '\n';
        }

        return boardString;
    }
}

module.exports = ScrabbleGame;

/*
 * TODO
 * command for exchanging tiles
 * command to play a word
*/
